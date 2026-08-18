import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import "./Canvas3D.css";

// Alturas regulamentares padrão (em metros)
const ALTURAS = {
  lampada: 2.7, lampada_simples: 2.7, lampada_spot: 2.7,
  lampada_tubular: 2.7, lampada_led: 2.7, lampada_led_fita: 2.7, lampada_pendente: 2.5,
  lampada_arandela: 1.8, lampada_jardim: 0.2, // LED de jardim: centro do espeto a 20cm do chão
  tomada: 0.3, tomada_baixa: 0.3, tomada_media: 1.1, tomada_alta: 2.0,
  tomada_trifasica: 1.1, tomada_sensor: 1.1, tomada_dupla: 0.3, tomada_tripla: 0.3,
  telefonia: 0.3, dados: 0.3, tv: 1.1, campainha: 2.2, camera: 2.5,
  passagem_sobe: 1.5, passagem_desce: 1.5,
  caixa_passagem: 2.8, // default 280cm, sobrescrito pelo rotulo JSON
  interruptor: 1.1, interruptor_simples: 1.1, interruptor_duplo: 1.1,
  interruptor_triplo: 1.1, interruptor_intermediario: 1.1, interruptor_paralelo: 1.1,
  interruptor_dimmer: 1.1, interruptor_pulsador: 1.1,
  quadro: 1.5, outro: 1.0,
};

const CORES_COMP = {
  lampada: 0xf59e0b, lampada_simples: 0xf59e0b, lampada_arandela: 0xf59e0b,
  lampada_spot: 0xf59e0b, lampada_tubular: 0xf59e0b, lampada_led: 0xf59e0b,
  lampada_led_fita: 0xf59e0b,
  lampada_pendente: 0xf59e0b, lampada_jardim: 0xfbbf24, // âmbar quente de jardim
  tomada: 0x3b82f6, tomada_baixa: 0x3b82f6, tomada_media: 0x3b82f6,
  tomada_alta: 0x3b82f6, tomada_trifasica: 0x3b82f6, tomada_sensor: 0x3b82f6,
  tomada_dupla: 0x3b82f6, tomada_tripla: 0x3b82f6,
  telefonia: 0xec4899, dados: 0xec4899, tv: 0xec4899, campainha: 0xec4899, camera: 0xec4899,
  passagem_sobe: 0x8b5cf6, passagem_desce: 0x8b5cf6,
  interruptor: 0x22c55e, interruptor_simples: 0x22c55e, interruptor_duplo: 0x22c55e,
  interruptor_triplo: 0x22c55e, interruptor_intermediario: 0x22c55e, interruptor_paralelo: 0x22c55e,
  interruptor_dimmer: 0x22c55e, interruptor_pulsador: 0x22c55e,
  quadro: 0xef4444, outro: 0x8b5cf6,
};

// Layer para bloom seletivo (apenas a fita LED bloom, resto da cena não)
const BLOOM_LAYER = 1;

// ─── Helper: Textura de gradiente radial de alta qualidade (Glow / Halo) ──────
let glowTextureCache = null;
function getGlowTexture() {
  if (glowTextureCache) return glowTextureCache;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  // Gradiente exponencial para um brilho mais natural
  grad.addColorStop(0.0, "rgba(255, 253, 230, 1.0)");
  grad.addColorStop(0.1, "rgba(255, 253, 230, 0.8)");
  grad.addColorStop(0.3, "rgba(255, 240, 150, 0.4)");
  grad.addColorStop(0.6, "rgba(255, 240, 150, 0.05)");
  grad.addColorStop(1.0, "rgba(255, 240, 150, 0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  glowTextureCache = new THREE.CanvasTexture(canvas);
  glowTextureCache.flipY = false;
  return glowTextureCache;
}

// ─── Helper: Textura de pontos LED discretos para fita LED ─────────────────
let ledStripTextureCache = null;
function getLedStripTexture() {
  if (ledStripTextureCache) return ledStripTextureCache;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 16, 64);
  // Gradiente radial: ponto LED brilhante no centro do tile
  const grad = ctx.createRadialGradient(8, 32, 0, 8, 32, 6);
  grad.addColorStop(0.0, "rgba(255, 253, 220, 1.0)");
  grad.addColorStop(0.3, "rgba(255, 240, 150, 0.8)");
  grad.addColorStop(0.6, "rgba(255, 220, 80, 0.3)");
  grad.addColorStop(1.0, "rgba(255, 220, 80, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 64);
  ledStripTextureCache = new THREE.CanvasTexture(canvas);
  ledStripTextureCache.wrapS = THREE.RepeatWrapping;
  ledStripTextureCache.wrapT = THREE.RepeatWrapping;
  ledStripTextureCache.flipY = false;
  return ledStripTextureCache;
}

// ─── Helper: obter geometria e metadados de um componente ─────────────────────
function getComponentGeometry(c, overrideY) {
  const baseAlt = ALTURAS[c.tipo] || ALTURAS.outro;
  // Para lampada_pendente, overrideY é a altura do TETO (não a posição da lâmpada)
  const yAlt = (c.tipo === "lampada_pendente") ? baseAlt : (overrideY != null ? overrideY : baseAlt);
  const cor = CORES_COMP[c.tipo] || CORES_COMP.outro;
  let geom = null;
  let extraMesh = null;
  let yFinal = yAlt;

  if (c.tipo.startsWith("lampada")) {
    if (c.tipo === "lampada_tubular") {
      geom = new THREE.BoxGeometry(0.6, 0.04, 0.08);
    } else if (c.tipo === "lampada_led") {
      geom = new THREE.BoxGeometry(0.5, 0.01, 0.02);
    } else if (c.tipo === "lampada_pendente") {
      geom = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16);
      // O cabo desce do teto até à lâmpada pendente
      const tectoAltura = overrideY != null ? overrideY : 2.7;
      const alturaCabo = tectoAltura - yAlt;
      if (alturaCabo > 0) {
        const caboGeom = new THREE.CylinderGeometry(0.003, 0.003, alturaCabo, 8);
        const caboMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        extraMesh = new THREE.Mesh(caboGeom, caboMat);
        extraMesh.position.set(c.x, yAlt + alturaCabo / 2, c.y);
      }
    } else if (c.tipo === "lampada_arandela") {
      geom = new THREE.SphereGeometry(0.05, 16, 16);
      const hasteGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8);
      hasteGeom.rotateZ(Math.PI / 2);
      const hasteMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      extraMesh = new THREE.Mesh(hasteGeom, hasteMat);
      extraMesh.position.set(c.x - 0.04, yAlt, c.y);
    } else if (c.tipo === "lampada_spot") {
      geom = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16);
    } else if (c.tipo === "lampada_jardim") {
      // LED de jardim: espeto fino no chão (0 → 0.3m) + cabeça cónica a apontar para cima
      // Geometria centrada para o mesh ser colocado a yFinal=0.2 (centro do conjunto)
      const spikeGeom = new THREE.CylinderGeometry(0.008, 0.014, 0.3, 6);
      spikeGeom.translate(0, -0.05, 0); // base do espeto em y=0 (chão), topo em 0.3
      const headGeom = new THREE.ConeGeometry(0.045, 0.12, 8);
      headGeom.translate(0, 0.16, 0); // cabeça cónica: 0.3 → 0.42, a apontar para cima
      const mergedGeom = mergeGeometries([spikeGeom, headGeom]);
      if (mergedGeom) {
        geom = mergedGeom;
        spikeGeom.dispose();
        headGeom.dispose();
      } else {
        // Fallback (raro): usar apenas o espeto e libertar a cabeça não usada
        geom = spikeGeom;
        headGeom.dispose();
      }
    } else if (c.tipo === "lampada_led_fita") {
      // Fita LED: sem geometria fixa, renderizada como polyline 3D
      geom = null;
    } else {
      geom = new THREE.SphereGeometry(0.08, 16, 16);
    }
  } else if (c.tipo.startsWith("tomada")) {
    if (c.tipo === "tomada_dupla") {
      geom = new THREE.BoxGeometry(0.12, 0.08, 0.02);
    } else if (c.tipo === "tomada_tripla") {
      geom = new THREE.BoxGeometry(0.18, 0.08, 0.02);
    } else if (c.tipo === "tomada_trifasica") {
      geom = new THREE.BoxGeometry(0.12, 0.12, 0.08);
    } else {
      geom = new THREE.BoxGeometry(0.06, 0.1, 0.02);
    }
  } else if (c.tipo.startsWith("interruptor")) {
    let width = 0.08;
    if (c.tipo === "interruptor_duplo") width = 0.14;
    else if (c.tipo === "interruptor_triplo") width = 0.20;
    geom = new THREE.BoxGeometry(width, 0.08, 0.02);
    const numSwitches = c.tipo === "interruptor_duplo" ? 2 : c.tipo === "interruptor_triplo" ? 3 : 1;
    return { geom, cor, yFinal, extraMesh, yAlt, numSwitches };
  } else if (c.tipo === "quadro") {
    geom = new THREE.BoxGeometry(0.3, 0.4, 0.06);
  } else if (c.tipo.startsWith("caixa_passagem")) {
    // Parsear altura do rotulo JSON (mm -> metros). Ex: "280,00" -> 2.80m
    let alturaM = ALTURAS.caixa_passagem;
    try {
      const parsed = JSON.parse(c.rotulo || "{}");
      if (parsed?.altura) {
        const altMm = parseFloat(String(parsed.altura).replace(",", "."));
        if (!isNaN(altMm) && altMm > 0) {
          alturaM = altMm / 1000; // mm para metros
        }
      }
    } catch { }
    geom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    yFinal = alturaM;
  } else if (c.tipo.startsWith("passagem")) {
    geom = new THREE.CylinderGeometry(0.02, 0.02, 2.8, 8);
    yFinal = 1.4;
  } else if (c.tipo === "camera") {
    geom = new THREE.BoxGeometry(0.06, 0.06, 0.12);
  } else {
    geom = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  }

  return { geom, cor, yFinal, extraMesh, yAlt };
}

// ─── Helper: calcular posição 3D de um componente (rente à parede) ───────────
function getComponentPosition3D(c, yFinal) {
  const isWallComp = c.tipo.startsWith("tomada") || c.tipo.startsWith("interruptor") || c.tipo === "quadro";
  let posX = c.x;
  let posZ = -c.y;

  if (isWallComp) {
    // Projetar para a superfície da parede (metade da espessura 0.06m + espelho 0.005m)
    const rotRad = ((c.rotacao || 0) * Math.PI) / 180;
    const surfaceOffset = 0.065;
    posX += Math.sin(rotRad) * surfaceOffset;
    posZ -= Math.cos(rotRad) * surfaceOffset;
  }

  return { posX, posY: yFinal || ALTURAS[c.tipo] || ALTURAS.outro, posZ };
}

// ─── Gera uma chave de grupo para InstancedMesh ─────────────────────────────
function getGeometryGroupKey(geom, cor) {
  if (!geom) return null;
  // BoxGeometry, SphereGeometry, CylinderGeometry, RingGeometry
  const type = geom.type;
  const params = geom.parameters;
  // Serializar parâmetros de forma determinística
  let paramStr = "";
  if (type === "BoxGeometry") {
    paramStr = `${params.width.toFixed(4)}_${params.height.toFixed(4)}_${params.depth.toFixed(4)}`;
  } else if (type === "SphereGeometry") {
    paramStr = `${params.radius.toFixed(4)}_${params.widthSegments}_${params.heightSegments}`;
  } else if (type === "CylinderGeometry") {
    paramStr = `${params.radiusTop.toFixed(4)}_${params.radiusBottom.toFixed(4)}_${params.height.toFixed(4)}_${params.radialSegments}`;
  } else {
    return null; // geometry complexa demais para instancing
  }
  return `${type}|${paramStr}|${cor.toString(16)}`;
}

// ─── Disposal rigoroso de objetos Three.js ──────────────────────────────────
function disposeObject(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.geometry && typeof obj.geometry.dispose === 'function' && !obj.geometry._disposed) {
    obj.geometry.dispose();
    obj.geometry._disposed = true;
  }
  if (obj.material) {
    if (Array.isArray(obj.material)) {
      obj.material.forEach(m => { if (m && typeof m.dispose === 'function' && !m._disposed) { m.dispose(); m._disposed = true; } });
    } else if (typeof obj.material.dispose === 'function' && !obj.material._disposed) {
      obj.material.dispose();
      obj.material._disposed = true;
    }
  }
  // Dispose recursivo de children (Sprites, Groups, etc.)
  if (obj.children && obj.children.length > 0) {
    // Clone array porque children pode ser modificado durante iteração
    [...obj.children].forEach(child => disposeObject(child));
  }
  // Dispose de textures em materiais
  if (obj.material) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (mat && mat.map && typeof mat.map.dispose === 'function' && !mat.map._disposed) {
        mat.map.dispose();
        mat.map._disposed = true;
      }
    });
  }
}

