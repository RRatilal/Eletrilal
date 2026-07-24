import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import "./Canvas3D.css";

// Alturas regulamentares padrão (em metros)
const ALTURAS = {
  lampada: 2.7, lampada_simples: 2.7, lampada_spot: 2.7,
  lampada_tubular: 2.7, lampada_led: 2.7, lampada_pendente: 2.5,
  lampada_arandela: 1.8,
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
  lampada_pendente: 0xf59e0b,
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

// ─── Helper: obter geometria e metadados de um componente ─────────────────────
function getComponentGeometry(c) {
  const yAlt = ALTURAS[c.tipo] || ALTURAS.outro;
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
      const alturaCabo = 2.7 - yAlt;
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
    geom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
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
  if (!obj) return;
  if (obj.geometry) {
    obj.geometry.dispose();
  }
  if (obj.material) {
    if (Array.isArray(obj.material)) {
      obj.material.forEach(m => m.dispose());
    } else {
      obj.material.dispose();
    }
  }
  if (obj.children) {
    obj.children.forEach(child => disposeObject(child));
  }
}

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

  // Refs para objetos Three.js que precisam de disposal
  const sceneObjectsRef = useRef([]);
  const geometriesRef = useRef([]);
  const materialsRef = useRef([]);
  const conduitMeshesRef = useRef([]);  // Meshes de condutos para controlo de visibilidade
  const extraMeshesRef = useRef([]);

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

  // ─── Render on Demand ─────────────────────────────────────────────────────
  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
    if (!animFrameIdRef.current && !isDisposedRef.current) {
      animFrameIdRef.current = requestAnimationFrame(function renderLoop() {
        animFrameIdRef.current = null;
        if (isDisposedRef.current) return;
        if (needsRenderRef.current) {
          controlsRef.current?.update();
          rendererRef.current?.render(sceneRef.current, cameraRef.current);
          needsRenderRef.current = false;
        }
      });
    }
  }, []);

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
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const isDia = modoDiaNoite === "dia";

    // 1. Cenário e Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDia ? 0xf1f5f9 : 0x0f172a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current = renderer;

    // 2. Controlos da Câmara
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.addEventListener("change", () => requestRender());
    controlsRef.current = controls;

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
    const gridDivisions = Math.min(100, Math.max(20, Math.ceil(maxDim * 3)));
    const gridHelper = new THREE.GridHelper(200, gridDivisions, gridCenterColor, gridLineColor);
    gridHelper.position.set(centerX, -0.05, centerZ);
    scene.add(gridHelper);
    sceneObjectsRef.current.push(gridHelper);

    // ─── Recolher materiais para controlo de opacidade ──────────────────────
    const trackedMaterials = [];
    materialsRef.current = trackedMaterials;

    // ─── 6. Geometria DXF ───────────────────────────────────────────────────
    if (geometria) {
      const linePoints = [];
      const espessura = 0.15;
      const altParede = 2.8;

      const dxfWallMat = new THREE.MeshStandardMaterial({
        color: 0x7f8c8d, roughness: 0.9, metalness: 0.0,
        transparent: true, opacity: wallOpacity, side: THREE.DoubleSide,
      });
      trackedMaterials.push(dxfWallMat);
      geometriesRef.current.push(dxfWallMat);

      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8, roughness: 0.1, metalness: 0.9,
        transparent: true, opacity: 0.45, side: THREE.DoubleSide,
      });
      trackedMaterials.push(glassMat);
      geometriesRef.current.push(glassMat);

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

      const wallsToCreate = [], sillsToCreate = [], headersToCreate = [], glassesToCreate = [];

      linesForAnalysis.forEach((l, index) => {
        const z1 = -l.y1;
        const z2 = -l.y2;
        linePoints.push(new THREE.Vector3(l.x1, 0.01, z1));
        linePoints.push(new THREE.Vector3(l.x2, 0.01, z2));

        const layer = l.layer;
        if (!layer) return;
        const config = layerConfigs[layer] || "mobiliario";
        if (config === "mobiliario") return;

        const dx = l.x2 - l.x1, dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.15) return;
        const angle = Math.atan2(dz, dx);
        const lineItem = { x1: l.x1, z1, x2: l.x2, z2, len, dx, dz, angle };

        if (config === "parede") {
          wallsToCreate.push(lineItem);
        } else if (config === "janela") {
          sillsToCreate.push(lineItem); headersToCreate.push(lineItem); glassesToCreate.push(lineItem);
        } else if (config === "porta" && isWindowLine[index]) {
          sillsToCreate.push(lineItem); headersToCreate.push(lineItem); glassesToCreate.push(lineItem);
        }
      });

      // D. Paredes em InstancedMesh
      if (wallsToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedMesh = new THREE.InstancedMesh(baseGeom, dxfWallMat, wallsToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        wallsToCreate.forEach((w, idx) => {
          tempPos.set((w.x1 + w.x2) / 2, altParede / 2, (w.z1 + w.z2) / 2);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, altParede, espessura);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          instancedMesh.setMatrixAt(idx, tempMatrix);
        });
        scene.add(instancedMesh);
        sceneObjectsRef.current.push(instancedMesh);
      }

      // E. Peitoris
      if (sillsToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedSills = new THREE.InstancedMesh(baseGeom, dxfWallMat, sillsToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        sillsToCreate.forEach((w, idx) => {
          tempPos.set((w.x1 + w.x2) / 2, 0.45, (w.z1 + w.z2) / 2);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, 0.9, espessura);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          instancedSills.setMatrixAt(idx, tempMatrix);
        });
        scene.add(instancedSills);
        sceneObjectsRef.current.push(instancedSills);
      }

      // F. Vergas
      if (headersToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedHeaders = new THREE.InstancedMesh(baseGeom, dxfWallMat, headersToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        headersToCreate.forEach((w, idx) => {
          tempPos.set((w.x1 + w.x2) / 2, 2.45, (w.z1 + w.z2) / 2);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, 0.7, espessura);
          tempMatrix.compose(tempPos, tempRot, tempScale);
          instancedHeaders.setMatrixAt(idx, tempMatrix);
        });
        scene.add(instancedHeaders);
        sceneObjectsRef.current.push(instancedHeaders);
      }

      // G. Vidros
      if (glassesToCreate.length > 0) {
        const baseGeom = new THREE.BoxGeometry(1, 1, 1);
        geometriesRef.current.push(baseGeom);
        const instancedGlasses = new THREE.InstancedMesh(baseGeom, glassMat, glassesToCreate.length);
        const tempMatrix = new THREE.Matrix4(), tempPos = new THREE.Vector3();
        const tempRot = new THREE.Quaternion(), tempScale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0);

        glassesToCreate.forEach((w, idx) => {
          tempPos.set((w.x1 + w.x2) / 2, 1.5, (w.z1 + w.z2) / 2);
          tempRot.setFromAxisAngle(yAxis, -w.angle);
          tempScale.set(w.len, 1.2, 0.03);
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

      // Círculos
      if ((geometria.circulos || []).length > 0) {
        const circleGeoms = [];
        const matrix = new THREE.Matrix4();
        (geometria.circulos || []).forEach((c) => {
          const ringGeom = new THREE.RingGeometry(Math.max(0.001, c.raio - 0.02), c.raio, 16);
          matrix.makeRotationX(Math.PI / 2);
          matrix.setPosition(c.cx, 0.015, -c.cy);
          ringGeom.applyMatrix4(matrix);
          circleGeoms.push(ringGeom);
          geometriesRef.current.push(ringGeom);
        });
        if (circleGeoms.length > 0) {
          try {
            const mergedCircles = mergeGeometries(circleGeoms, false);
            geometriesRef.current.push(mergedCircles);
            const circleMat = new THREE.MeshBasicMaterial({ color: 0x4b5563, side: THREE.DoubleSide });
            trackedMaterials.push(circleMat);
            const circleMesh = new THREE.Mesh(mergedCircles, circleMat);
            scene.add(circleMesh);
            sceneObjectsRef.current.push(circleMesh);
          } catch (e) {
            console.warn("Merge de círculos falhou:", e);
          }
        }
      }
    }

    // ─── 7. Divisões (Rooms) — Merge Geometries ──────────────────────────────
    const roomWallGeometries = [];
    const roomWallMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, roughness: 0.9, metalness: 0.0,
      transparent: true, opacity: wallOpacity, side: THREE.DoubleSide,
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
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);
        sceneObjectsRef.current.push(floorMesh);
        geometriesRef.current.push(floorGeom);

        const esp = 0.12, altP = 2.8;

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
        mergedWallMesh.castShadow = true;
        mergedWallMesh.receiveShadow = true;
        scene.add(mergedWallMesh);
        sceneObjectsRef.current.push(mergedWallMesh);
      } catch (e) {
        console.warn("Merge de geometrias de paredes falhou, a usar individuais:", e);
      }
    }

    // ─── 8. Componentes Elétricos — InstancedMesh + Iluminação Interativa ─────
    const compGroups = new Map();
    const switchMeshesRef = [];
    const lampStateMapRef = { current: new Map() };

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

    // Helper: determinar quais lâmpadas estão ligadas a um interruptor (ESTRITAMENTE por rótulos/comandos)
    const getLinkedLamps = (switchComp) => {
      const switchComandos = getComponentComandosArray(switchComp);
      const linkedIds = new Set();

      // Matched ESTRITAMENTE por Comando/Rótulo (ex: "a" ou ["a", "b"])
      if (switchComandos.length > 0) {
        componentes.forEach((c) => {
          if (c.tipo.startsWith("lampada")) {
            const lampComandos = getComponentComandosArray(c);
            const hasMatch = switchComandos.some((sc) => lampComandos.includes(sc));
            if (hasMatch) {
              linkedIds.add(c.id);
            }
          }
        });
      }

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
        } catch {}
      }
      return 0;
    };

    // Helper para atualizar visual da lâmpada (ON/OFF)
    const updateLamp3DState = (lampObjs) => {
      const { pointLight, haloSprite, spotFloorMesh, lampMesh, baseWatts, isOn, hasPower } = lampObjs;

      // Uma luz SÓ acende se tiver potência configurada (> 0 W) E o interruptor associado estiver LIGADO (isOn)
      const shouldBeLit = hasPower && isOn;

      if (shouldBeLit) {
        const lightIntensity = Math.min(3.5, Math.max(1.2, 1.0 + baseWatts / 30));
        if (pointLight) pointLight.intensity = lightIntensity;
        if (haloSprite) haloSprite.material.opacity = 0.8;
        if (spotFloorMesh) spotFloorMesh.material.opacity = 0.35;
        if (lampMesh && lampMesh.material) {
          lampMesh.material.color.setHex(0xfbbf24); // Amarelo aceso brilhante
          lampMesh.material.emissive.setHex(0xfbbf24);
          lampMesh.material.emissiveIntensity = isDia ? 0.4 : 2.0;
        }
      } else {
        if (pointLight) pointLight.intensity = 0.0;
        if (haloSprite) haloSprite.material.opacity = 0.0;
        if (spotFloorMesh) spotFloorMesh.material.opacity = 0.0;
        if (lampMesh && lampMesh.material) {
          lampMesh.material.color.setHex(0x64748b); // Cinza desligado
          lampMesh.material.emissive.setHex(0x000000);
          lampMesh.material.emissiveIntensity = 0.0;
        }
      }
    };

    let shadowPointLightCount = 0;

    componentes.forEach((c) => {
      const { geom, cor, yFinal, extraMesh } = getComponentGeometry(c);
      const watts = getComponentWatts(c);
      const hasPower = watts > 0;

      let lampPointLight = null;
      let lampHaloSprite = null;
      let lampFloorMesh = null;

      // Criar fontes de luz para todas as lâmpadas
      if (c.tipo.startsWith("lampada")) {
        // 1. PointLight real (inicia com intensidade 0.0)
        const lightDistance = Math.max(5.0, 4.0 + Math.sqrt(watts > 0 ? watts : 60) * 0.5);

        lampPointLight = new THREE.PointLight(0xffedd5, 0.0, lightDistance, 1.5);
        lampPointLight.position.set(c.x, yFinal - 0.1, -c.y);

        // Limitar PointLights com sombra a 2 no máximo para não estourar os limites de textura da GPU (MAX_TEXTURE_IMAGE_UNITS)
        if (shadowPointLightCount < 2) {
          lampPointLight.castShadow = true;
          lampPointLight.shadow.mapSize.width = 512;
          lampPointLight.shadow.mapSize.height = 512;
          lampPointLight.shadow.bias = -0.002;
          lampPointLight.shadow.radius = 4;
          shadowPointLightCount++;
        } else {
          lampPointLight.castShadow = false;
        }

        scene.add(lampPointLight);
        sceneObjectsRef.current.push(lampPointLight);

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
        lampHaloSprite.position.set(c.x, yFinal - 0.05, -c.y);
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
            mesh.userData = { isSwitch: true, component: c };
            switchMeshesRef.push(mesh);
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
              isOn: false, // Inicia desligada
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

    const domElem = renderer.domElement;

    const handlePointerDown = (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e) => {
      const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (dist > 5) return; // Se arrastou a câmara, ignora o clique

      const rect = domElem.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(switchMeshesRef, true);

      if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit && !hit.userData?.isSwitch && hit.parent) {
          hit = hit.parent;
        }
        if (hit && hit.userData?.isSwitch) {
          const switchComp = hit.userData.component;
          const linkedLampIds = getLinkedLamps(switchComp);

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
    const conduitTubularSegments = 12; // otimizado de 32 -> 12
    const conduitRadialSegments = 5;   // otimizado de 8 -> 5
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

      let pathCurve;
      const hasCurve = conn.c1_x != null && conn.c1_y != null;

      if (hasCurve) {
        // Conduto curvado — usar ponto de controlo da BD para Bezier
        const tectoY = Math.max(y1, y2, 2.7) + 0.15;
        const c1 = new THREE.Vector3(p1.x, tectoY, p1.z);
        const c2 = new THREE.Vector3(p2.x, tectoY, p2.z);
        pathCurve = new THREE.CubicBezierCurve3(p1, c1, c2, p2);
      } else {
        // Conduto recto — criar curvas de 90º para entrada em tomadas e interruptores
        const topY = Math.max(y1, y2, 2.7) + 0.05;

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

        const origRoute = getWallEntryPoints(orig, y1, topY);
        const destRoute = getWallEntryPoints(dest, y2, topY);

        // Combinar pontos da origem até ao topo, atravessar até ao topo do destino e descer em 90º
        const pathPoints = [
          ...origRoute.points,
          ...destRoute.points.slice().reverse(),
        ];

        pathCurve = new THREE.CatmullRomCurve3(pathPoints, false, "catmullrom", 0.0);
      }

      // Tubo cilíndrico realista (estilo eletroduto PVC corrugado)
      const tubeGeom = new THREE.TubeGeometry(pathCurve, conduitTubularSegments, conduitRadius, conduitRadialSegments, false);
      geometriesRef.current.push(tubeGeom);

      const tubeMesh = new THREE.Mesh(tubeGeom, sharedTubeMat);
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

    // ─── Primeiro render ────────────────────────────────────────────────────
    requestRender();

    // ─── Resize handler ─────────────────────────────────────────────────────
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener("resize", handleResize);

    // ─── Cleanup: disposal rigoroso ─────────────────────────────────────────
    return () => {
      isDisposedRef.current = true;
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
      domElem.removeEventListener("pointerdown", handlePointerDown);
      domElem.removeEventListener("pointerup", handlePointerUp);
      domElem.removeEventListener("pointermove", handlePointerMove);

      // Dispose de todos os objetos na cena
      sceneObjectsRef.current.forEach(disposeObject);
      sceneObjectsRef.current = [];

      // Dispose de geometrias rastreadas
      geometriesRef.current.forEach(g => {
        if (g && typeof g.dispose === 'function') g.dispose();
      });
      geometriesRef.current = [];

      // Dispose de materiais rastreados
      trackedMaterials.forEach(m => {
        if (m && typeof m.dispose === 'function') m.dispose();
      });
      materialsRef.current = [];

      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometria, componentes, conexoes, rooms, layerConfigs, wallOpacity, modoDiaNoite]);

  // Atualizar opacidade
  const handleOpacityChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setWallOpacity(val);
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

  return (
    <div className="canvas3d-container" ref={containerRef}>
      <canvas ref={canvasRef} />

      <div className="canvas3d-overlay">
        <div className="canvas3d-card">
          <div className="canvas3d-card-title">🔍 Visualização 3D</div>

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

          {geometria && geometria.camadas && Object.keys(layerConfigs).length > 0 && (
            <div className="dxf-layers-config">
              <h4>Configuração de Camadas DXF (3D)</h4>
              <p className="subtitle">Defina o tipo de cada camada no modelo:</p>
              <div className="layers-list">
                {Object.keys(layerConfigs).map((camada) => (
                  <div key={camada} className="layer-row">
                    <span className="layer-name" title={camada}>{camada}</span>
                    <select
                      value={layerConfigs[camada]}
                      onChange={(e) => handleLayerConfigChange(camada, e.target.value)}
                      className="layer-select"
                    >
                      <option value="parede">🧱 Parede</option>
                      <option value="janela">🪟 Janela</option>
                      <option value="porta">🚪 Porta/Vão</option>
                      <option value="mobiliario">🛋️ Mobiliário/Outro</option>
                    </select>
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
            <ul>
              <li>🖱 Botão esquerdo: Rodar câmara</li>
              <li>🖱 Botão direito / Shift: Arrastar</li>
              <li>☸ Scroll: Fazer Zoom</li>
            </ul>
          </div>

          <button className="canvas3d-close-btn" onClick={onClose}>
            Voltar para 2D (Edição)
          </button>
        </div>
      </div>
    </div>
  );
}
