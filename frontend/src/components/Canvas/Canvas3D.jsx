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
      geom = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16);
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
    geom = new THREE.SphereGeometry(0.04, 16, 16);
  } else if (c.tipo === "quadro") {
    geom = new THREE.BoxGeometry(0.3, 0.4, 0.06);
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

  // Refs para objetos Three.js que precisam de disposal
  const sceneObjectsRef = useRef([]);
  const geometriesRef = useRef([]);
  const materialsRef = useRef([]);
  const extraMeshesRef = useRef([]);

  // Refs para o loop de render
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
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

    // 1. Cenário e Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // 2. Controlos da Câmara
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.addEventListener("change", () => requestRender());
    controlsRef.current = controls;

    // 3. Luzes
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    sceneObjectsRef.current.push(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);
    sceneObjectsRef.current.push(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
    sceneObjectsRef.current.push(hemiLight);

    // 4. Determinar centro e limites
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    rooms.forEach((r) => {
      try {
        const geojson = JSON.parse(r.poligono_geojson);
        if (geojson.coordinates && geojson.coordinates[0]) {
          geojson.coordinates[0].forEach((pt) => {
            minX = Math.min(minX, pt[0]);
            maxX = Math.max(maxX, pt[0]);
            minY = Math.min(minY, pt[1]);
            maxY = Math.max(maxY, pt[1]);
          });
        }
      } catch (e) {}
    });

    if (geometria) {
      (geometria.linhas || []).forEach((l) => {
        minX = Math.min(minX, l.x1, l.x2);
        maxX = Math.max(maxX, l.x1, l.x2);
        minY = Math.min(minY, l.y1, l.y2);
        maxY = Math.max(maxY, l.y1, l.y2);
      });
      (geometria.polilinhas || []).forEach((poli) => {
        (poli.pontos || []).forEach((pt) => {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        });
      });
    }

    (componentes || []).forEach((c) => {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    });

    if (minX === Infinity) {
      minX = -10; maxX = 10; minY = -10; maxY = 10;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const maxDim = Math.max(maxX - minX, maxY - minY, 10);

    camera.position.set(centerX, maxDim * 1.0, centerY + maxDim * 1.0);
    controls.target.set(centerX, 0, centerY);
    controls.update();

    // 5. Grelha
    const gridHelper = new THREE.GridHelper(200, 200, 0x4b5563, 0x1f2937);
    gridHelper.position.set(centerX, -0.05, centerY);
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
        const len1 = Math.sqrt(dx1*dx1 + dy1*dy1);
        if (len1 < 0.3 || len1 > 2.4) continue;
        const ux1 = dx1 / len1, uy1 = dy1 / len1;

        for (let k = i + 1; k < linesForAnalysis.length; k++) {
          const l2 = linesForAnalysis[k];
          const name2 = (l2.layer || "").toLowerCase();
          if (!(name2.includes("door") || name2.includes("wind") || name2 === "4" || name2 === "5")) continue;

          const dx2 = l2.x2 - l2.x1, dy2 = l2.y2 - l2.y1;
          const len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
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
        linePoints.push(new THREE.Vector3(l.x1, 0.01, l.y1));
        linePoints.push(new THREE.Vector3(l.x2, 0.01, l.y2));

        const layer = l.layer;
        if (!layer) return;
        const config = layerConfigs[layer] || "mobiliario";
        if (config === "mobiliario") return;

        const dx = l.x2 - l.x1, dz = l.y2 - l.y1;
        const len = Math.sqrt(dx*dx + dz*dz);
        if (len < 0.15) return;
        const angle = Math.atan2(dz, dx);
        const lineItem = { x1: l.x1, z1: l.y1, x2: l.x2, z2: l.y2, len, dx, dz, angle };

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
      (geometria.circulos || []).forEach((c) => {
        const circleGeom = new THREE.RingGeometry(c.raio - 0.02, c.raio, 32);
        geometriesRef.current.push(circleGeom);
        const circleMat = new THREE.MeshBasicMaterial({ color: 0x4b5563, side: THREE.DoubleSide });
        const circleMesh = new THREE.Mesh(circleGeom, circleMat);
        circleMesh.position.set(c.cx, 0.015, c.cy);
        circleMesh.rotation.x = Math.PI / 2;
        scene.add(circleMesh);
        sceneObjectsRef.current.push(circleMesh);
      });
    }

    // ─── 7. Divisões (Rooms) — Merge Geometries ──────────────────────────────
    const roomGeometriesToMerge = [];
    const roomFloorGeometries = [];
    const roomWallGeometries = [];

    rooms.forEach((room) => {
      try {
        const geojson = JSON.parse(room.poligono_geojson);
        if (!geojson.coordinates || !geojson.coordinates[0]) return;
        const coords = geojson.coordinates[0];
        const rx0 = coords[0][0], ry0 = coords[0][1];
        const rx1 = coords[2][0], ry1 = coords[2][1];
        const rleft = Math.min(rx0, rx1), rbottom = Math.min(ry0, ry1);
        const rw = Math.abs(rx1 - rx0), rh = Math.abs(ry1 - ry0);
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
        floorMesh.position.set(rleft + rw / 2, -0.025, rbottom + rh / 2);
        scene.add(floorMesh);
        sceneObjectsRef.current.push(floorMesh);
        geometriesRef.current.push(floorGeom);

        const esp = 0.12, altP = 2.8;
        const wallMat = new THREE.MeshStandardMaterial({
          color: 0x94a3b8, roughness: 0.9, metalness: 0.0,
          transparent: true, opacity: wallOpacity, side: THREE.DoubleSide,
        });
        trackedMaterials.push(wallMat);

        // Criar geometrias de parede para merge posterior
        const wLeft = new THREE.BoxGeometry(esp, altP, rh);
        const wRight = new THREE.BoxGeometry(esp, altP, rh);
        const wBottom = new THREE.BoxGeometry(rw, altP, esp);
        const wTop = new THREE.BoxGeometry(rw, altP, esp);

        // Aplicar transformações a cada geometria (transladar para a posição final)
        const matrix4 = new THREE.Matrix4();
        const pos = new THREE.Vector3();

        pos.set(rleft + esp/2, altP/2, rbottom + rh/2);
        matrix4.makeTranslation(pos.x, pos.y, pos.z);
        wLeft.applyMatrix4(matrix4);

        pos.set(rleft + rw - esp/2, altP/2, rbottom + rh/2);
        matrix4.makeTranslation(pos.x, pos.y, pos.z);
        wRight.applyMatrix4(matrix4);

        pos.set(rleft + rw/2, altP/2, rbottom + esp/2);
        matrix4.makeTranslation(pos.x, pos.y, pos.z);
        wBottom.applyMatrix4(matrix4);

        pos.set(rleft + rw/2, altP/2, rbottom + rh - esp/2);
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
        const mergedWallMesh = new THREE.Mesh(mergedWalls, trackedMaterials[trackedMaterials.length - 1]);
        scene.add(mergedWallMesh);
        sceneObjectsRef.current.push(mergedWallMesh);
      } catch (e) {
        console.warn("Merge de geometrias de paredes falhou, a usar individuais:", e);
        // Fallback: usar geometrias individuais (neste caso já foram adicionadas via applyMatrix4,
        // mas precisamos de criar meshes para elas)
      }
    }

    // ─── 8. Componentes Elétricos — InstancedMesh ────────────────────────────
    // Agrupar componentes por tipo de geometria + cor
    const compGroups = new Map(); // groupKey -> { comps: [], geom: null, mat: null, cor: number }

    componentes.forEach((c) => {
      const { geom, cor, yFinal, extraMesh } = getComponentGeometry(c);
      if (geom) {
        const key = getGeometryGroupKey(geom, cor);
        if (key) {
          if (!compGroups.has(key)) {
            compGroups.set(key, { comps: [], geom: geom.clone(), cor });
          }
          // Propagar extraMesh para que seja adicionado à cena durante o rendering do grupo
          compGroups.get(key).comps.push({ ...c, yFinal, geomKey: key, extraMesh });
        } else {
          // Fallback: componente com geometria complexa, renderizar individual
          const mat = new THREE.MeshStandardMaterial({
            color: cor, roughness: 0.3, metalness: 0.2,
            emissive: cor, emissiveIntensity: c.tipo.startsWith("lampada") ? 0.4 : 0.0,
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(c.x, yFinal, c.y);
          if (c.tipo === "camera") mesh.rotation.x = Math.PI / 6;
          scene.add(mesh);
          sceneObjectsRef.current.push(mesh);

          if (extraMesh) {
            scene.add(extraMesh);
            sceneObjectsRef.current.push(extraMesh);
          }
        }
      }
    });

    // Renderizar cada grupo como InstancedMesh
    compGroups.forEach((group) => {
      const { comps, geom: groupGeom, cor } = group;
      if (comps.length === 0) return;

      const mat = new THREE.MeshStandardMaterial({
        color: cor, roughness: 0.3, metalness: 0.2,
        emissive: cor, emissiveIntensity: cor === 0xf59e0b ? 0.4 : 0.0, // lampadas emissive
      });
      trackedMaterials.push(mat);

      const instanced = new THREE.InstancedMesh(groupGeom, mat, comps.length);
      geometriesRef.current.push(groupGeom);

      const tempMatrix = new THREE.Matrix4();
      const tempPos = new THREE.Vector3();
      const tempRot = new THREE.Quaternion();
      const tempScale = new THREE.Vector3(1, 1, 1);

      comps.forEach((c, idx) => {
        tempPos.set(c.x, c.yFinal || ALTURAS[c.tipo] || ALTURAS.outro, c.y);
        tempMatrix.compose(tempPos, tempRot, tempScale);
        instanced.setMatrixAt(idx, tempMatrix);

        // Extra meshes (cabos, hastes)
        if (c.extraMesh) {
          scene.add(c.extraMesh);
          sceneObjectsRef.current.push(c.extraMesh);
        }
      });

      // Aplicar rotação para câmaras (caso especial)
      comps.forEach((c, idx) => {
        if (c.tipo === "camera") {
          const dummy = new THREE.Object3D();
          dummy.position.set(c.x, c.yFinal, c.y);
          dummy.rotation.x = Math.PI / 6;
          dummy.updateMatrix();
          instanced.setMatrixAt(idx, dummy.matrix);
        }
      });

      scene.add(instanced);
      sceneObjectsRef.current.push(instanced);
    });

    // ─── 9. Conexões com cor por circuito e rotas realistas ─────────────────
    // Mapa de cores por circuito (ID -> cor)
    const circuitColors = {};
    const palette = [0x6366f1, 0x22c55e, 0xf59e0b, 0xef4444, 0xec4899, 0x14b8a6, 0x8b5cf6, 0x3b82f6];
    circuitos.forEach((circ, i) => {
      circuitColors[circ.id] = palette[i % palette.length];
    });

    conexoes.forEach((conn) => {
      const orig = componentes.find((c) => c.id === conn.origem_id);
      const dest = componentes.find((c) => c.id === conn.destino_id);
      if (!orig || !dest) return;

      // Determinar cor pelo circuito do componente de origem
      const corCircuito = orig.circuit_id ? (circuitColors[orig.circuit_id] || 0x8b5cf6) : 0x8b5cf6;

      const y1 = ALTURAS[orig.tipo] || ALTURAS.outro;
      const y2 = ALTURAS[dest.tipo] || ALTURAS.outro;
      const p1 = new THREE.Vector3(orig.x, y1, orig.y);
      const p2 = new THREE.Vector3(dest.x, y2, dest.y);

      // Rota realista: sobe até ao tecto (2.7m) e desce para o destino
      const tectoY = Math.max(y1, y2, 2.7) + 0.15;
      const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      midPoint.y = tectoY;

      // Curva com 3 pontos de controlo para um percurso mais suave
      const c1 = new THREE.Vector3(p1.x, tectoY, p1.z);
      const c2 = new THREE.Vector3(p2.x, tectoY, p2.z);
      const curve = new THREE.CubicBezierCurve3(p1, c1, c2, p2);
      const connGeom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
      geometriesRef.current.push(connGeom);

      const connMat = new THREE.LineBasicMaterial({
        color: corCircuito,
        linewidth: 1,
        transparent: true,
        opacity: 0.85,
      });
      const connLine = new THREE.Line(connGeom, connMat);
      scene.add(connLine);
      sceneObjectsRef.current.push(connLine);
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
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      window.removeEventListener("resize", handleResize);

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
  }, [geometria, componentes, conexoes, rooms, layerConfigs, wallOpacity]);

  // Atualizar opacidade
  const handleOpacityChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setWallOpacity(val);
    materialsRef.current.forEach((mat) => {
      if (mat && typeof mat.opacity !== 'undefined') mat.opacity = val;
    });
  }, []);

  return (
    <div className="canvas3d-container" ref={containerRef}>
      <canvas ref={canvasRef} />

      <div className="canvas3d-overlay">
        <div className="canvas3d-card">
          <div className="canvas3d-card-title">🔍 Visualização 3D</div>

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