/**
 * Percorre todos os objetos de uma cena Three.js e faz dispose recursivo.
 * Isto é necessário porque scene.clear() apenas remove referências sem libertar
 * memória GPU (geometrias, materiais, texturas).
 */
function disposeScene(scene) {
  if (!scene) return;
  // Percorre todos os objetos na cena (incluindo groups aninhados)
  scene.traverse(obj => disposeObject(obj));
}

// Helper de distância ponto a segmento de reta (ao quadrado) para colisão de paredes
const pointToSegmentDistSq = (px, pz, x1, z1, x2, z2) => {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return (px - x1) * (px - x1) + (pz - z1) * (pz - z1);
  let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  const distX = px - projX;
  const distZ = pz - projZ;
  return distX * distX + distZ * distZ;
};

export default function Canvas3D({
  geometria, componentes, conexoes, circuitos = [], rooms = [], onClose,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [wallOpacity, setWallOpacity] = useState(0.3);
  const [layerConfigs, setLayerConfigs] = useState({});
  const [modoDiaNoite, setModoDiaNoite] = useState(
    document.documentElement.getAttribute("data-theme") === "light" ? "dia" : "noite"
  );

  // ─── Estado de Navegação (Orbital vs 1ª Pessoa) ──────────────────────────
  const [modoNavegacao, setModoNavegacao] = useState("orbit"); // "orbit" | "firstPerson"
  const [isLocked, setIsLocked] = useState(false);
  const modoNavegacaoRef = useRef("orbit");
  modoNavegacaoRef.current = modoNavegacao;

  const fpsControlsRef = useRef(null);
  const keysPressedRef = useRef({});
  const wallsRef = useRef([]); // Lista de paredes para colisão em 1ª pessoa
  const floorMinXRef = useRef(Infinity);
  const floorMaxXRef = useRef(-Infinity);
  const floorMinZRef = useRef(Infinity);
  const floorMaxZRef = useRef(-Infinity);
  const lastFrameTimeRef = useRef(performance.now());

  // ─── Estado do Teto 3D ──────────────────────────────────────────────────
  const [tetoVisivel, setTetoVisivel] = useState(true);
  const [tetoOpacidade, setTetoOpacidade] = useState(0.3);
  const tetoOpacidadeRef = useRef(0.3);
  const tetoMeshesRef = useRef([]);
  const tetoMatRef = useRef(null);   // material partilhado para todas as placas de teto
  const [alturasPorRoom, setAlturasPorRoom] = useState({});
  const [alturasPorCamada, setAlturasPorCamada] = useState({});

  // Refs para objetos Three.js que precisam de disposal
  const sceneObjectsRef = useRef([]);
  const geometriesRef = useRef([]);
  const materialsRef = useRef([]);
  const conduitMeshesRef = useRef([]);  // Meshes de condutos para controlo de visibilidade
  const extraMeshesRef = useRef([]);
  const wallOpacityRef = useRef(0.3);  // Espelho do wallOpacity para evitar stale closure

  // Refs para o loop de render
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const savedCameraPosRef = useRef(null);
  const savedCameraTargetRef = useRef(null);
  const needsRenderRef = useRef(false);
  const animFrameIdRef = useRef(null);
  const isDisposedRef = useRef(false);
  const bloomComposerRef = useRef(null);
  const finalComposerRef = useRef(null);
  const bloomBlendPassRef = useRef(null);
  const origMatsRef = useRef({});
  const darkMatRef = useRef(new THREE.MeshBasicMaterial({ color: 0x000000 }));

  // ─── Vetores pré-alocados para evitar GC pressure no updateFirstPersonMovement ──
  const fpsDirVecRef = useRef(new THREE.Vector3());
  const fpsRightVecRef = useRef(new THREE.Vector3());
  const fpsMoveVecRef = useRef(new THREE.Vector3());
  const fpsUpVecRef = useRef(new THREE.Vector3(0, 1, 0));
  // Cor preta reutilizável para o fundo do bloom (evita new Color por frame)
  const bloomBlackBgRef = useRef(new THREE.Color(0x000000));
  // ─── Bloom seletivo otimizado: pré-classificação de meshes ────────────────
  const nonBloomMeshesRef = useRef([]);   // Meshes sem bloom layer (para swap rápido)
  const hasBloomObjectsRef = useRef(false); // Flag: há objetos com bloom?
  // ─── PointLights dinâmicas por distância à câmara (max 12) ──────────────
  const lampStateMapRef = useRef(new Map()); // Mapa lampId → { pointLight, isOn, hasPower, ... }
  const updatePointLightsByDistanceRef = useRef(null); // Callback p/ renderLoop
  let lastPointLightUpdate = 0;

  // ─── Lógica de Movimento em 1ª Pessoa com Colisão ─────────────────────────
  const updateFirstPersonMovement = useCallback((delta) => {
    const camera = cameraRef.current;
    if (!camera) return;

    const keys = keysPressedRef.current;
    const moveFwd = keys["KeyW"] || keys["w"] || keys["W"] || keys["ArrowUp"];
    const moveBwd = keys["KeyS"] || keys["s"] || keys["S"] || keys["ArrowDown"];
    const moveLeft = keys["KeyA"] || keys["a"] || keys["A"] || keys["ArrowLeft"];
    const moveRight = keys["KeyD"] || keys["d"] || keys["D"] || keys["ArrowRight"];

    if (!moveFwd && !moveBwd && !moveLeft && !moveRight) return;

    const speed = 4.0; // metros por segundo
    // Reutilizar vetores pré-alocados (evita ~240 alocações/s em FPS a 60fps)
    const dir = fpsDirVecRef.current;
    camera.getWorldDirection(dir);
    dir.y = 0; // movimento no plano XZ
    if (dir.lengthSq() > 0) dir.normalize();

    const right = fpsRightVecRef.current;
    right.crossVectors(dir, fpsUpVecRef.current).normalize();

    const moveVec = fpsMoveVecRef.current.set(0, 0, 0);
    if (moveFwd) moveVec.add(dir);
    if (moveBwd) moveVec.sub(dir);
    if (moveLeft) moveVec.sub(right);
    if (moveRight) moveVec.add(right);

    if (moveVec.lengthSq() === 0) return;
    moveVec.normalize().multiplyScalar(speed * delta);

    const radius = 0.35; // raio de colisão do corpo (35 cm)
    const radiusSq = radius * radius;
    const walls = wallsRef.current;

    // Testar movimento no eixo X com colisão
    const tryX = camera.position.x + moveVec.x;
    let collideX = false;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (pointToSegmentDistSq(tryX, camera.position.z, w.x1, w.z1, w.x2, w.z2) < radiusSq) {
        collideX = true;
        break;
      }
    }
    if (!collideX) {
      camera.position.x = tryX;
    }

    // Testar movimento no eixo Z com colisão
    const tryZ = camera.position.z + moveVec.z;
    let collideZ = false;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (pointToSegmentDistSq(camera.position.x, tryZ, w.x1, w.z1, w.x2, w.z2) < radiusSq) {
        collideZ = true;
        break;
      }
    }
    if (!collideZ) {
      camera.position.z = tryZ;
    }

    // Fixar altura dos olhos a 1.65m do chão
    camera.position.y = 1.65;
  }, []);

  // ─── Render on Demand & Frame Loop ───────────────────────────────────────
  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
    if (!animFrameIdRef.current && !isDisposedRef.current) {
      animFrameIdRef.current = requestAnimationFrame(function renderLoop() {
        animFrameIdRef.current = null;
        if (isDisposedRef.current) return;

        const now = performance.now();
        const delta = Math.min(0.1, (now - (lastFrameTimeRef.current || now)) / 1000);
        lastFrameTimeRef.current = now;

        if (modoNavegacaoRef.current === "firstPerson") {
          updateFirstPersonMovement(delta);
          needsRenderRef.current = true;
        } else {
          controlsRef.current?.update();
        }

        // Gerir PointLights por distância (a cada 0.5s, só as 12 mais próximas)
        updatePointLightsByDistanceRef.current?.();

        if (needsRenderRef.current) {
          const bScene = sceneRef.current;
          const bloomC = bloomComposerRef.current;
          const finalC = finalComposerRef.current;
          const blendPass = bloomBlendPassRef.current;
          const hasBloom = hasBloomObjectsRef.current;

          // Em 1ª pessoa: saltar bloom e usar renderização direta (performance > efeito visual)
          const isFPS = modoNavegacaoRef.current === "firstPerson";
          if (!isFPS && hasBloom && bloomC && finalC && blendPass) {
            // 1. Guardar background original e escurecer meshes não-bloom (pré-classificados)
            const origBg = bScene.background;
            bScene.background = bloomBlackBgRef.current;
            const mats = origMatsRef.current;
            const darkMat = darkMatRef.current;
            const nonBloom = nonBloomMeshesRef.current;
            for (let i = 0; i < nonBloom.length; i++) {
              const obj = nonBloom[i];
              mats[obj.uuid] = obj.material;
              obj.material = darkMat;
            }

            // 2. Renderizar bloom (a 50% resolução)
            bloomC.render();

            // 3. Restaurar materiais e background
            bScene.background = origBg;
            for (let i = 0; i < nonBloom.length; i++) {
              const obj = nonBloom[i];
              obj.material = mats[obj.uuid];
            }
            // Limpar o map de materiais
            origMatsRef.current = {};

            // 4. Compor final (cena normal + bloom sobreposto)
            blendPass.uniforms.bloomTexture.value = bloomC.renderTarget2.texture;
            finalC.render();
          } else {
            // Renderização direta (sem bloom): 1 único render
            rendererRef.current?.render(bScene, cameraRef.current);
          }

          needsRenderRef.current = false;
        }

        if (modoNavegacaoRef.current === "firstPerson" && !isDisposedRef.current) {
          animFrameIdRef.current = requestAnimationFrame(renderLoop);
        }
      });
    }
  }, [updateFirstPersonMovement]);

  // Inicializar configurações de camadas DXF automáticas
  useEffect(() => {
    if (geometria && geometria.camadas) {
      const initialConfigs = {};
      geometria.camadas.forEach((camada) => {
        const name = camada.toLowerCase();
        if (name.includes("wall") || name.includes("parede") || name.includes("alv") || name.includes("masonry") || name.includes("divisoria") || name.includes("structure") || name.includes("pilar") || name.includes("coluna")) {
          initialConfigs[camada] = "parede";
        } else if (name.includes("wind") || name.includes("jan") || name === "4" || name === "5") {
          if (name.includes("door") || name.includes("port")) {
            initialConfigs[camada] = "porta";
          } else {
            initialConfigs[camada] = "janela";
          }
        } else if (name.includes("door") || name.includes("port") || name.includes("vao") || name.includes("soleira")) {
          initialConfigs[camada] = "porta";
        } else if (name.includes("teto") || name.includes("forro") || name.includes("ceiling") || name.includes("rcp") || name.includes("plafond")) {
          initialConfigs[camada] = "teto";
        } else {
          initialConfigs[camada] = "mobiliario";
        }
      });
      setLayerConfigs(initialConfigs);
    }
  }, [geometria]);

  const handleLayerConfigChange = useCallback((layer, type) => {
    setLayerConfigs((prev) => ({ ...prev, [layer]: type }));
  }, []);

  // ─── Efeito principal de render 3D ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;
    if (geometria && Object.keys(layerConfigs).length === 0) return;

    isDisposedRef.current = false;
    // Resetar refs de tracking para rebuild de cena
    lampStateMapRef.current = new Map();
    nonBloomMeshesRef.current = [];
    hasBloomObjectsRef.current = false;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const isDia = modoDiaNoite === "dia";

    // 1. Cenário e Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDia ? 0xf1f5f9 : 0x0f172a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // ─── Selective Bloom: dois compositors (bloom + final) ──────────────────
    // Bloom a 50% da resolução nativa (efeito difuso não precisa de detalhe total)
    const bloomW = Math.floor(width * 0.5);
    const bloomH = Math.floor(height * 0.5);
    const bloomC = new EffectComposer(renderer);
    bloomC.addPass(new RenderPass(scene, camera));
    bloomC.addPass(new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH), 1.2, 0.3, 0.9
    ));
    bloomC.setSize(bloomW, bloomH);
    bloomComposerRef.current = bloomC;

    const finalC = new EffectComposer(renderer);
    finalC.addPass(new RenderPass(scene, camera));
    // Shader para compor: cena normal + bloom em cima
    const blendMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        bloomTexture: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec4 bloom = texture2D(bloomTexture, vUv);
          gl_FragColor = base + bloom;
        }
      `,
    });
    const blendPass = new ShaderPass(blendMat);
    finalC.addPass(blendPass);
    // OutputPass removido: tone mapping desnecessário para visualização 3D (poupa GPU)
    finalComposerRef.current = finalC;
    bloomBlendPassRef.current = blendPass;

    // 2. Controlos da Câmara (Orbital + 1ª Pessoa)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.addEventListener("change", () => requestRender());
    controlsRef.current = controls;

    const fpsControls = new PointerLockControls(camera, renderer.domElement);
    fpsControlsRef.current = fpsControls;

    fpsControls.addEventListener("lock", () => {
      setIsLocked(true);
      requestRender();
    });
    fpsControls.addEventListener("unlock", () => {
      setIsLocked(false);
      requestRender();
    });
    fpsControls.addEventListener("change", () => {
      requestRender();
    });

    const handleKeyDown = (e) => {
      if (modoNavegacaoRef.current !== "firstPerson") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      keysPressedRef.current[e.code] = true;
      keysPressedRef.current[e.key] = true;
      if (e.key) keysPressedRef.current[e.key.toLowerCase()] = true;
      requestRender();
    };

    const handleKeyUp = (e) => {
      if (modoNavegacaoRef.current !== "firstPerson") return;
      keysPressedRef.current[e.code] = false;
      keysPressedRef.current[e.key] = false;
      if (e.key) keysPressedRef.current[e.key.toLowerCase()] = false;
    };

    const handleCanvasClick = (e) => {
      if (modoNavegacaoRef.current === "firstPerson" && fpsControlsRef.current && !fpsControlsRef.current.isLocked) {
        if (e.target.closest && e.target.closest(".canvas3d-card")) return;
        fpsControlsRef.current.lock();
      }
    };

    const domElem = renderer.domElement;
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    domElem.addEventListener("click", handleCanvasClick);

    // 3. Luzes (Dia vs Noite)
    const ambColor = isDia ? 0xffffff : 0x38bdf8;
    const ambIntensity = isDia ? 0.8 : 0.35;
    const ambientLight = new THREE.AmbientLight(ambColor, ambIntensity);
    scene.add(ambientLight);
    sceneObjectsRef.current.push(ambientLight);

    const dirColor = isDia ? 0xfffaed : 0x94a3b8;
    const dirIntensity = isDia ? 1.2 : 0.4;
    const dirLight = new THREE.DirectionalLight(dirColor, dirIntensity);
    dirLight.position.set(20, 50, 20);
    scene.add(dirLight);
    sceneObjectsRef.current.push(dirLight);

    const skyColor = isDia ? 0xe0f2fe : 0x1e293b;
    const groundColor = isDia ? 0x94a3b8 : 0x0f172a;
    const hemiIntensity = isDia ? 0.7 : 0.3;
    const hemiLight = new THREE.HemisphereLight(skyColor, groundColor, hemiIntensity);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
    sceneObjectsRef.current.push(hemiLight);

    // 4. Determinar centro e limites (com Z = -Y)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

    rooms.forEach((r) => {
      try {
        const geojson = JSON.parse(r.poligono_geojson);
        if (geojson.coordinates && geojson.coordinates[0]) {
          geojson.coordinates[0].forEach((pt) => {
            minX = Math.min(minX, pt[0]);
            maxX = Math.max(maxX, pt[0]);
            minZ = Math.min(minZ, -pt[1]);
            maxZ = Math.max(maxZ, -pt[1]);
          });
        }
      } catch (e) { }
    });

    if (geometria) {
      (geometria.linhas || []).forEach((l) => {
        minX = Math.min(minX, l.x1, l.x2);
        maxX = Math.max(maxX, l.x1, l.x2);
        minZ = Math.min(minZ, -l.y1, -l.y2);
        maxZ = Math.max(maxZ, -l.y1, -l.y2);
      });
      (geometria.polilinhas || []).forEach((poli) => {
        (poli.pontos || []).forEach((pt) => {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minZ = Math.min(minZ, -pt.y);
          maxZ = Math.max(maxZ, -pt.y);
        });
      });
    }

    (componentes || []).forEach((c) => {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, -c.y);
      maxZ = Math.max(maxZ, -c.y);
    });

    if (minX === Infinity) {
      minX = -10; maxX = 10; minZ = -10; maxZ = 10;
    }

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const maxDim = Math.max(maxX - minX, maxZ - minZ, 10);

    if (savedCameraPosRef.current && savedCameraTargetRef.current) {
      camera.position.copy(savedCameraPosRef.current);
      controls.target.copy(savedCameraTargetRef.current);
    } else {
      camera.position.set(centerX, maxDim * 1.0, centerZ + maxDim * 1.0);
      controls.target.set(centerX, 0, centerZ);
    }
    controls.update();

    // 5. Grelha
    const gridCenterColor = isDia ? 0x94a3b8 : 0x4b5563;
    const gridLineColor = isDia ? 0xcbd5e1 : 0x1f2937;
    const gridDivisions = Math.min(40, Math.max(10, Math.ceil(maxDim)));
    const gridHelper = new THREE.GridHelper(Math.max(maxDim * 1.5, 20), gridDivisions, gridCenterColor, gridLineColor);
    gridHelper.position.set(centerX, -0.05, centerZ);
    scene.add(gridHelper);
    sceneObjectsRef.current.push(gridHelper);

    // ─── Recolher materiais para controlo de opacidade ──────────────────────
    const trackedMaterials = [];
    materialsRef.current = trackedMaterials;

    // Variáveis de teto DXF e paredes (preenchidas dentro do bloco geometria, usadas na secção 7b)
    const tetoLinePoints = [];
    const wallsToCreate = [];
    let floorMinX = Infinity, floorMaxX = -Infinity, floorMinZ = Infinity, floorMaxZ = -Infinity;
    let tetoMinX = Infinity, tetoMaxX = -Infinity, tetoMinZ = Infinity, tetoMaxZ = -Infinity;
    let hasTetoLines = false;
    let tetoOffsetX = 0, tetoOffsetZ = 0;
    let maxWallHeight = 2.8;
    // Helpers para pé-direito e divisão por coordenada
    const altParede_teto = 2.8; // altura padrão do pé-direito
    const getAltTeto = (roomId) => (alturasPorRoom && alturasPorRoom[roomId]) || altParede_teto;

    const getRoomParaComponente = (cx, cy) => {
      for (const room of (rooms || [])) {
        try {
          const geojson = JSON.parse(room.poligono_geojson);
          if (!geojson.coordinates || !geojson.coordinates[0]) continue;
          const coords = geojson.coordinates[0];
          const rx0 = coords[0][0], ry0 = coords[0][1];
          const rx1 = coords[2][0], ry1 = coords[2][1];
          const rMinX = Math.min(rx0, rx1), rMaxX = Math.max(rx0, rx1);
          const rMinY = Math.min(ry0, ry1), rMaxY = Math.max(ry0, ry1);
          if (cx >= rMinX && cx <= rMaxX && cy >= rMinY && cy <= rMaxY) {
            return room;
          }
        } catch { }
      }
      return null;
    };

    // ─── 6. Geometria DXF ───────────────────────────────────────────────────
    if (geometria) {
      const linePoints = [];
      const espessura = 0.15;
      const altParede = 2.8;

      const dxfWallMat = new THREE.MeshStandardMaterial({
        color: 0x7f8c8d, roughness: 0.9, metalness: 0.0,
        transparent: true, opacity: wallOpacityRef.current, side: THREE.DoubleSide,
      });
      trackedMaterials.push(dxfWallMat);

      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8, roughness: 0.1, metalness: 0.9,
        transparent: true, opacity: 0.45, side: THREE.DoubleSide,
      });
      trackedMaterials.push(glassMat);

      const linesForAnalysis = [];

      (geometria.linhas || []).forEach((l) => {
        linesForAnalysis.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, layer: l.layer });
      });

      (geometria.polilinhas || []).forEach((poli) => {
        if (!poli.pontos || poli.pontos.length < 2) return;
        for (let j = 0; j < poli.pontos.length - 1; j++) {
          linesForAnalysis.push({
            x1: poli.pontos[j].x, y1: poli.pontos[j].y,
            x2: poli.pontos[j + 1].x, y2: poli.pontos[j + 1].y, layer: poli.layer,
          });
        }
        if (poli.fechada) {
          linesForAnalysis.push({
            x1: poli.pontos[poli.pontos.length - 1].x, y1: poli.pontos[poli.pontos.length - 1].y,
            x2: poli.pontos[0].x, y2: poli.pontos[0].y, layer: poli.layer,
          });
        }
      });

      // Heurística de janelas
      const isWindowLine = new Array(linesForAnalysis.length).fill(false);
      for (let i = 0; i < linesForAnalysis.length; i++) {
        const l1 = linesForAnalysis[i];
        const name1 = (l1.layer || "").toLowerCase();
        const ehCamadaVao = name1.includes("door") || name1.includes("wind") || name1 === "4" || name1 === "5";
        if (!ehCamadaVao) continue;

        const dx1 = l1.x2 - l1.x1, dy1 = l1.y2 - l1.y1;
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        if (len1 < 0.3 || len1 > 2.4) continue;
        const ux1 = dx1 / len1, uy1 = dy1 / len1;

        for (let k = i + 1; k < linesForAnalysis.length; k++) {
          const l2 = linesForAnalysis[k];
          const name2 = (l2.layer || "").toLowerCase();
          if (!(name2.includes("door") || name2.includes("wind") || name2 === "4" || name2 === "5")) continue;

          const dx2 = l2.x2 - l2.x1, dy2 = l2.y2 - l2.y1;
          const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          if (len2 < 0.3 || len2 > 2.4) continue;
          const ux2 = dx2 / len2, uy2 = dy2 / len2;

          if (Math.abs(ux1 * ux2 + uy1 * uy2) < 0.98) continue;
          const mx = (l1.x1 + l1.x2) / 2, my = (l1.y1 + l1.y2) / 2;
          const dist = Math.abs((l2.x2 - l2.x1) * (l2.y1 - my) - (l2.x1 - mx) * (l2.y2 - l2.y1)) / len2;
          if (dist > 0.02 && dist < 0.35) {
            isWindowLine[i] = true;
            isWindowLine[k] = true;
          }
        }
      }

      const sillsToCreate = [], headersToCreate = [], glassesToCreate = [];

      // ─── Detecção automática de planta de teto (cluster espacial) ──────────
      // Detectar se a geometria DXF contém dois clusters separados por um gap
      // (ex: planta principal + planta de teto lado a lado no DXF)
      const isCeilingLine = new Array(linesForAnalysis.length).fill(false);

      if (linesForAnalysis.length > 50) {
        // Calcular midpoints em X de todas as linhas
        const midXvals = linesForAnalysis.map((l) => (l.x1 + l.x2) / 2);
        const midZvals = linesForAnalysis.map((l) => (-l.y1 + -l.y2) / 2);
        const sortedIndicesX = midXvals.map((v, i) => i).sort((a, b) => midXvals[a] - midXvals[b]);

        // Encontrar o maior gap em X
        let maxGapX = 0, gapSplitX = 0;
        for (let i = 1; i < sortedIndicesX.length; i++) {
          const gap = midXvals[sortedIndicesX[i]] - midXvals[sortedIndicesX[i - 1]];
          if (gap > maxGapX) {
            maxGapX = gap;
            gapSplitX = (midXvals[sortedIndicesX[i]] + midXvals[sortedIndicesX[i - 1]]) / 2;
          }
        }

        // Encontrar o maior gap em Z (Y invertido)
        const sortedIndicesZ = midZvals.map((v, i) => i).sort((a, b) => midZvals[a] - midZvals[b]);
        let maxGapZ = 0, gapSplitZ = 0;
        for (let i = 1; i < sortedIndicesZ.length; i++) {
          const gap = midZvals[sortedIndicesZ[i]] - midZvals[sortedIndicesZ[i - 1]];
          if (gap > maxGapZ) {
            maxGapZ = gap;
            gapSplitZ = (midZvals[sortedIndicesZ[i]] + midZvals[sortedIndicesZ[i - 1]]) / 2;
          }
        }

        // Usar o maior gap entre X e Z, se for significativo (> 20% da dimensão total)
        const rangeX = Math.max(...midXvals) - Math.min(...midXvals);
        const rangeZ = Math.max(...midZvals) - Math.min(...midZvals);
        const useX = maxGapX >= maxGapZ;
        const maxGap = useX ? maxGapX : maxGapZ;
        const gapSplit = useX ? gapSplitX : gapSplitZ;
        const range = useX ? rangeX : rangeZ;

        if (maxGap > range * 0.08 && maxGap > 1.0) {
          // Há dois clusters separados — determinar qual tem os componentes/rooms (planta principal)
          const midVals = useX ? midXvals : midZvals;

          // Contar entidades de cada lado
          let leftCount = 0, rightCount = 0;
          for (let i = 0; i < linesForAnalysis.length; i++) {
            if (midVals[i] < gapSplit) leftCount++;
            else rightCount++;
          }

          // O cluster MENOR é provavelmente a planta de teto
          // Mas verificar com os componentes/rooms se disponíveis
          let ceilingIsLeft = leftCount < rightCount;

          if (componentes && componentes.length > 0) {
            const compMidVal = useX
              ? componentes.reduce((s, c) => s + c.x, 0) / componentes.length
              : componentes.reduce((s, c) => s + (-c.y), 0) / componentes.length;
            // Componentes estão do lado da planta principal (oposto ao teto)
            ceilingIsLeft = compMidVal >= gapSplit;
          }

          if (rooms.length > 0) {
            let roomMidSum = 0;
            rooms.forEach((r) => {
              try {
                const geojson = JSON.parse(r.poligono_geojson);
                const coords = geojson.coordinates[0];
                if (useX) roomMidSum += (coords[0][0] + coords[2][0]) / 2;
                else roomMidSum += (-coords[0][1] + -coords[2][1]) / 2;
              } catch { }
            });
            const roomMidVal = roomMidSum / rooms.length;
            ceilingIsLeft = roomMidVal >= gapSplit;
          }

          // Marcar linhas do cluster teto
          for (let i = 0; i < linesForAnalysis.length; i++) {
            const isCeilingCluster = ceilingIsLeft
              ? midVals[i] < gapSplit
              : midVals[i] >= gapSplit;
            if (isCeilingCluster) {
              isCeilingLine[i] = true;
            }
          }

          console.log(`[Canvas3D] Planta de teto detectada: ${isCeilingLine.filter(Boolean).length} linhas (gap=${maxGap.toFixed(0)} em ${useX ? 'X' : 'Z'})`);
        }
      }

      linesForAnalysis.forEach((l, index) => {
        const z1 = -l.y1;
        const z2 = -l.y2;

        const layer = l.layer;
        const config = layer ? (layerConfigs[layer] || "mobiliario") : "mobiliario";

        // Linhas da planta de teto (por classificação de camada OU detecção espacial)
        if (config === "teto" || isCeilingLine[index]) {
          tetoLinePoints.push({ x1: l.x1, z1, x2: l.x2, z2 });
          tetoMinX = Math.min(tetoMinX, l.x1, l.x2);
          tetoMaxX = Math.max(tetoMaxX, l.x1, l.x2);
          tetoMinZ = Math.min(tetoMinZ, z1, z2);
          tetoMaxZ = Math.max(tetoMaxZ, z1, z2);
          hasTetoLines = true;
          return;
        }

        // Linhas normais (não-teto) — renderizar no chão e processar para paredes/janelas
        linePoints.push(new THREE.Vector3(l.x1, 0.01, z1));
        linePoints.push(new THREE.Vector3(l.x2, 0.01, z2));

        // Actualizar bounding box da planta principal (para calcular offset)
        if (config === "parede" || config === "janela" || config === "porta") {
          floorMinX = Math.min(floorMinX, l.x1, l.x2);
          floorMaxX = Math.max(floorMaxX, l.x1, l.x2);
          floorMinZ = Math.min(floorMinZ, z1, z2);
          floorMaxZ = Math.max(floorMaxZ, z1, z2);
        }

        if (!layer) return;
        if (config === "mobiliario") return;
        const dx = l.x2 - l.x1, dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.15) return;
        const angle = Math.atan2(dz, dx);
        const lineItem = { x1: l.x1, z1, x2: l.x2, z2, len, dx, dz, angle, layer: l.layer };

        if (config === "parede") {
          wallsToCreate.push(lineItem);
        } else if (config === "janela") {
          sillsToCreate.push(lineItem); headersToCreate.push(lineItem); glassesToCreate.push(lineItem);
        } else if (config === "porta" && isWindowLine[index]) {
          sillsToCreate.push(lineItem); headersToCreate.push(lineItem); glassesToCreate.push(lineItem);
        }
      });

      // Calcular offset para alinhar a planta de teto com a planta principal
      if (hasTetoLines && floorMinX !== Infinity) {
        const floorCX = (floorMinX + floorMaxX) / 2;
        const floorCZ = (floorMinZ + floorMaxZ) / 2;
        const tetoCX = (tetoMinX + tetoMaxX) / 2;
        const tetoCZ = (tetoMinZ + tetoMaxZ) / 2;
        tetoOffsetX = floorCX - tetoCX;
        tetoOffsetZ = floorCZ - tetoCZ;
      }

      // D. Paredes em InstancedMesh (com altura dinâmica por camada DXF ou por divisão)
      if (wallsToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedMesh = new THREE.InstancedMesh(baseGeom, dxfWallMat, wallsToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        wallsToCreate.forEach((w, idx) => {
          const midX = (w.x1 + w.x2) / 2;
          const midZ = (w.z1 + w.z2) / 2;
          const room = getRoomParaComponente(midX, -midZ);
          const customLayerH = w.layer ? alturasPorCamada[w.layer] : null;
          const hWall = customLayerH != null ? customLayerH : (room ? getAltTeto(room.id) : altParede);
          if (hWall > maxWallHeight) maxWallHeight = hWall;

          tempPos.set(midX, hWall / 2, midZ);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, hWall, espessura);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          instancedMesh.setMatrixAt(idx, tempMatrix);
        });
        scene.add(instancedMesh);
        sceneObjectsRef.current.push(instancedMesh);
        console.log(`[Canvas3D] Paredes: ${wallsToCreate.length}, altMax=${maxWallHeight.toFixed(2)}m`);
      }

      // E. Peitoris (adaptados à altura da parede da divisão)
      if (sillsToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedSills = new THREE.InstancedMesh(baseGeom, dxfWallMat, sillsToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        sillsToCreate.forEach((w, idx) => {
          const midX = (w.x1 + w.x2) / 2;
          const midZ = (w.z1 + w.z2) / 2;
          const room = getRoomParaComponente(midX, -midZ);
          const hWall = room ? getAltTeto(room.id) : 2.8;
          const sillH = Math.min(0.9, hWall * 0.32);

          tempPos.set(midX, sillH / 2, midZ);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, sillH, espessura);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          instancedSills.setMatrixAt(idx, tempMatrix);
        });
        scene.add(instancedSills);
        sceneObjectsRef.current.push(instancedSills);
      }

      // F. Vergas (adaptadas à altura da parede da divisão)
      if (headersToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedHeaders = new THREE.InstancedMesh(baseGeom, dxfWallMat, headersToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        headersToCreate.forEach((w, idx) => {
          const midX = (w.x1 + w.x2) / 2;
          const midZ = (w.z1 + w.z2) / 2;
          const room = getRoomParaComponente(midX, -midZ);
          const hWall = room ? getAltTeto(room.id) : 2.8;
          const glassTop = Math.min(2.1, hWall - 0.2);
          const headerH = Math.max(0.2, hWall - glassTop);

          tempPos.set(midX, glassTop + headerH / 2, midZ);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, headerH, espessura);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          instancedHeaders.setMatrixAt(idx, tempMatrix);
        });
        scene.add(instancedHeaders);
        sceneObjectsRef.current.push(instancedHeaders);
      }

      // G. Vidros (adaptados à altura da divisão)
      if (glassesToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedGlasses = new THREE.InstancedMesh(baseGeom, glassMat, glassesToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        glassesToCreate.forEach((w, idx) => {
          const midX = (w.x1 + w.x2) / 2;
          const midZ = (w.z1 + w.z2) / 2;
          const room = getRoomParaComponente(midX, -midZ);
          const hWall = room ? getAltTeto(room.id) : 2.8;
          const sillH = Math.min(0.9, hWall * 0.32);
          const glassTop = Math.min(2.1, hWall - 0.2);
          const glassH = Math.max(0.5, glassTop - sillH);

          tempPos.set(midX, sillH + glassH / 2, midZ);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, glassH, 0.03);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          instancedGlasses.setMatrixAt(idx, tempMatrix);
        });
        scene.add(instancedGlasses);
        sceneObjectsRef.current.push(instancedGlasses);
      }

      // Linhas 2D
      if (linePoints.length > 0) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
        geometriesRef.current.push(lineGeom);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x4b5563, transparent: true, opacity: 0.5 });
        const dxfSegments = new THREE.LineSegments(lineGeom, lineMat);
        scene.add(dxfSegments);
        sceneObjectsRef.current.push(dxfSegments);
      }
    }

    // ─── 7. Divisões (Rooms) — Merge Geometries ──────────────────────────────
    const roomWallGeometries = [];
    const roomWallMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, roughness: 0.9, metalness: 0.0,
      transparent: true, opacity: wallOpacityRef.current, side: THREE.DoubleSide,
    });
    trackedMaterials.push(roomWallMat);

    rooms.forEach((room) => {
      try {
        const geojson = JSON.parse(room.poligono_geojson);
        if (!geojson.coordinates || !geojson.coordinates[0]) return;
        const coords = geojson.coordinates[0];
        const rx0 = coords[0][0], rz0 = -coords[0][1];
        const rx1 = coords[2][0], rz1 = -coords[2][1];
        const rleft = Math.min(rx0, rx1), rz_min = Math.min(rz0, rz1);
        const rw = Math.abs(rx1 - rx0), rh = Math.abs(rz1 - rz0);
        if (rw <= 0.1 || rh <= 0.1) return;

        const nome_lower = (room.nome || "").toLowerCase();
        let colorHex = 0x4b5563;
        if (nome_lower.includes("quarto") || nome_lower.includes("suite")) colorHex = 0x4f46e5;
        else if (nome_lower.includes("sala")) colorHex = 0x16a34a;
        else if (nome_lower.includes("cozinha")) colorHex = 0xea580c;
        else if (nome_lower.includes("w.c") || nome_lower.includes("wc") || nome_lower.includes("lavab") || nome_lower.includes("i.s")) colorHex = 0x0284c7;
        else if (nome_lower.includes("varanda") || nome_lower.includes("terraço")) colorHex = 0x84cc16;
        else if (nome_lower.includes("corredor") || nome_lower.includes("hall")) colorHex = 0x64748b;

        const floorGeom = new THREE.BoxGeometry(rw, 0.05, rh);
        const floorMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8, metalness: 0.1 });
        const floorMesh = new THREE.Mesh(floorGeom, floorMat);
        floorMesh.position.set(rleft + rw / 2, -0.025, rz_min + rh / 2);
        // receiveShadow removido: shadowMap desligado para performance
        scene.add(floorMesh);
        sceneObjectsRef.current.push(floorMesh);
        geometriesRef.current.push(floorGeom);

        const esp = 0.12, altP = getAltTeto(room.id);

        // Criar geometrias de parede para merge posterior
        const wLeft = new THREE.BoxGeometry(esp, altP, rh);
        const wRight = new THREE.BoxGeometry(esp, altP, rh);
        const wBottom = new THREE.BoxGeometry(rw, altP, esp);
        const wTop = new THREE.BoxGeometry(rw, altP, esp);

        // Aplicar transformações a cada geometria (transladar para a posição final)
        const matrix4 = new THREE.Matrix4();
        const pos = new THREE.Vector3();

        pos.set(rleft + esp / 2, altP / 2, rz_min + rh / 2);
        matrix4.makeTranslation(pos.x, pos.y, pos.z);
        wLeft.applyMatrix4(matrix4);

        pos.set(rleft + rw - esp / 2, altP / 2, rz_min + rh / 2);
        matrix4.makeTranslation(pos.x, pos.y, pos.z);
        wRight.applyMatrix4(matrix4);

        pos.set(rleft + rw / 2, altP / 2, rz_min + esp / 2);
        matrix4.makeTranslation(pos.x, pos.y, pos.z);
        wBottom.applyMatrix4(matrix4);

        pos.set(rleft + rw / 2, altP / 2, rz_min + rh - esp / 2);
        matrix4.makeTranslation(pos.x, pos.y, pos.z);
        wTop.applyMatrix4(matrix4);

        roomWallGeometries.push(wLeft, wRight, wBottom, wTop);
        geometriesRef.current.push(wLeft, wRight, wBottom, wTop);

      } catch (e) {
        console.error("Erro ao desenhar divisão 3D:", e);
      }
    });

    // Merge de todas as geometrias de parede das divisões numa única
    if (roomWallGeometries.length > 0) {
      try {
        const mergedWalls = mergeGeometries(roomWallGeometries, false);
        geometriesRef.current.push(mergedWalls);
        const mergedWallMesh = new THREE.Mesh(mergedWalls, roomWallMat);
        // castShadow/receiveShadow removidos: shadowMap desligado
        scene.add(mergedWallMesh);
        sceneObjectsRef.current.push(mergedWallMesh);
      } catch (e) {
        console.warn("Merge de geometrias de paredes falhou, a usar individuais:", e);
      }
    }

    // Actualizar referências globais de limites e lista de paredes para colisão
    floorMinXRef.current = floorMinX;
    floorMaxXRef.current = floorMaxX;
    floorMinZRef.current = floorMinZ;
    floorMaxZRef.current = floorMaxZ;

    const allWalls = [...wallsToCreate];
    rooms.forEach((room) => {
      try {
        const geojson = JSON.parse(room.poligono_geojson);
        if (!geojson.coordinates || !geojson.coordinates[0]) return;
        const coords = geojson.coordinates[0];
        const rx0 = coords[0][0], rz0 = -coords[0][1];
        const rx1 = coords[2][0], rz1 = -coords[2][1];
        const rleft = Math.min(rx0, rx1), rz_min = Math.min(rz0, rz1);
        const rw = Math.abs(rx1 - rx0), rh = Math.abs(rz1 - rz0);
        if (rw <= 0.1 || rh <= 0.1) return;
        allWalls.push({ x1: rleft, z1: rz_min, x2: rleft + rw, z2: rz_min });
        allWalls.push({ x1: rleft + rw, z1: rz_min, x2: rleft + rw, z2: rz_min + rh });
        allWalls.push({ x1: rleft + rw, z1: rz_min + rh, x2: rleft, z2: rz_min + rh });
        allWalls.push({ x1: rleft, z1: rz_min, x2: rleft, z2: rz_min + rh });
      } catch { }
    });
    wallsRef.current = allWalls;

    // ─── 7b. Tetos 3D (Rooms + Linhas DXF elevadas com espessura + Polígonos DXF fechados) ──
    tetoMeshesRef.current = [];
    const tetoMat = new THREE.MeshStandardMaterial({
      color: 0xdee2e6, roughness: 0.95, metalness: 0.0,
      transparent: true, opacity: tetoOpacidadeRef.current,
      side: THREE.DoubleSide,
    });
    trackedMaterials.push(tetoMat);
    tetoMatRef.current = tetoMat;

    // Material para as linhas do teto (mais subtil que as linhas do chão)
    const tetoLineMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8, transparent: true, opacity: 0.6,
    });
    trackedMaterials.push(tetoLineMat);

    // 7b-A: Tetos de Rooms (já estão nas coordenadas correctas)
    rooms.forEach((room) => {
      try {
        const geojson = JSON.parse(room.poligono_geojson);
        if (!geojson.coordinates || !geojson.coordinates[0]) return;
        const coords = geojson.coordinates[0];
        const rx0 = coords[0][0], rz0 = -coords[0][1];
        const rx1 = coords[2][0], rz1 = -coords[2][1];
        const rleft = Math.min(rx0, rx1), rz_min = Math.min(rz0, rz1);
        const rw = Math.abs(rx1 - rx0), rh = Math.abs(rz1 - rz0);
        if (rw <= 0.1 || rh <= 0.1) return;

        const altTeto = getAltTeto(room.id);
        const espLaje = 0.12;
        const tetoGeom = new THREE.BoxGeometry(rw, espLaje, rh);
        geometriesRef.current.push(tetoGeom);
        const tetoMesh = new THREE.Mesh(tetoGeom, tetoMat);
        tetoMesh.position.set(rleft + rw / 2, altTeto + espLaje / 2, rz_min + rh / 2);
        tetoMesh.receiveShadow = true;
        tetoMesh.visible = tetoVisivel;
        scene.add(tetoMesh);
        sceneObjectsRef.current.push(tetoMesh);
        tetoMeshesRef.current.push(tetoMesh);
      } catch (e) {
        console.error("Erro ao criar teto de divisão 3D:", e);
      }
    });

    // 7b-B: Linhas DXF de camadas "teto" — renderizadas elevadas com espessura 3D (vigas/lajes)
    if (tetoLinePoints.length > 0) {
      const elevatedPoints = [];
      const beamSegments = [];

      tetoLinePoints.forEach((tl) => {
        const x1 = tl.x1 + tetoOffsetX;
        const z1 = tl.z1 + tetoOffsetZ;
        const x2 = tl.x2 + tetoOffsetX;
        const z2 = tl.z2 + tetoOffsetZ;

        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        const room = getRoomParaComponente(midX, -midZ);
        const altTeto = room ? getAltTeto(room.id) : altParede_teto;

        elevatedPoints.push(new THREE.Vector3(x1, altTeto + 0.01, z1));
        elevatedPoints.push(new THREE.Vector3(x2, altTeto + 0.01, z2));

        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len >= 0.1) {
          const angle = Math.atan2(dz, dx);
          beamSegments.push({ midX, midZ, len, angle, altTeto });
        }
      });

      // Renderizar contornos em linha
      const tetoLineGeom = new THREE.BufferGeometry().setFromPoints(elevatedPoints);
      geometriesRef.current.push(tetoLineGeom);
      const tetoLineSegments = new THREE.LineSegments(tetoLineGeom, tetoLineMat);
      tetoLineSegments.visible = tetoVisivel;
      scene.add(tetoLineSegments);
      sceneObjectsRef.current.push(tetoLineSegments);
      tetoMeshesRef.current.push(tetoLineSegments);

      // Renderizar vigas/lajes 3D com volume/espessura sólidas (0.08m x 0.08m)
      if (beamSegments.length > 0) {
        const beamBaseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(beamBaseGeom);
        const beamInstanced = new THREE.InstancedMesh(beamBaseGeom, tetoMat, beamSegments.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);
        const espViga = 0.08;

        beamSegments.forEach((b, idx) => {
          tempPos.set(b.midX, b.altTeto - espViga / 2, b.midZ);
          tempRot.setFromAxisAngle(yAxis, -b.angle);
          tempScale.set(b.len, espViga, espViga);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          beamInstanced.setMatrixAt(idx, tempMatrix);
        });

        beamInstanced.visible = tetoVisivel;
        scene.add(beamInstanced);
        sceneObjectsRef.current.push(beamInstanced);
        tetoMeshesRef.current.push(beamInstanced);
      }
    }

    // 7b-C: Tetos de polígonos DXF fechados (camada classificada como "teto") — com offset
    if (geometria) {
      (geometria.polilinhas || []).forEach((poli) => {
        if (!poli.fechada) return;
        const config = layerConfigs[poli.layer] || "mobiliario";
        if (config !== "teto") return;
        if (!poli.pontos || poli.pontos.length < 3) return;

        try {
          const shape = new THREE.Shape();
          // Aplicar offset ao criar o shape
          shape.moveTo(poli.pontos[0].x + tetoOffsetX, -(poli.pontos[0].y) + tetoOffsetZ);
          for (let i = 1; i < poli.pontos.length; i++) {
            shape.lineTo(poli.pontos[i].x + tetoOffsetX, -(poli.pontos[i].y) + tetoOffsetZ);
          }
          shape.closePath();

          const extrudeSettings = { depth: 0.05, bevelEnabled: false };
          const tetoGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          geometriesRef.current.push(tetoGeom);

          const tetoMesh = new THREE.Mesh(tetoGeom, tetoMat);
          // ExtrudeGeometry cria no plano XY; rodar para horizontal e posicionar a altParede
          tetoMesh.rotation.x = -Math.PI / 2;
          tetoMesh.position.y = altParede_teto;
          tetoMesh.receiveShadow = true;
          tetoMesh.visible = tetoVisivel;
          scene.add(tetoMesh);
          sceneObjectsRef.current.push(tetoMesh);
          tetoMeshesRef.current.push(tetoMesh);
        } catch (e) {
          console.warn("Erro ao criar teto DXF 3D:", e);
        }
      });
    }



    // ─── 8. Componentes Elétricos — InstancedMesh + Iluminação Interativa ─────
    const compGroups = new Map();
    const switchMeshesRef = [];
    // lampStateMapRef já é useRef global — resetado no início do efeito

    // Helper: extrair array de comandos do rótulo JSON, array ou string (ex: "a, b" ou ["a", "b"])
    const getComponentComandosArray = (comp) => {
      if (!comp || !comp.rotulo) return [];

      let rawValue = null;

      try {
        const parsed = JSON.parse(comp.rotulo);
        if (parsed && typeof parsed === "object") {
          if (parsed.comando) {
            if (typeof parsed.comando === "object" && parsed.comando.value != null) {
              rawValue = parsed.comando.value;
            } else {
              rawValue = parsed.comando;
            }
          } else if (parsed.comandos) {
            rawValue = parsed.comandos;
          }
        }
      } catch {
        rawValue = comp.rotulo;
      }

      if (!rawValue) rawValue = comp.rotulo;

      if (Array.isArray(rawValue)) {
        return rawValue.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
      }

      if (typeof rawValue === "string") {
        return rawValue
          .split(",")
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean);
      }

      return [String(rawValue).trim().toLowerCase()].filter(Boolean);
    };

    // Helper: determinar quais lâmpadas estão ligadas a um comando específico de um interruptor
    const getLinkedLamps = (switchComp, commandIndex = 0) => {
      const switchComandos = getComponentComandosArray(switchComp);
      const comando = switchComandos[commandIndex];
      if (!comando) return [];

      const linkedIds = new Set();

      componentes.forEach((c) => {
        if (c.tipo.startsWith("lampada")) {
          const lampComandos = getComponentComandosArray(c);
          if (lampComandos.includes(comando)) {
            linkedIds.add(c.id);
          }
        }
      });

      return Array.from(linkedIds);
    };

    // Helper: extrair potência real da lâmpada (W) das propriedades do componente
    const getComponentWatts = (comp) => {
      if (comp.potencia_w != null) {
        const val = Number(comp.potencia_w);
        if (!isNaN(val) && val > 0) return val;
      }
      if (comp.rotulo) {
        try {
          const parsed = JSON.parse(comp.rotulo);
          if (parsed && typeof parsed === "object") {
            if (parsed.potencia_w != null) {
              const val = Number(parsed.potencia_w);
              if (!isNaN(val) && val > 0) return val;
            }
            if (parsed.potencia_va != null) {
              const val = typeof parsed.potencia_va === "object" ? parsed.potencia_va.value : parsed.potencia_va;
              const num = Number(val);
              if (!isNaN(num) && num > 0) return num;
            }
          }
        } catch { }
      }
      return 0;
    };

    // ─── Helper: atualizar visual da lâmpada (ON/OFF) — SEM limite de pool ──
    // Todas as lâmpadas podem estar acesas visualmente (emissive + sprites).
    // PointLights são geridas separadamente por distância à câmara (max 12).
    const updateLamp3DState = (lampObjs) => {
      const { pointLight, haloSprite, spotFloorMesh, lampMesh, baseWatts, isOn, hasPower,
        isLedStrip, glowSprites } = lampObjs;

      const shouldBeLit = hasPower && isOn;

      if (shouldBeLit) {
        // Visuais sempre ON (emissive + sprites — baratos)
        const lightIntensity = Math.min(3.5, Math.max(1.2, 1.0 + baseWatts / 30));
        if (pointLight) pointLight.intensity = lightIntensity;
        if (haloSprite) haloSprite.material.opacity = 0.8;
        if (spotFloorMesh) spotFloorMesh.material.opacity = 0.35;
        if (lampMesh && lampMesh.material) {
          if (isLedStrip) {
            lampMesh.material.color.setHex(0xfbbf24);
            lampMesh.material.emissive.setHex(0xfbbf24);
            lampMesh.material.emissiveIntensity = isDia ? 5.0 : 12.0;
          } else {
            lampMesh.material.color.setHex(0xfbbf24);
            lampMesh.material.emissive.setHex(0xfbbf24);
            lampMesh.material.emissiveIntensity = isDia ? 0.4 : 2.0;
          }
        }
        if (glowSprites) {
          glowSprites.forEach(sprite => { sprite.material.opacity = 0.55; });
        }
      } else {
        if (pointLight) {
          pointLight.intensity = 0.0;
          if (pointLight.parent) pointLight.parent.remove(pointLight);
        }
        if (haloSprite) haloSprite.material.opacity = 0.0;
        if (spotFloorMesh) spotFloorMesh.material.opacity = 0.0;
        if (lampMesh && lampMesh.material) {
          lampMesh.material.color.setHex(0x64748b);
          lampMesh.material.emissive.setHex(0x000000);
          lampMesh.material.emissiveIntensity = 0.0;
        }
        if (glowSprites) {
          glowSprites.forEach(sprite => { sprite.material.opacity = 0.0; });
        }
      }
    };

    // ─── PointLights dinâmicas: só as 12 mais próximas da câmara ───────────
    const MAX_POINTLIGHTS = 12;
    let lastPointLightUpdate = 0;
    const updatePointLightsByDistance = () => {
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      if (!camera || !scene) return;
      const now = performance.now();
      if (now - lastPointLightUpdate < 200) return; // throttle 0.2s
      lastPointLightUpdate = now;

      const candidates = [];
      lampStateMapRef.current.forEach((lamp) => {
        if (lamp.pointLight && lamp.isOn && lamp.hasPower) {
          candidates.push({
            dist: camera.position.distanceToSquared(lamp.pointLight.position),
            pointLight: lamp.pointLight,
          });
        }
      });
      candidates.sort((a, b) => a.dist - b.dist);

      for (let i = 0; i < Math.min(MAX_POINTLIGHTS, candidates.length); i++) {
        const pl = candidates[i].pointLight;
        if (!pl.parent) scene.add(pl);
      }
      for (let i = MAX_POINTLIGHTS; i < candidates.length; i++) {
        const pl = candidates[i].pointLight;
        if (pl.parent) pl.parent.remove(pl);
      }
    };
    updatePointLightsByDistanceRef.current = updatePointLightsByDistance;

    componentes.forEach((c) => {
      // Ancorar lâmpadas de teto à face inferior da placa de teto da respectiva divisão
      let overrideY = undefined;
      // LED de jardim fica no chão — nunca ancorar ao teto
      const isTetoLamp = c.tipo.startsWith("lampada") && c.tipo !== "lampada_arandela" && c.tipo !== "lampada_jardim";
      if (isTetoLamp) {
        const roomDoComp = getRoomParaComponente(c.x, c.y);
        if (roomDoComp) {
          const altTeto = getAltTeto(roomDoComp.id);
          if (c.tipo === "lampada_pendente") {
            // Pendente: overrideY = altura do teto, usada para calcular comprimento do cabo
            overrideY = altTeto;
          } else {
            overrideY = altTeto - 0.025; // face inferior da laje de 0.05m
          }
        }
      }
      const { geom, cor, yFinal, extraMesh, numSwitches } = getComponentGeometry(c, overrideY);
      const watts = getComponentWatts(c);
      const hasPower = watts > 0;

      let lampPointLight = null;
      let lampHaloSprite = null;
      let lampFloorMesh = null;

      // Criar fontes de luz para todas as lâmpadas (pool: removidas da cena quando OFF)
      const isJardim = c.tipo === "lampada_jardim";
      if (c.tipo.startsWith("lampada")) {
        // 1. PointLight real (NÃO adicionada à cena ainda — só quando acender)
        const lightDistance = Math.max(5.0, 4.0 + Math.sqrt(watts > 0 ? watts : 60) * 0.5);
        lampPointLight = new THREE.PointLight(0xffedd5, 0.0, lightDistance, 1.5);
        // LED de jardim: luz acima da cabeça (a apontar para cima); teto: luz abaixo
        const lightY = isJardim ? yFinal + 0.45 : yFinal - 0.1;
        lampPointLight.position.set(c.x, lightY, -c.y);
        lampPointLight.castShadow = false;
        // PointLight NÃO adicionada à cena — gerida por updatePointLightsByDistance

        // 2. Halo de Brilho
        const haloMat = new THREE.SpriteMaterial({
          map: getGlowTexture(),
          color: 0xfffde6,
          transparent: true,
          opacity: 0.0, // Inicia desligado (opacidade 0)
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        lampHaloSprite = new THREE.Sprite(haloMat);
        const haloScale = Math.min(1.2, Math.max(0.4, 0.4 + (watts / 100) * 0.5));
        lampHaloSprite.scale.set(haloScale, haloScale, 1.0);
        // LED de jardim: halo junto à cabeça (0.35m); teto: halo junto à lâmpada
        lampHaloSprite.position.set(c.x, isJardim ? yFinal + 0.2 : yFinal - 0.05, -c.y);
        scene.add(lampHaloSprite);
        sceneObjectsRef.current.push(lampHaloSprite);

        // 3. Fake Glow no Chão
        const floorGlowRadius = Math.min(2.5, Math.max(0.8, 0.8 + (watts / 100) * 0.9));
        const spotPlaneGeom = new THREE.PlaneGeometry(floorGlowRadius * 2.5, floorGlowRadius * 2.5);
        geometriesRef.current.push(spotPlaneGeom);

        const spotFloorMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          map: getGlowTexture(),
          transparent: true,
          opacity: 0.0, // Inicia desligado (opacidade 0)
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        trackedMaterials.push(spotFloorMat);

        lampFloorMesh = new THREE.Mesh(spotPlaneGeom, spotFloorMat);
        lampFloorMesh.position.set(c.x, 0.01, -c.y);
        lampFloorMesh.rotation.x = -Math.PI / 2;
        scene.add(lampFloorMesh);
        sceneObjectsRef.current.push(lampFloorMesh);
      }

      if (geom) {
        // Lâmpadas e Interruptores são renderizados como meshes individuais para controlo dinâmico de iluminação e clique
        const isInteractiveComp = c.tipo.startsWith("interruptor") || c.tipo.startsWith("lampada");
        const key = isInteractiveComp ? null : getGeometryGroupKey(geom, cor);

        if (key) {
          if (!compGroups.has(key)) {
            compGroups.set(key, { comps: [], geom: geom.clone(), cor });
          }
          compGroups.get(key).comps.push({ ...c, yFinal, geomKey: key, extraMesh });
        } else {
          const rotRad = ((c.rotacao || 0) * Math.PI) / 180;
          const isLamp = c.tipo.startsWith("lampada");
          const initialColor = isLamp ? 0x64748b : cor; // Lâmpadas iniciam com cor cinza (desligadas)
          const mat = new THREE.MeshStandardMaterial({
            color: initialColor, roughness: 0.3, metalness: 0.2,
            emissive: isLamp ? 0x000000 : cor, emissiveIntensity: 0.0, // Inicia sem emissão
          });
          trackedMaterials.push(mat);

          const { posX, posY, posZ } = getComponentPosition3D(c, yFinal);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(posX, posY, posZ);
          mesh.rotation.y = -rotRad;
          if (c.tipo === "camera") mesh.rotation.x = Math.PI / 6;

          if (c.tipo.startsWith("interruptor")) {
            const nSwitches = numSwitches || 1;
            if (nSwitches > 1) {
              // Multi-switch: criar botões clicáveis individuais sobre a placa base
              const spacing = 0.055;
              const totalWidth = (nSwitches - 1) * spacing;
              for (let i = 0; i < nSwitches; i++) {
                const btnGeom = new THREE.BoxGeometry(0.035, 0.045, 0.005);
                const btnMat = new THREE.MeshStandardMaterial({
                  color: 0x1a1a1a, roughness: 0.7, metalness: 0.1,
                });
                trackedMaterials.push(btnMat);
                const btn = new THREE.Mesh(btnGeom, btnMat);
                btn.position.set(-totalWidth / 2 + i * spacing, 0, -0.013);
                btn.userData = { isSwitch: true, component: c, commandIndex: i };
                switchMeshesRef.push(btn);
                mesh.add(btn);
                geometriesRef.current.push(btnGeom);
              }
            } else {
              // Simples: a placa toda é clicável
              mesh.userData = { isSwitch: true, component: c, commandIndex: 0 };
              switchMeshesRef.push(mesh);
            }
          }

          scene.add(mesh);
          sceneObjectsRef.current.push(mesh);

          if (isLamp) {
            lampStateMapRef.current.set(c.id, {
              pointLight: lampPointLight,
              haloSprite: lampHaloSprite,
              spotFloorMesh: lampFloorMesh,
              lampMesh: mesh,
              baseWatts: watts,
              hasPower,
              isOn: false,
            });
          }

          if (extraMesh) {
            extraMesh.position.set(posX, posY, posZ);
            extraMesh.rotation.y = -rotRad;
            scene.add(extraMesh);
            sceneObjectsRef.current.push(extraMesh);
          }
        }
      }
    });

    // Atualizar estado inicial de todas as lâmpadas (desligadas por padrão)
    lampStateMapRef.current.forEach((lampObjs) => {
      updateLamp3DState(lampObjs);
    });

    // ─── Fita de LED 3D (segmentos retos iguais ao 2D) ───────────────────────
    componentes.forEach((c) => {
      if (c.tipo !== "lampada_led_fita") return;

      // Parse pontos e localizacao do rotulo JSON
      let pontos = [];
      let localizacao = "teto";
      try {
        const parsed = JSON.parse(c.rotulo || "{}");
        if (parsed.pontos && parsed.pontos.length >= 2) {
          pontos = parsed.pontos;
        }
        if (parsed.localizacao) localizacao = parsed.localizacao;
      } catch { }

      if (pontos.length < 2) return;

      const yLevel = localizacao === "parede" ? 1.8 : 2.7;
      const watts = getComponentWatts(c);
      const hasPower = watts > 0;

      // Converter pontos mundo 2D → 3D (x, yLevel, -y = Z)
      const pts3D = pontos.map((p) => new THREE.Vector3(p.x, yLevel, -p.y));

      // ─── Mesh da fita: caixas individuais em cada segmento (merge) ─────
      const segmentGeoms = [];
      const stripRadius = 0.006; // raio do tubo
      const tempMatrix = new THREE.Matrix4();
      const tempPos = new THREE.Vector3();
      const tempQuat = new THREE.Quaternion();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3();

      for (let i = 0; i < pts3D.length - 1; i++) {
        const p1 = pts3D[i];
        const p2 = pts3D[i + 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const dy = p2.y - p1.y;
        const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (segLen < 0.001) continue;

        const segGeom = new THREE.CylinderGeometry(stripRadius, stripRadius, segLen, 6, 1);
        segGeom.rotateX(Math.PI / 2); // Eixo Z -> Y

        // Escalar UV-V para repetir LEDs ao longo do comprimento (cada tile = 1 LED)
        const LED_SPACING_M = 0.0167; // ~60 LEDs/metro
        const repeats = Math.max(1, Math.round(segLen / LED_SPACING_M));
        const uvAttr = segGeom.getAttribute("uv");
        if (uvAttr) {
          const uvArray = uvAttr.array;
          // Apenas os primeiros (radialSegments+1)*(heightSegments+1) vértices são da lateral
          const sideCount = (6 + 1) * (1 + 1); // = 14
          for (let j = 0; j < Math.min(sideCount, uvAttr.count); j++) {
            uvArray[j * 2 + 1] *= repeats; // V = y
          }
          uvAttr.needsUpdate = true;
        }

        // Posicionar no meio do segmento
        tempPos.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2);

        // Orientar ao longo da direção do segmento
        forward.set(dx, dy, dz).normalize();
        tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
        tempMatrix.compose(tempPos, tempQuat, new THREE.Vector3(1, 1, 1));
        segGeom.applyMatrix4(tempMatrix);

        segmentGeoms.push(segGeom);
        geometriesRef.current.push(segGeom);
      }

      let stripMesh = null;
      if (segmentGeoms.length > 0) {
        let merged;
        try {
          merged = mergeGeometries(segmentGeoms, false);
        } catch {
          merged = segmentGeoms[0];
        }
        geometriesRef.current.push(merged);

        const ledTex = getLedStripTexture();
        const stripMat = new THREE.MeshStandardMaterial({
          color: 0x64748b,
          roughness: 0.3,
          metalness: 0.1,
          emissive: 0x000000,
          emissiveIntensity: 0.0,
          emissiveMap: ledTex,
        });
        trackedMaterials.push(stripMat);

        stripMesh = new THREE.Mesh(merged, stripMat);
        // Atribuir à bloom layer (selective bloom: só a fita LED recebe bloom)
        stripMesh.layers.set(0);
        stripMesh.layers.enable(BLOOM_LAYER);
        scene.add(stripMesh);
        sceneObjectsRef.current.push(stripMesh);
      }

      // ─── Calcular comprimento total e distribuir luzes uniformemente ────
      // Caminhar ao longo dos segmentos com passo regular (arc-length real)
      const segmentLengths = [];
      let totalLength = 0;
      for (let i = 0; i < pts3D.length - 1; i++) {
        const p1 = pts3D[i];
        const p2 = pts3D[i + 1];
        const segLen = p1.distanceTo(p2);
        segmentLengths.push(segLen);
        totalLength += segLen;
      }

      if (totalLength < 0.01) return;

      // ─── Glow sprites ao longo da fita (brilho consistente, independente do zoom) ───
      const glowSprites = [];
      const numGlowSprites = Math.max(2, Math.min(12, Math.round(totalLength / 0.8)));
      const glowTex = getGlowTexture();
      for (let g = 0; g < numGlowSprites; g++) {
        // Posição ao longo da polyline: caminhar por arc-length real
        const targetDist = (g + 0.5) * (totalLength / numGlowSprites);
        let accum = 0;
        let pos = null;
        for (let s = 0; s < pts3D.length - 1; s++) {
          const segLen = pts3D[s].distanceTo(pts3D[s + 1]);
          if (accum + segLen >= targetDist || s === pts3D.length - 2) {
            const tLocal = segLen > 0 ? (targetDist - accum) / segLen : 0;
            pos = new THREE.Vector3().lerpVectors(pts3D[s], pts3D[s + 1], Math.min(1, Math.max(0, tLocal)));
            break;
          }
          accum += segLen;
        }
        if (!pos) continue;

        const glowMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffeedd,
          transparent: true,
          opacity: 0.0, // Inicia desligado
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glowSprite = new THREE.Sprite(glowMat);
        const spriteScale = 0.25 + (watts / 100) * 0.15; // 0.25–0.4m de raio
        glowSprite.scale.set(spriteScale, spriteScale, 1.0);
        glowSprite.position.copy(pos);
        scene.add(glowSprite);
        sceneObjectsRef.current.push(glowSprite);
        glowSprites.push(glowSprite);
      }

      // ─── Registar no lampStateMapRef para controlo ON/OFF por comando ───
      if (stripMesh) {
        lampStateMapRef.current.set(c.id, {
          lampMesh: stripMesh,
          glowSprites,
          baseWatts: watts,
          hasPower,
          isOn: false,
          isLedStrip: true,
        });
      }
    });

    // Renderizar cada grupo como InstancedMesh
    compGroups.forEach((group) => {
      const { comps, geom: groupGeom, cor } = group;
      if (comps.length === 0) return;

      const hasPoweredLamps = comps.some((c) => (c.potencia_w || 0) > 0);
      const emissiveInt = hasPoweredLamps ? (isDia ? 0.3 : 2.0) : 0.0;
      const mat = new THREE.MeshStandardMaterial({
        color: cor, roughness: 0.3, metalness: 0.2,
        emissive: cor, emissiveIntensity: cor === 0xf59e0b ? emissiveInt : 0.0,
      });
      trackedMaterials.push(mat);

      const instanced = new THREE.InstancedMesh(groupGeom, mat, comps.length);
      geometriesRef.current.push(groupGeom);

      const tempMatrix = new THREE.Matrix4();
      const tempPos = new THREE.Vector3();
      const tempRot = new THREE.Quaternion();
      const tempScale = new THREE.Vector3(1, 1, 1);

      comps.forEach((c, idx) => {
        const { posX, posY, posZ } = getComponentPosition3D(c, c.yFinal);
        tempPos.set(posX, posY, posZ);
        const rotRad = ((c.rotacao || 0) * Math.PI) / 180;
        const euler = new THREE.Euler(c.tipo === "camera" ? Math.PI / 6 : 0, -rotRad, 0, 'YXZ');
        tempRot.setFromEuler(euler);
        tempMatrix.compose(tempPos, tempRot, tempScale);
        instanced.setMatrixAt(idx, tempMatrix);

        if (c.extraMesh) {
          c.extraMesh.position.set(posX, posY, posZ);
          c.extraMesh.rotation.y = -rotRad;
          scene.add(c.extraMesh);
          sceneObjectsRef.current.push(c.extraMesh);
        }
      });

      scene.add(instanced);
      sceneObjectsRef.current.push(instanced);
    });

    // ─── Raycaster para cliques interativos nos interruptores ─────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let mouseDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e) => {
      // Em 1ª pessoa com pointer lock, clientX/Y não são fiáveis — usamos centro
      const locked = fpsControlsRef.current?.isLocked;
      if (locked) {
        mouseDownPos = { x: 0, y: 0 };
      } else {
        mouseDownPos = { x: e.clientX, y: e.clientY };
      }
    };

    const handlePointerUp = (e) => {
      const locked = fpsControlsRef.current?.isLocked;

      // Em 1ª pessoa: o rato move a câmara via movementX/Y, não clientX/Y.
      // Saltamos o drag check e usamos o centro do ecrã (crosshair).
      if (!locked) {
        const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
        if (dist > 5) return; // Se arrastou a câmara, ignora o clique
      }

      if (locked) {
        // Crosshair está sempre no centro do ecrã quando o pointer está locked
        mouse.x = 0;
        mouse.y = 0;
      } else {
        const rect = domElem.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(switchMeshesRef, true);

      if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit && !hit.userData?.isSwitch && hit.parent) {
          hit = hit.parent;
        }
        if (hit && hit.userData?.isSwitch) {
          const switchComp = hit.userData.component;
          const commandIndex = hit.userData.commandIndex ?? 0;
          const linkedLampIds = getLinkedLamps(switchComp, commandIndex);

          if (linkedLampIds.length > 0) {
            const firstState = lampStateMapRef.current.get(linkedLampIds[0]);
            const newIsOn = !(firstState?.isOn ?? true);

            linkedLampIds.forEach((lampId) => {
              const lampObjs = lampStateMapRef.current.get(lampId);
              if (lampObjs) {
                lampObjs.isOn = newIsOn;
                updateLamp3DState(lampObjs);
              }
            });

            // Atualizar PointLights por distância imediatamente após toggle
            updatePointLightsByDistanceRef.current?.();

            // Animação/Flash no interruptor ao clicar
            if (hit.material) {
              const origColor = hit.material.color.getHex();
              hit.material.color.setHex(newIsOn ? 0x4ade80 : 0x166534);
              setTimeout(() => {
                if (hit.material) hit.material.color.setHex(origColor);
                requestRender();
              }, 250);
            }

            requestRender();
          }
        }
      }
    };

    let lastMoveTime = 0;
    const handlePointerMove = (e) => {
      if (switchMeshesRef.length === 0) return;
      // Em 1ª pessoa com pointer lock: cursor está oculto, não faz sentido hover
      if (fpsControlsRef.current?.isLocked) return;
      if (e.buttons > 0) return; // Ignorar raycast enquanto se arrasta a câmara
      const now = performance.now();
      if (now - lastMoveTime < 60) return; // Throttle para ~16 FPS no hover
      lastMoveTime = now;

      const rect = domElem.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(switchMeshesRef, true);
      domElem.style.cursor = intersects.length > 0 ? "pointer" : "default";
    };

    domElem.addEventListener("pointerdown", handlePointerDown);
    domElem.addEventListener("pointerup", handlePointerUp);
    domElem.addEventListener("pointermove", handlePointerMove);

    // ─── 9. Conexões com cor por circuito e rotas realistas ─────────────────
    const circuitColors = {};
    const palette = [0x6366f1, 0x22c55e, 0xf59e0b, 0xef4444, 0xec4899, 0x14b8a6, 0x8b5cf6, 0x3b82f6];
    circuitos.forEach((circ, i) => {
      circuitColors[circ.id] = palette[i % palette.length];
    });

    const conduitRadius = 0.018; // raio do tubo conduto (~36mm diâmetro real)
    const conduitTubularSegments = 4;  // ultra-optimizado: 4 segmentos bastam
    const conduitRadialSegments = 3;   // triângulo ≈ cilindro a esta escala
    conduitMeshesRef.current = [];

    // Map para lookup O(1) de componentes
    const compMap = new Map((componentes || []).map((c) => [c.id, c]));

    // Material compartilhado para tubos exteriores PVC
    const sharedTubeMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,       // cinza PVC
      roughness: 0.65,
      metalness: 0.05,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
    trackedMaterials.push(sharedTubeMat);

    // Material para condutos subterrâneos (terracota/tijolo enterrado)
    const subTubeMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,       // terracota/barro
      roughness: 0.85,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
    trackedMaterials.push(subTubeMat);

    // Cache de materiais de fio interior por cor/circuito
    const wireMatCache = new Map();

    conexoes.forEach((conn) => {
      const orig = compMap.get(conn.origem_id);
      const dest = compMap.get(conn.destino_id);
      if (!orig || !dest) return;

      const corCircuito = orig.circuit_id ? (circuitColors[orig.circuit_id] || 0x8b5cf6) : 0x8b5cf6;

      const y1 = ALTURAS[orig.tipo] || ALTURAS.outro;
      const y2 = ALTURAS[dest.tipo] || ALTURAS.outro;
      const p1 = new THREE.Vector3(orig.x, y1, -orig.y);
      const p2 = new THREE.Vector3(dest.x, y2, -dest.y);

      // Determinar nível de roteamento: subterrâneo (por baixo) ou teto/parede (por cima)
      const isSub = conn.localizacao === "subterraneo";

      let pathCurve;
      const hasCurve = conn.c1_x != null && conn.c1_y != null;

      if (hasCurve) {
        // Conduto curvado — usar ponto de controlo da BD para Bezier
        // Subterrâneo: converter para CatmullRom com ângulos rectos em vez de Bezier suave
        if (isSub) {
          const routeY = Math.min(y1, y2, -0.15) - 0.05;
          const pathPoints = [
            p1.clone(),
            new THREE.Vector3(p1.x, routeY, p1.z),
            new THREE.Vector3(p2.x, routeY, p2.z),
            p2.clone(),
          ];
          pathCurve = new THREE.CatmullRomCurve3(pathPoints, false, "catmullrom", 1.0);
        } else {
          const routeY = Math.max(y1, y2, 2.7) + 0.15;
          const c1 = new THREE.Vector3(p1.x, routeY, p1.z);
          const c2 = new THREE.Vector3(p2.x, routeY, p2.z);
          pathCurve = new THREE.CubicBezierCurve3(p1, c1, c2, p2);
        }
      } else {
        // Conduto recto — criar curvas de 90º para entrada em tomadas e interruptores
        const routeY = isSub ? Math.min(y1, y2, -0.15) - 0.05 : Math.max(y1, y2, 2.7) + 0.05;

        // Helper para obter pontos de entrada com cotovelo de 90 graus
        const getWallEntryPoints = (comp, yComp, tY) => {
          const isWallComp = comp.tipo.startsWith("tomada") || comp.tipo.startsWith("interruptor") || comp.tipo.startsWith("quadro");
          const { posX, posY, posZ } = getComponentPosition3D(comp, yComp);
          const ptBase = new THREE.Vector3(posX, posY, posZ);

          if (!isWallComp) {
            return {
              points: [ptBase, new THREE.Vector3(comp.x, tY, -comp.y)],
            };
          }

          // Para tomadas e interruptores, a tubagem desce dentro da parede (atrás do espelho)
          const rotRad = ((comp.rotacao || 0) * Math.PI) / 180;
          const depthOffset = 0.05;
          const backX = -Math.sin(rotRad) * depthOffset;
          const backZ = Math.cos(rotRad) * depthOffset;

          const pBox = new THREE.Vector3(posX, posY, posZ);
          const pEntry = new THREE.Vector3(posX + backX, posY, posZ + backZ);
          const pElbow = new THREE.Vector3(posX + backX, tY, posZ + backZ);

          return {
            points: [pBox, pEntry, pElbow],
          };
        };

        const origRoute = getWallEntryPoints(orig, y1, routeY);
        const destRoute = getWallEntryPoints(dest, y2, routeY);

        // Combinar pontos da origem até ao topo, atravessar até ao topo do destino e descer em 90º
        const pathPoints = [
          ...origRoute.points,
          ...destRoute.points.slice().reverse(),
        ];

        pathCurve = new THREE.CatmullRomCurve3(pathPoints, false, "catmullrom", isSub ? 1.0 : 0.0);
      }

      // Selecionar material: subterrâneo usa terracota, teto/parede usa PVC cinza
      const tubeMat = isSub ? subTubeMat : sharedTubeMat;

      // Tubo cilíndrico realista (estilo eletroduto PVC corrugado)
      const tubeGeom = new THREE.TubeGeometry(pathCurve, conduitTubularSegments, conduitRadius, conduitRadialSegments, false);
      geometriesRef.current.push(tubeGeom);

      const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
      tubeMesh.renderOrder = 10; // renderizar depois das paredes
      scene.add(tubeMesh);
      sceneObjectsRef.current.push(tubeMesh);
      conduitMeshesRef.current.push(tubeMesh);

      // Fio interior colorido pelo circuito (mais fino, dentro do tubo)
      const wireGeom = new THREE.TubeGeometry(pathCurve, conduitTubularSegments, conduitRadius * 0.35, 4, false);
      geometriesRef.current.push(wireGeom);

      if (!wireMatCache.has(corCircuito)) {
        const wireMat = new THREE.MeshStandardMaterial({
          color: corCircuito,
          roughness: 0.4,
          metalness: 0.1,
          emissive: corCircuito,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.92,
          depthTest: true,
        });
        wireMatCache.set(corCircuito, wireMat);
        trackedMaterials.push(wireMat);
      }

      const wireMesh = new THREE.Mesh(wireGeom, wireMatCache.get(corCircuito));
      wireMesh.renderOrder = 11;
      scene.add(wireMesh);
      sceneObjectsRef.current.push(wireMesh);
      conduitMeshesRef.current.push(wireMesh);
    });

    // ─── Pré-classificação de meshes para bloom seletivo ────────────────────
    // Evita scene.traverse() por frame: classificar uma vez na construção
    const nonBloomMeshes = [];
    let hasBloom = false;
    scene.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.layers.test(BLOOM_LAYER)) {
          hasBloom = true;
        } else {
          nonBloomMeshes.push(obj);
        }
      }
    });
    nonBloomMeshesRef.current = nonBloomMeshes;
    hasBloomObjectsRef.current = hasBloom;

    // ─── Primeiro render ────────────────────────────────────────────────────
    requestRender();

    // ─── Resize handler (debounced 200ms + bloom a 50%) ─────────────────────
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        // Bloom a 50% da nova resolução
        const bw = Math.floor(w * 0.5);
        const bh = Math.floor(h * 0.5);
        bloomComposerRef.current?.setSize(bw, bh);
        finalComposerRef.current?.setSize(w, h);
        requestRender();
      }, 200);
    };
    window.addEventListener("resize", handleResize);

    // ─── Cleanup: disposal rigoroso (evita memory leak GPU) ──────────────────
    return () => {
      isDisposedRef.current = true;
      clearTimeout(resizeTimeout);
      if (cameraRef.current) {
        savedCameraPosRef.current = cameraRef.current.position.clone();
      }
      if (controlsRef.current) {
        savedCameraTargetRef.current = controlsRef.current.target.clone();
      }
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      domElem.removeEventListener("click", handleCanvasClick);
      domElem.removeEventListener("pointerdown", handlePointerDown);
      domElem.removeEventListener("pointerup", handlePointerUp);
      domElem.removeEventListener("pointermove", handlePointerMove);
      fpsControls.dispose();

      // Dispose recursivo de TODOS os objetos na cena (inclui geometries, materials, textures, children)
      disposeScene(scene);

      // Dispose de geometrias rastreadas extra (geometrias que não estão na cena)
      geometriesRef.current.forEach(g => {
        if (g && typeof g.dispose === 'function' && !g._disposed) g.dispose();
      });
      geometriesRef.current = [];

      // Dispose de materiais rastreados extra
      trackedMaterials.forEach(m => {
        if (m && typeof m.dispose === 'function' && !m._disposed) m.dispose();
      });
      materialsRef.current = [];

      // Limpar arrays de referências
      conduitMeshesRef.current = [];
      tetoMeshesRef.current = [];
      tetoMatRef.current = null;
      sceneObjectsRef.current = [];

      bloomComposerRef.current?.dispose();
      finalComposerRef.current?.dispose();
      controls.dispose();
      renderer.dispose();
      bloomComposerRef.current = null;
      finalComposerRef.current = null;
      bloomBlendPassRef.current = null;
      scene.clear();

      // Limpar caches de textura no unmount final
      if (glowTextureCache) {
        glowTextureCache.dispose();
        glowTextureCache = null;
      }
      if (ledStripTextureCache) {
        ledStripTextureCache.dispose();
        ledStripTextureCache = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometria, componentes, conexoes, rooms, layerConfigs, modoDiaNoite, alturasPorRoom, alturasPorCamada]);

  // Atualizar opacidade
  const handleOpacityChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setWallOpacity(val);
    wallOpacityRef.current = val;
    materialsRef.current.forEach((mat) => {
      if (mat && typeof mat.opacity !== 'undefined') mat.opacity = val;
    });
    // Quando opacidade das paredes < 60%, tornar condutos visíveis através das paredes
    const showThroughWalls = val < 0.6;
    conduitMeshesRef.current.forEach((mesh) => {
      if (mesh && mesh.material) {
        mesh.material.depthTest = !showThroughWalls;
        mesh.material.needsUpdate = true;
      }
    });
  }, []);

  // ─── Handlers do Teto ──────────────────────────────────────────────────
  const handleTetoOpacityChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setTetoOpacidade(val);
    tetoOpacidadeRef.current = val;
    if (tetoMatRef.current) {
      tetoMatRef.current.opacity = val;
      tetoMatRef.current.needsUpdate = true;
    }
    requestRender();
  }, [requestRender]);

  const handleTetoToggle = useCallback((e) => {
    const vis = e.target.checked;
    setTetoVisivel(vis);
    tetoMeshesRef.current.forEach((mesh) => {
      if (mesh) mesh.visible = vis;
    });
    requestRender();
  }, [requestRender]);

  // ─── Alternar Modo de Navegação (Orbital vs 1ª Pessoa) ──────────────────
  const handleToggleNavMode = useCallback((newMode) => {
    if (newMode === modoNavegacaoRef.current) return;
    setModoNavegacao(newMode);
    modoNavegacaoRef.current = newMode;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (newMode === "firstPerson") {
      if (camera && controls) {
        savedCameraPosRef.current = camera.position.clone();
        savedCameraTargetRef.current = controls.target.clone();
        controls.enabled = false;
      }

      if (camera) {
        let startX = 0, startZ = 10;
        let lookTargetX = 0, lookTargetZ = 0;

        if (floorMinXRef.current !== Infinity && floorMaxXRef.current !== -Infinity) {
          lookTargetX = (floorMinXRef.current + floorMaxXRef.current) / 2;
          lookTargetZ = (floorMinZRef.current + floorMaxZRef.current) / 2;
          startX = lookTargetX;
          // Posicionar 3.5 metros fora da parede frontal da casa
          startZ = floorMaxZRef.current + 3.5;
        } else if (savedCameraTargetRef.current) {
          lookTargetX = savedCameraTargetRef.current.x;
          lookTargetZ = savedCameraTargetRef.current.z;
          startX = lookTargetX;
          startZ = lookTargetZ + 6;
        }

        camera.position.set(startX, 1.65, startZ);
        camera.lookAt(lookTargetX, 1.65, lookTargetZ);
      }

      setTimeout(() => {
        fpsControlsRef.current?.lock();
      }, 50);
    } else {
      if (fpsControlsRef.current?.isLocked) {
        fpsControlsRef.current.unlock();
      }
      setIsLocked(false);
      // Limpar teclas residuais ao sair do modo FPS
      keysPressedRef.current = {};

      if (camera && controls && savedCameraPosRef.current && savedCameraTargetRef.current) {
        camera.position.copy(savedCameraPosRef.current);
        controls.target.copy(savedCameraTargetRef.current);
        controls.enabled = true;
        controls.update();
      }
    }
    requestRender();
  }, [requestRender]);

  return (
    <div className="canvas3d-container" ref={containerRef}>
      <canvas ref={canvasRef} />

      {modoNavegacao === "firstPerson" && (
        <>
          <div className="canvas3d-crosshair">+</div>
          <div className="canvas3d-fps-instructions">
            {isLocked ? (
              <span>⌨️ <strong>WASD / Setas</strong> para andar | 🐭 Rato para olhar | Pressione <kbd>ESC</kbd> para libertar</span>
            ) : (
              <span>👉 <strong>Clique no ecrã 3D</strong> para ativar o controlo do rato</span>
            )}
          </div>
        </>
      )}

      <div className="canvas3d-overlay">
        <div className="canvas3d-card">
          <div className="canvas3d-card-title">🔍 Visualização 3D</div>

          <div className="nav-mode-switcher">
            <button
              type="button"
              className={`nav-mode-btn ${modoNavegacao === "orbit" ? "active-orbit" : ""}`}
              onClick={() => handleToggleNavMode("orbit")}
              title="Vista Orbital 3D (Câmara livre em redor)"
            >
              🛸 Vista Orbital
            </button>
            <button
              type="button"
              className={`nav-mode-btn ${modoNavegacao === "firstPerson" ? "active-fps" : ""}`}
              onClick={() => handleToggleNavMode("firstPerson")}
              title="Passeio em 1ª Pessoa (Caminhar no interior)"
            >
              🚶 1ª Pessoa
            </button>
          </div>

          <button
            type="button"
            className="theme-toggle-3d"
            onClick={() => setModoDiaNoite((prev) => (prev === "dia" ? "noite" : "dia"))}
          >
            {modoDiaNoite === "dia" ? "☀️ Modo Dia (Solar)" : "🌙 Modo Noite (Iluminação)"}
          </button>

          <div className="control-group">
            <label>Opacidade das Paredes: {Math.round(wallOpacity * 100)}%</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={wallOpacity} onChange={handleOpacityChange}
              className="opacity-slider"
            />
          </div>

          <div className="control-group">
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={tetoVisivel} onChange={handleTetoToggle} />
              Mostrar Teto
            </label>
          </div>

          {tetoVisivel && (
            <div className="control-group">
              <label>Opacidade do Teto: {Math.round(tetoOpacidade * 100)}%</label>
              <input
                type="range" min="0" max="1" step="0.05"
                value={tetoOpacidade} onChange={handleTetoOpacityChange}
                className="opacity-slider"
              />
            </div>
          )}

          {rooms.length > 0 && (
            <div className="control-group">
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: "0.82rem" }}>Pé-Direito por Divisão</div>
              {rooms.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: "0.8rem" }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.nome}>{r.nome || `Divisão ${r.id}`}</span>
                  <input
                    type="number" min="2.0" max="6.0" step="0.1"
                    value={alturasPorRoom[r.id] || 2.8}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 2.0 && val <= 6.0) {
                        setAlturasPorRoom((prev) => ({ ...prev, [r.id]: val }));
                      }
                    }}
                    style={{ width: 58, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--border-color, #555)", background: "var(--bg-secondary, #1e1e2e)", color: "inherit", fontSize: "0.8rem" }}
                  />
                  <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>m</span>
                </div>
              ))}
            </div>
          )}

          {geometria && geometria.camadas && Object.keys(layerConfigs).length > 0 && (
            <div className="dxf-layers-config">
              <h4>Configuração de Camadas DXF (3D)</h4>
              <p className="subtitle">Defina o tipo e altura de cada camada:</p>
              <div className="layers-list">
                {Object.keys(layerConfigs).map((camada) => (
                  <div key={camada} className="layer-row" style={{ flexWrap: "wrap" }}>
                    <span className="layer-name" title={camada}>{camada}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <select
                        value={layerConfigs[camada]}
                        onChange={(e) => handleLayerConfigChange(camada, e.target.value)}
                        className="layer-select"
                      >
                        <option value="parede">🧱 Parede</option>
                        <option value="janela">🪟 Janela</option>
                        <option value="porta">🚪 Porta/Vão</option>
                        <option value="teto">🏗️ Teto</option>
                        <option value="mobiliario">🛋️ Mobiliário/Outro</option>
                      </select>
                      {layerConfigs[camada] === "parede" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <input
                            type="number" min="1.0" max="8.0" step="0.1"
                            title="Altura da camada (m)"
                            value={alturasPorCamada[camada] || 2.8}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 1.0 && val <= 8.0) {
                                setAlturasPorCamada((prev) => ({ ...prev, [camada]: val }));
                              }
                            }}
                            style={{
                              width: 50,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid var(--border-color, #555)",
                              background: "var(--bg-secondary, #1e1e2e)",
                              color: "inherit",
                              fontSize: "0.75rem",
                            }}
                          />
                          <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>m</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="control-legend">
            <div className="legend-title">Instalação & Alturas (Z):</div>
            {[
              { cor: "#f59e0b", label: "Lâmpada: 2.70m" },
              { cor: "#ef4444", label: "Quadro Geral: 1.50m" },
              { cor: "#22c55e", label: "Interruptor: 1.10m" },
              { cor: "#3b82f6", label: "Tomada: 0.30m" },
            ].map((item) => (
              <div key={item.label} className="legend-item">
                <span className="dot" style={{ backgroundColor: item.cor }} />
                <span>{item.label}</span>
              </div>
            ))}
            <div className="legend-item">
              <span className="line" />
              <span>Cablagem (3D Bezier)</span>
            </div>
          </div>

          <div className="canvas3d-tips">
            <strong>Como navegar:</strong>
            {modoNavegacao === "firstPerson" ? (
              <ul>
                <li>⌨️ WASD / Setas: Caminhar</li>
                <li>🖱 Rato: Olhar em redor (360°)</li>
                <li><kbd>ESC</kbd>: Libertar ponteiro do rato</li>
              </ul>
            ) : (
              <ul>
                <li>🖱 Botão esquerdo: Rodar câmara</li>
                <li>🖱 Botão direito / Shift: Arrastar</li>
                <li>☸ Scroll: Fazer Zoom</li>
              </ul>
            )}
          </div>

          <button className="canvas3d-close-btn" onClick={onClose}>
            Voltar para 2D (Edição)
          </button>
        </div>
      </div>
    </div>
  );
}
