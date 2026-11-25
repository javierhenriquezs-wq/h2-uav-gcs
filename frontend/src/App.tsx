import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Flame, Navigation,
  Play, Pause, RotateCcw, AlertTriangle, Camera, Download, Cpu,
  Hand, Plane, Sliders, Grid, CheckCircle2, Power, ArrowUpCircle, ArrowDownCircle, Layers, Compass
} from 'lucide-react';
import L from 'leaflet';
import * as THREE from 'three';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/telemetry';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Waypoint {
  id: number;
  name: string;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
}

interface Telemetry {
  mode: string;
  authority: string;
  mission_paused: boolean;
  sim_speed: number;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  vspeed: number;
  heading: number;
  pitch: number;
  roll: number;
  throttle: number;
  h2_pressure_bar: number;
  h2_mass_kg: number;
  fuel_cell_kw: number;
  fuel_cell_temp: number;
  battery_soc: number;
  battery_voltage: number;
  comms_ok: boolean;
  pitot_ok: boolean;
  gps_sats: number;
  current_wp_idx: number;
  waypoints: Waypoint[];
  trail: [number, number][];
  alerts: { ts: number; level: string; msg: string; mode: string }[];
  ai_recommendation: string | null;
}

type AircraftId = 'H2_VALKYRIE' | 'SR_71' | 'F_35' | 'F_22';
type MapLayerId = 'SATELLITE' | 'TOPO' | 'DARK';
type CameraId = 'CAM1_PROA' | 'CAM2_GIMBAL' | 'CAM3_NADIR' | 'CAM4_FLIR' | 'CAM5_ALA_IZQ' | 'CAM6_ALA_DER' | 'CAM7_VTAIL' | 'MULTI_7';

interface AircraftSpec {
  id: AircraftId;
  name: string;
  role: string;
  maxSpeedKmh: number;
  cruiseMach: string;
  ceilingM: number;
  speedMultiplier: number;
  altMultiplier: number;
  propulsionLabel: string;
  fuelLabel: string;
  accentColor: string;
  svgPath: string;
}

const AIRCRAFT_MODELS: Record<AircraftId, AircraftSpec> = {
  H2_VALKYRIE: {
    id: 'H2_VALKYRIE',
    name: 'H2-VALKYRIE',
    role: 'UAV Autónomo Hidrógeno PEM',
    maxSpeedKmh: 260,
    cruiseMach: 'Mach 0.22',
    ceilingM: 12000,
    speedMultiplier: 1.0,
    altMultiplier: 1.0,
    propulsionLabel: 'PROPULSIÓN HIDRÓGENO (PEM 700 BAR)',
    fuelLabel: 'PRESIÓN TANQUE H2',
    accentColor: '#0ea5e9',
    svgPath: 'M12 2L15 10L22 14L14 15L13 21L12 19L11 21L10 15L2 14L9 10L12 2Z',
  },
  SR_71: {
    id: 'SR_71',
    name: 'SR-71 BLACKBIRD',
    role: 'Reconocimiento Estratégico Supersónico',
    maxSpeedKmh: 3540,
    cruiseMach: 'Mach 3.2',
    ceilingM: 25900,
    speedMultiplier: 13.8,
    altMultiplier: 4.5,
    propulsionLabel: '2x PRATT & WHITNEY J58 TURBORAMJET',
    fuelLabel: 'COMBUSTIBLE JP-7 / POSTQUEMADOR',
    accentColor: '#f59e0b',
    svgPath: 'M12 1L13.5 8L16 11L21 18L16 18L15 22L14 19L12 21L10 19L9 22L8 18L3 18L8 11L10.5 8L12 1Z',
  },
  F_35: {
    id: 'F_35',
    name: 'F-35A LIGHTNING II',
    role: 'Caza Furtivo Polivalente 5ª Gen',
    maxSpeedKmh: 1960,
    cruiseMach: 'Mach 1.6',
    ceilingM: 15240,
    speedMultiplier: 7.6,
    altMultiplier: 2.6,
    propulsionLabel: 'PRATT & WHITNEY F135-PW-100',
    fuelLabel: 'COMBUSTIBLE INTERNO JP-8',
    accentColor: '#38bdf8',
    svgPath: 'M12 2L14 8L21 13L21 15L14 15L16 20L13 20L12 18L11 20L8 20L10 15L3 15L3 13L10 8L12 2Z',
  },
  F_22: {
    id: 'F_22',
    name: 'F-22 RAPTOR',
    role: 'Superioridad Aérea Supercrucero',
    maxSpeedKmh: 2410,
    cruiseMach: 'Mach 2.25',
    ceilingM: 19812,
    speedMultiplier: 9.4,
    altMultiplier: 3.4,
    propulsionLabel: '2x F119-PW-100 EMPUJE VECTORIAL 2D',
    fuelLabel: 'COMBUSTIBLE SUPERCRUCERO',
    accentColor: '#10b981',
    svgPath: 'M12 1.5L14.2 7.5L22 13.5L21 15.5L14.5 15L17 20.5L13.5 21L12 18.5L10.5 21L7 20.5L9.5 15L3 15.5L2 13.5L9.8 7.5L12 1.5Z',
  },
};

const MAP_LAYERS: Record<MapLayerId, { label: string; url: string; attribution: string; maxZoom: number }> = {
  SATELLITE: {
    label: 'Satélite HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
  TOPO: {
    label: 'Topográfico 3D',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Style: &copy; OpenTopoMap',
    maxZoom: 17,
  },
  DARK: {
    label: 'Táctico Oscuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  },
};

const CAMERAS: { id: CameraId; short: string; label: string; sensor: string; basePan: number }[] = [
  { id: 'CAM1_PROA', short: '1. PROA', label: 'CAM 01 // PROA 360° HUD', sensor: '4K 360° WIDE', basePan: 0 },
  { id: 'CAM2_GIMBAL', short: '2. GIMBAL', label: 'CAM 02 // TORRETA EO 360°', sensor: '30X OPT 360°', basePan: 0 },
  { id: 'CAM3_NADIR', short: '3. NADIR', label: 'CAM 03 // CENITAL NADIR 360°', sensor: 'ORTOFOTO LIVE', basePan: 0 },
  { id: 'CAM4_FLIR', short: '4. FLIR', label: 'CAM 04 // TÉRMICA LWIR 360°', sensor: 'FLIR 360° IR', basePan: 0 },
  { id: 'CAM5_ALA_IZQ', short: '5. ALA IZQ', label: 'CAM 05 // ENCASTRE ALA BABOR 360°', sensor: 'WING-L 360°', basePan: -75 },
  { id: 'CAM6_ALA_DER', short: '6. ALA DER', label: 'CAM 06 // ENCASTRE ALA ESTRIBOR 360°', sensor: 'WING-R 360°', basePan: 75 },
  { id: 'CAM7_VTAIL', short: '7. COLA', label: 'CAM 07 // EMPENAJE DORSAL 360°', sensor: 'TAIL-CAM 360°', basePan: 180 },
];

// Genera textura procedural de pista de aeropuerto con marcas de umbral, eje y desgaste de neumáticos
function createRunwayTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;

  // Asfalto base con grano
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 512, 2048);

  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 2048;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Líneas laterales blancas
  ctx.fillStyle = '#e4e4e7';
  ctx.fillRect(28, 0, 10, 2048);
  ctx.fillRect(474, 0, 10, 2048);

  // Chevrons amarillos previos al umbral
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  for (let y = 1860; y <= 1980; y += 55) {
    ctx.beginPath();
    ctx.moveTo(120, y + 35);
    ctx.lineTo(256, y);
    ctx.lineTo(392, y + 35);
    ctx.stroke();
  }

  // Barras de umbral (Threshold Piano Keys)
  ctx.fillStyle = '#f4f4f5';
  for (let x = 64; x <= 424; x += 48) {
    if (Math.abs(x - 246) < 28) continue;
    ctx.fillRect(x, 1690, 24, 130);
    ctx.fillRect(x, 180, 24, 130);
  }

  // Marcas de zona de toma de contacto (Touchdown zone) y huellas de goma
  ctx.fillStyle = 'rgba(9, 9, 11, 0.72)';
  ctx.fillRect(150, 1350, 75, 320);
  ctx.fillRect(287, 1350, 75, 320);

  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(130, 1450, 32, 95);
  ctx.fillRect(350, 1450, 32, 95);

  // Línea central discontinua
  for (let y = 340; y < 1650; y += 90) {
    ctx.fillRect(250, y, 12, 52);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

// Genera textura de terreno satelital procedural (Desierto de Atacama / Cordillera / Patagonia)
function createTerrainTexture(region: 'NORTH' | 'CENTRAL' | 'SOUTH', isFlir: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (isFlir) {
    ctx.fillStyle = '#27272a';
  } else if (region === 'NORTH') {
    ctx.fillStyle = '#8c5332';
  } else if (region === 'SOUTH') {
    ctx.fillStyle = '#1e3a2f';
  } else {
    ctx.fillStyle = '#4d5d36';
  }
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 2 + Math.random() * 14;
    if (isFlir) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(220,220,225,0.06)' : 'rgba(10,10,12,0.12)';
    } else if (region === 'NORTH') {
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(180,115,65,0.12)' : 'rgba(65,32,14,0.14)';
    } else if (region === 'SOUTH') {
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(34,85,60,0.14)' : 'rgba(15,35,28,0.16)';
    } else {
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(110,125,70,0.13)' : 'rgba(40,52,25,0.15)';
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cauces y caminos erosionados
  ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.08)' : 'rgba(45,25,12,0.18)';
  ctx.lineWidth = 2;
  for (let c = 0; c < 12; c++) {
    ctx.beginPath();
    let cx = Math.random() * 512;
    let cy = 0;
    ctx.moveTo(cx, cy);
    while (cy < 512) {
      cy += 32;
      cx += (Math.random() - 0.5) * 40;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  return tex;
}

// Motor gráfico 3D real en WebGL (Three.js) inspirado en Microsoft Flight Simulator
function FlightSim3DViewport({
  camId,
  aircraft,
  data,
  panOffset,
  tiltOffset,
  compact = false,
}: {
  camId: CameraId;
  aircraft: AircraftSpec;
  data: Telemetry | null;
  panOffset: number;
  tiltOffset: number;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ camId, aircraft, data, panOffset, tiltOffset, compact });
  stateRef.current = { camId, aircraft, data, panOffset, tiltOffset, compact };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xd99b52, 0.00052);

    const camera = new THREE.PerspectiveCamera(
      camId === 'CAM2_GIMBAL' ? 32 : 62,
      (container.clientWidth || 640) / (container.clientHeight || 400),
      0.2,
      3800
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 400);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Iluminación solar dorada + luz hemisférica atmosférica
    const hemiLight = new THREE.HemisphereLight(0xfff3d6, 0x4a2c18, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffdf9e, 2.2);
    sunLight.position.set(-450, 260, -850);
    scene.add(sunLight);

    // Cúpula celeste con gradiente hora dorada
    const skyGeo = new THREE.SphereGeometry(2800, 32, 20);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 32;
    skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d')!;
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    sGrad.addColorStop(0.0, '#071936');
    sGrad.addColorStop(0.38, '#2b588c');
    sGrad.addColorStop(0.48, '#f6c270');
    sGrad.addColorStop(0.53, '#fde68a');
    sGrad.addColorStop(1.0, '#78350f');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 32, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const skyDome = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);

    // Nubes volumétricas 3D suaves
    const cloudsGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.18,
      roughness: 0.95,
      transparent: true,
      opacity: 0.72,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1, 1);
    for (let i = 0; i < 42; i++) {
      const cluster = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffs; p++) {
        const mesh = new THREE.Mesh(puffGeo, cloudMat);
        mesh.scale.set(28 + Math.random() * 35, 9 + Math.random() * 10, 22 + Math.random() * 28);
        mesh.position.set((p - 1.5) * 24, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 18);
        cluster.add(mesh);
      }
      cluster.position.set(
        (Math.random() - 0.5) * 2400,
        140 + Math.random() * 140,
        (Math.random() - 0.5) * 2400
      );
      cloudsGroup.add(cluster);
    }
    scene.add(cloudsGroup);

    // Malla de terreno 3D con cañones laterales, valle central y cordillera de los Andes al fondo
    const terrainGeo = new THREE.PlaneGeometry(3200, 3200, 140, 140);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    const colors: number[] = [];

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      // Corredor plano central para aeropuerto y pista
      const distFromCenter = Math.abs(x);
      const corridorMask = THREE.MathUtils.smoothstep(distFromCenter, 55, 220);

      // Cañones erosionados a los costados y cordillera andina en el horizonte
      const ridgeNoise =
        Math.sin(x * 0.012) * Math.cos(z * 0.012) * 32 +
        Math.sin(x * 0.032 + z * 0.025) * 14 +
        Math.cos(x * 0.07 - z * 0.06) * 5;

      const andesBack = z < -550 ? Math.pow((-z - 550) / 1050, 1.55) * 260 : 0;
      const andesPeaks = z < -550 ? (Math.abs(Math.sin(x * 0.0085)) * 130 + Math.cos(x * 0.022) * 45) * THREE.MathUtils.smoothstep(-z, 550, 950) : 0;

      const height = Math.max(0, corridorMask * (Math.max(0, ridgeNoise) + 12)) + andesBack + andesPeaks;
      posAttr.setY(i, height);

      // Coloración por elevación (desierto ocre -> roca andina -> nieve en altas cumbres)
      if (height > 235) {
        colors.push(0.95, 0.96, 0.98); // Nieve
      } else if (height > 120) {
        colors.push(0.45, 0.36, 0.32); // Roca alta
      } else if (corridorMask < 0.3) {
        colors.push(0.68, 0.48, 0.32); // Explanada aeropuerto
      } else {
        colors.push(0.76, 0.45, 0.25); // Desierto / cañón
      }
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainTex = createTerrainTexture('NORTH', camId === 'CAM4_FLIR');
    const terrainMat = new THREE.MeshStandardMaterial({
      map: terrainTex,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);

    // Pista de aterrizaje 3D detallada + calle de rodaje + luces PAPI y borde
    const runwayGroup = new THREE.Group();
    const runwayTex = createRunwayTexture();
    const runwayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 680),
      new THREE.MeshStandardMaterial({ map: runwayTex, roughness: 0.78, metalness: 0.1 })
    );
    runwayMesh.rotation.x = -Math.PI / 2;
    runwayMesh.position.set(0, 0.25, -240);
    runwayGroup.add(runwayMesh);

    // Calle de rodaje (Taxiway) lateral derecha
    const taxiMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 520),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.85 })
    );
    taxiMesh.rotation.x = -Math.PI / 2;
    taxiMesh.position.set(52, 0.22, -230);
    runwayGroup.add(taxiMesh);

    // Luces emisivas de borde de pista y luces PAPI rojas/blancas
    const edgeLightGeo = new THREE.SphereGeometry(0.65, 8, 8);
    const whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const redLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });

    for (let z = 80; z >= -560; z -= 28) {
      const lLeft = new THREE.Mesh(edgeLightGeo, whiteLightMat);
      lLeft.position.set(-18.5, 0.6, z);
      const lRight = new THREE.Mesh(edgeLightGeo, whiteLightMat);
      lRight.position.set(18.5, 0.6, z);
      runwayGroup.add(lLeft, lRight);
    }

    // Luces de umbral (verdes) y luces PAPI laterales (rojas/blancas)
    for (let x = -16; x <= 16; x += 4) {
      const thresh = new THREE.Mesh(edgeLightGeo, greenLightMat);
      thresh.position.set(x, 0.65, 92);
      runwayGroup.add(thresh);
    }
    [-26, -29, -32, -35].forEach((px, idx) => {
      const papi = new THREE.Mesh(edgeLightGeo, idx < 2 ? redLightMat : whiteLightMat);
      papi.position.set(px, 0.8, 45);
      runwayGroup.add(papi);
    });
    scene.add(runwayGroup);

    // Grupo del avión (para anclar cámara en proa, alas, cola o nadir)
    const aircraftRig = new THREE.Group();
    scene.add(aircraftRig);

    // Cúpula / nariz compuesta visible en CAM1_PROA
    const noseMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.25, metalness: 0.8 })
    );
    noseMesh.position.set(0, -1.35, -1.85);
    noseMesh.rotation.x = 0.25;
    aircraftRig.add(noseMesh);

    // Alas compuestas visibles en CAM5_ALA_IZQ y CAM6_ALA_DER
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.75 });
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.14, 1.8), wingMat);
    leftWing.position.set(-4.5, -0.55, 0.4);
    leftWing.rotation.y = 0.18;
    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.14, 1.8), wingMat);
    rightWing.position.set(4.5, -0.55, 0.4);
    rightWing.rotation.y = -0.18;
    aircraftRig.add(leftWing, rightWing);

    // Estabilizadores dobles V-Tail visibles en CAM7_VTAIL
    const vTailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 1.4), wingMat);
    vTailLeft.position.set(-0.9, 0.7, 3.2);
    vTailLeft.rotation.z = 0.48;
    const vTailRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 1.4), wingMat);
    vTailRight.position.set(0.9, 0.7, 3.2);
    vTailRight.rotation.z = -0.48;
    aircraftRig.add(vTailLeft, vTailRight);

    let animId: number;
    let travelZ = 0;

    const animate = () => {
      const { camId: curCam, aircraft: curAc, data: curData, panOffset: curPan, tiltOffset: curTilt, compact: isCompact } = stateRef.current;

      const w = container.clientWidth || 640;
      const h = container.clientHeight || 400;
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      const effAlt = (curData?.alt ?? 0) * curAc.altMultiplier;
      const effSpeed = (curData?.speed ?? 0) * curAc.speedMultiplier;
      const rollRad = ((curData?.roll ?? 0) * Math.PI) / 180;
      const pitchRad = ((curData?.pitch ?? 0) * Math.PI) / 180;

      // Desplazamiento continuo sobre el terreno según velocidad real
      travelZ += (effSpeed / 3600) * 18;
      if (effAlt > 120) {
        terrainMesh.position.z = (travelZ % 200);
        runwayGroup.visible = false;
      } else {
        terrainMesh.position.z = 0;
        runwayGroup.visible = true;
      }

      // Nubes avanzando suavemente
      cloudsGroup.children.forEach((c, idx) => {
        c.position.z += 0.18 + (effSpeed / 2500);
        if (c.position.z > 1200) c.position.z = -1200;
        c.position.y = 140 + (idx % 5) * 28;
      });

      // Modo FLIR infrarrojo
      const isFlir = curCam === 'CAM4_FLIR';
      scene.fog = new THREE.FogExp2(isFlir ? 0x18181b : 0xd99b52, isFlir ? 0.00075 : 0.00048);
      skyDome.visible = !isFlir;
      renderer.setClearColor(isFlir ? 0x09090b : 0xd99b52);

      // Posición y actitud del avión en 3D
      const camAltitude = Math.max(4.5, 4.5 + effAlt * 0.08);
      aircraftRig.position.set(0, camAltitude, 55 - Math.min(280, travelZ * 0.25));
      aircraftRig.rotation.set(pitchRad, 0, -rollRad);

      // Visibilidad selectiva de piezas estructurales según la cámara activa
      noseMesh.visible = curCam === 'CAM1_PROA';
      leftWing.visible = curCam === 'CAM5_ALA_IZQ';
      rightWing.visible = curCam === 'CAM6_ALA_DER';
      vTailLeft.visible = curCam === 'CAM7_VTAIL';
      vTailRight.visible = curCam === 'CAM7_VTAIL';

      // Posicionamiento de cámara onboard 360°
      camera.fov = curCam === 'CAM2_GIMBAL' ? 28 : 62;
      camera.updateProjectionMatrix();

      const panRad = (-curPan * Math.PI) / 180;
      const tiltRad = (curTilt * Math.PI) / 180;

      if (curCam === 'CAM3_NADIR') {
        camera.position.copy(aircraftRig.position).add(new THREE.Vector3(0, -0.5, 0));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(-Math.PI / 2 + tiltRad * 0.4, panRad, -rollRad);
      } else if (curCam === 'CAM5_ALA_IZQ') {
        camera.position.copy(aircraftRig.position).add(new THREE.Vector3(-0.9, -0.1, 0.2));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
      } else if (curCam === 'CAM6_ALA_DER') {
        camera.position.copy(aircraftRig.position).add(new THREE.Vector3(0.9, -0.1, 0.2));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
      } else if (curCam === 'CAM7_VTAIL') {
        camera.position.copy(aircraftRig.position).add(new THREE.Vector3(0, 0.65, 1.4));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
      } else {
        camera.position.copy(aircraftRig.position).add(new THREE.Vector3(0, 0.15, -0.8));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
      }

      renderer.render(scene, camera);

      // Dibujar HUD instrumental nítido en capa 2D superior
      const hud = hudCanvasRef.current;
      if (hud) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (hud.width !== Math.floor(w * dpr) || hud.height !== Math.floor(h * dpr)) {
          hud.width = Math.floor(w * dpr);
          hud.height = Math.floor(h * dpr);
        }
        const hCtx = hud.getContext('2d')!;
        hCtx.save();
        hCtx.scale(dpr, dpr);
        hCtx.clearRect(0, 0, w, h);

        if (!isCompact) {
          const baseHeading = (curData?.heading ?? 180) + curPan;
          const az = Math.round(((baseHeading % 360) + 360) % 360);

          // Línea de horizonte artificial verde HUD
          hCtx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
          hCtx.lineWidth = 1.2;
          const horizonY = h * 0.44 + (curData?.pitch ?? 0) * 3 + curTilt * 2.5;
          hCtx.beginPath();
          hCtx.moveTo(0, horizonY);
          hCtx.lineTo(w, horizonY);
          hCtx.stroke();

          // Escalera de cabeceo (Pitch Ladder)
          hCtx.fillStyle = 'rgba(52, 211, 153, 0.85)';
          hCtx.font = '9px monospace';
          [-10, -5, 5, 10].forEach((deg) => {
            const py = horizonY - deg * 5;
            hCtx.beginPath();
            hCtx.moveTo(w / 2 - 42, py);
            hCtx.lineTo(w / 2 - 16, py);
            hCtx.moveTo(w / 2 + 16, py);
            hCtx.lineTo(w / 2 + 42, py);
            hCtx.stroke();
            hCtx.fillText(`${deg}`, w / 2 + 46, py + 3);
          });

          // Cinta superior de brújula 360°
          hCtx.fillStyle = 'rgba(0, 0, 0, 0.78)';
          hCtx.fillRect(w * 0.24, 6, w * 0.52, 22);
          hCtx.strokeStyle = '#3f3f46';
          hCtx.strokeRect(w * 0.24, 6, w * 0.52, 22);

          hCtx.strokeStyle = '#a1a1aa';
          hCtx.beginPath();
          for (let tick = -60; tick <= 60; tick += 15) {
            const tx = w / 2 + tick * 1.4;
            if (tx > w * 0.26 && tx < w * 0.74) {
              hCtx.moveTo(tx, 6);
              hCtx.lineTo(tx, tick % 30 === 0 ? 12 : 9);
            }
          }
          hCtx.stroke();

          hCtx.fillStyle = '#38bdf8';
          hCtx.font = 'bold 10px monospace';
          hCtx.textAlign = 'center';
          hCtx.fillText(`360° GIMBAL // AZ: ${az}° | TILT: ${Math.round(curTilt)}°`, w / 2, 23);
        }

        hCtx.restore();
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [camId]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <canvas ref={hudCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeCam, setActiveCam] = useState<CameraId>('CAM1_PROA');
  const [recording, setRecording] = useState(false);

  const [selectedAircraft, setSelectedAircraft] = useState<AircraftId>('H2_VALKYRIE');
  const [mapLayerId, setMapLayerId] = useState<MapLayerId>('SATELLITE');

  const [camPan, setCamPan] = useState(0);
  const [camTilt, setCamTilt] = useState(0);
  const isDraggingCam = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const [preflightChecked, setPreflightChecked] = useState(false);
  const [h2CellIgnited, setH2CellIgnited] = useState(false);
  const [gearDown, setGearDown] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const planeMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const trailLineRef = useRef<L.Polyline | null>(null);
  const wpLayerRef = useRef<L.LayerGroup | null>(null);

  const aircraft = AIRCRAFT_MODELS[selectedAircraft];

  const sendCmd = (payload: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => setData(JSON.parse(e.data));
      ws.onclose = () => {
        setConnected(false);
        timer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (CAMERAS[idx]) {
          setActiveCam(CAMERAS[idx].id);
          setCamPan(CAMERAS[idx].basePan);
          setCamTilt(0);
        }
      }
      if (e.key === '0') setActiveCam('MULTI_7');
      if (e.key === 'g' || e.key === 'G') setGearDown((prev) => !prev);
      if (e.key === 'r' || e.key === 'R') {
        const cam = CAMERAS.find((c) => c.id === activeCam);
        setCamPan(cam?.basePan ?? 0);
        setCamTilt(0);
      }

      if (e.key === 'ArrowLeft') setCamPan((p) => (p - 10 + 360) % 360);
      if (e.key === 'ArrowRight') setCamPan((p) => (p + 10) % 360);
      if (e.key === 'ArrowUp') setCamTilt((t) => Math.min(60, t + 6));
      if (e.key === 'ArrowDown') setCamTilt((t) => Math.max(-60, t - 6));

      if (!data || !['MANUAL', 'ASSISTED'].includes(data.mode)) return;
      if (e.key === 'w' || e.key === 'W') sendCmd({ action: 'MANUAL_INPUT', dpitch: 1.5 });
      if (e.key === 's' || e.key === 'S') sendCmd({ action: 'MANUAL_INPUT', dpitch: -1.5 });
      if (e.key === 'a' || e.key === 'A') sendCmd({ action: 'MANUAL_INPUT', droll: -3.0 });
      if (e.key === 'd' || e.key === 'D') sendCmd({ action: 'MANUAL_INPUT', droll: 3.0 });
      if (e.key === 'e' || e.key === 'E') sendCmd({ action: 'MANUAL_INPUT', dthrottle: 5 });
      if (e.key === 'q' || e.key === 'Q') sendCmd({ action: 'MANUAL_INPUT', dthrottle: -5 });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [data?.mode, activeCam]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-35.5, -71.0],
      zoom: 5,
      zoomControl: true,
    });

    const initialLayer = MAP_LAYERS[mapLayerId];
    tileLayerRef.current = L.tileLayer(initialLayer.url, {
      attribution: initialLayer.attribution,
      maxZoom: initialLayer.maxZoom,
    }).addTo(map);

    L.rectangle([[-56.0, -76.0], [-17.5, -66.5]], {
      color: '#ef4444',
      weight: 2,
      dashArray: '6, 6',
      fillOpacity: 0.02,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      sendCmd({
        action: 'ADD_WAYPOINT',
        lat: e.latlng.lat.toFixed(4),
        lon: e.latlng.lng.toFixed(4),
        alt: 4200,
        speed: 235,
      });
    });

    wpLayerRef.current = L.layerGroup().addTo(map);
    routeLineRef.current = L.polyline([], { color: '#38bdf8', weight: 3, dashArray: '6,6' }).addTo(map);
    trailLineRef.current = L.polyline([], { color: '#10b981', weight: 4 }).addTo(map);
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    const nextLayer = MAP_LAYERS[mapLayerId];
    tileLayerRef.current.setUrl(nextLayer.url);
  }, [mapLayerId]);

  useEffect(() => {
    if (!data || !mapRef.current) return;

    const planeIcon = L.divIcon({
      className: 'custom-uav-icon',
      html: `<div style="transform: rotate(${data.heading}deg); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 6px ${aircraft.accentColor});">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="${aircraft.accentColor}" stroke="#000000" stroke-width="1.6">
          <path d="${aircraft.svgPath}"/>
        </svg>
      </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    if (!planeMarkerRef.current) {
      planeMarkerRef.current = L.marker([data.lat, data.lon], { icon: planeIcon }).addTo(mapRef.current);
    } else {
      planeMarkerRef.current.setLatLng([data.lat, data.lon]);
      planeMarkerRef.current.setIcon(planeIcon);
    }

    routeLineRef.current?.setLatLngs(data.waypoints.map((w) => [w.lat, w.lon] as [number, number]));
    trailLineRef.current?.setLatLngs(data.trail);

    wpLayerRef.current?.clearLayers();
    data.waypoints.forEach((wp, i) => {
      const isCurrent = i === data.current_wp_idx;
      L.circleMarker([wp.lat, wp.lon], {
        radius: isCurrent ? 8 : 5,
        color: isCurrent ? '#f59e0b' : '#38bdf8',
        fillColor: isCurrent ? '#f59e0b' : '#0284c7',
        fillOpacity: 0.95,
      })
        .bindTooltip(`${wp.name} (${Math.round(wp.alt * aircraft.altMultiplier)}m)`, { direction: 'right' })
        .addTo(wpLayerRef.current!);
    });
  }, [data, aircraft]);

  const downloadBlackbox = async () => {
    const res = await fetch(`${API_URL}/api/blackbox`);
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${aircraft.name}-Blackbox-${Date.now()}.json`;
    a.click();
  };

  const handleResetSimulation = () => {
    sendCmd({ action: 'RESET_SIM' });
    setPreflightChecked(false);
    setH2CellIgnited(false);
    setGearDown(true);
  };

  const handleSelectCamera = (id: CameraId) => {
    setActiveCam(id);
    const meta = CAMERAS.find((c) => c.id === id);
    setCamPan(meta?.basePan ?? 0);
    setCamTilt(0);
  };

  const renderCameraViewport = (camId: CameraId, compact = false) => {
    const camMeta = CAMERAS.find((c) => c.id === camId) || CAMERAS[0];
    const effSpeed = Math.round((data?.speed ?? 0) * aircraft.speedMultiplier);
    const effAlt = Math.round((data?.alt ?? 0) * aircraft.altMultiplier);
    const machVal = (effSpeed / 1225).toFixed(2);

    return (
      <div
        className="relative w-full h-full bg-black overflow-hidden select-none cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => {
          if (compact) return;
          isDraggingCam.current = true;
          lastMousePos.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseMove={(e) => {
          if (!isDraggingCam.current || compact) return;
          const dx = e.clientX - lastMousePos.current.x;
          const dy = e.clientY - lastMousePos.current.y;
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          setCamPan((p) => (p + dx * 0.6 + 360) % 360);
          setCamTilt((t) => Math.max(-60, Math.min(60, t - dy * 0.4)));
        }}
        onMouseUp={() => {
          isDraggingCam.current = false;
        }}
        onMouseLeave={() => {
          isDraggingCam.current = false;
        }}
      >
        <FlightSim3DViewport
          camId={camId}
          aircraft={aircraft}
          data={data}
          panOffset={compact ? camMeta.basePan : camPan}
          tiltOffset={compact ? 0 : camTilt}
          compact={compact}
        />

        {/* Retícula táctica central */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {camId === 'CAM2_GIMBAL' || camId === 'CAM4_FLIR' ? (
            <div className={`${compact ? 'w-12 h-12' : 'w-32 h-32'} border border-cyan-400/80 relative flex items-center justify-center`}>
              <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]" />
              <div className="absolute -top-2.5 left-1/2 w-0.5 h-2.5 bg-cyan-400" />
              <div className="absolute -bottom-2.5 left-1/2 w-0.5 h-2.5 bg-cyan-400" />
              <div className="absolute -left-2.5 top-1/2 w-2.5 h-0.5 bg-cyan-400" />
              <div className="absolute -right-2.5 top-1/2 w-2.5 h-0.5 bg-cyan-400" />
            </div>
          ) : (
            <div className={`${compact ? 'w-12 h-12' : 'w-32 h-32'} border border-emerald-400/55 rounded-full flex items-center justify-center`}>
              <div className="w-3 h-3 border-2 border-amber-400 rounded-full shadow-[0_0_8px_#fbbf24]" />
            </div>
          )}
        </div>

        {/* Telemetría superpuesta */}
        {!compact ? (
          <>
            <div className="absolute top-8 left-3 text-[11px] font-mono text-emerald-400 space-y-0.5 bg-black/80 border border-zinc-800 px-2.5 py-1.5 rounded">
              <div>SPD: {effSpeed} KM/H (M {machVal})</div>
              <div>ALT: {effAlt} M</div>
              <div>V/S: {Math.round((data?.vspeed ?? 0) * aircraft.altMultiplier)} M/S</div>
            </div>
            <div className="absolute top-8 right-3 text-[11px] font-mono text-emerald-400 text-right space-y-0.5 bg-black/80 border border-zinc-800 px-2.5 py-1.5 rounded">
              <div>HDG: {data?.heading ?? 0}°</div>
              <div>PIT: {data?.pitch ?? 0}° | ROL: {data?.roll ?? 0}°</div>
              <div>GEAR: <span className={gearDown ? 'text-amber-400' : 'text-emerald-400'}>{gearDown ? 'DOWN' : 'UP'}</span></div>
            </div>
            <div className="absolute bottom-2.5 left-3 right-3 flex justify-between text-[10px] font-mono text-zinc-200 bg-black/85 border border-zinc-800 px-2.5 py-1 rounded">
              <span className="text-cyan-400 font-bold">{camMeta.label}</span>
              <span>Arrastra para girar 360° (R = Centrar)</span>
            </div>
          </>
        ) : (
          <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between text-[9px] font-mono text-cyan-300 bg-black/85 px-1.5 py-0.5 rounded">
            <span>{camMeta.short}</span>
            <span>{camMeta.sensor}</span>
          </div>
        )}
      </div>
    );
  };

  const isHumanControl = data?.authority === 'HUMAN_OPERATOR';
  const regionName =
    (data?.lat ?? -18) > -29
      ? 'NORTE GRANDE (DESIERTO DE ATACAMA)'
      : (data?.lat ?? -18) < -41
      ? 'PATAGONIA / FIORDOS AUSTRALES'
      : 'ZONA CENTRAL / CORDILLERA DE LOS ANDES';

  return (
    <div className="min-h-screen bg-black text-zinc-200 flex flex-col">
      {/* BARRA SUPERIOR NEGRO PURO + SELECTOR DE MODELO DE AVIÓN */}
      <header className="bg-black border-b border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-950 border border-cyan-500/40 flex items-center justify-center">
            <Plane className="w-5 h-5" style={{ color: aircraft.accentColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold tracking-wider text-sm text-white">GCS // {aircraft.name}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                {connected ? 'ENLACE ACTIVO' : 'CONECTANDO...'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">{aircraft.role} • <span className="text-cyan-400 font-mono">{regionName}</span></p>
          </div>
        </div>

        {/* SELECTOR DE FLOTA DE AERONAVES */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          {(Object.keys(AIRCRAFT_MODELS) as AircraftId[]).map((id) => {
            const m = AIRCRAFT_MODELS[id];
            const active = selectedAircraft === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedAircraft(id)}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                  active ? 'bg-zinc-800 text-white border border-zinc-600 shadow' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                style={active ? { borderColor: m.accentColor, color: m.accentColor } : undefined}
              >
                {m.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {data?.mode !== 'STANDBY' && (
            <>
              <button
                onClick={() => sendCmd({ action: 'SET_MODE', mode: isHumanControl ? 'AUTONOMOUS' : 'ASSISTED' })}
                className={`font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  isHumanControl
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-black'
                }`}
              >
                <Hand className="w-4 h-4" />
                {isHumanControl ? 'MODO AUTÓNOMO' : 'TOMAR CONTROL'}
              </button>

              {isHumanControl && (
                <button
                  onClick={() => sendCmd({ action: 'SET_MODE', mode: data?.mode === 'MANUAL' ? 'ASSISTED' : 'MANUAL' })}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs px-2.5 py-2 rounded-lg cursor-pointer"
                >
                  {data?.mode}
                </button>
              )}
            </>
          )}

          <button
            onClick={() => sendCmd({ action: 'SET_MODE', mode: 'FAILSAFE' })}
            className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" /> FAILSAFE
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 bg-black">
        {/* COLUMNA IZQUIERDA: MAPA TÁCTICO HD + CONTROLES + PROPULSIÓN */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-black border-b border-zinc-800 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
                <Navigation className="w-4 h-4" /> MAPA HD
              </div>

              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
                <Layers className="w-3 h-3 text-zinc-400 ml-1" />
                {(Object.keys(MAP_LAYERS) as MapLayerId[]).map((lid) => (
                  <button
                    key={lid}
                    onClick={() => setMapLayerId(lid)}
                    className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                      mapLayerId === lid ? 'bg-cyan-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {MAP_LAYERS[lid].label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => sendCmd({ action: 'TOGGLE_PAUSE' })}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer"
                >
                  {data?.mission_paused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
                  {data?.mission_paused ? 'Seguir' : 'Órbita'}
                </button>
                <select
                  value={data?.sim_speed || 25}
                  onChange={(e) => sendCmd({ action: 'SET_SIM_SPEED', speed: Number(e.target.value) })}
                  className="bg-zinc-900 text-[11px] px-1.5 py-0.5 rounded border border-zinc-800"
                >
                  <option value={1}>1x</option>
                  <option value={25}>25x</option>
                  <option value={100}>100x</option>
                </select>
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full h-64 z-10" />

            <div className="p-2.5 bg-black border-t border-zinc-800 max-h-36 overflow-y-auto">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase mb-1">Plan de Vuelo ({aircraft.name} • Clic mapa = Waypoint)</div>
              <div className="space-y-1">
                {data?.waypoints.map((wp, idx) => (
                  <div
                    key={wp.id}
                    className={`flex items-center justify-between text-[11px] px-2 py-1 rounded ${
                      idx === data.current_wp_idx ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-200' : 'bg-zinc-950 text-zinc-400 border border-zinc-900'
                    }`}
                  >
                    <span className="truncate font-medium">{wp.name}</span>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span>{Math.round(wp.alt * aircraft.altMultiplier)}m</span>
                      <span>{Math.round(wp.speed * aircraft.speedMultiplier)}km/h</span>
                      <button
                        onClick={() => sendCmd({ action: 'UPDATE_WAYPOINT', idx, alt: wp.alt + 500, speed: wp.speed })}
                        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-1 rounded text-cyan-400 cursor-pointer"
                      >
                        +500m
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-semibold text-zinc-400">CONTROLES MANUALES (W/A/S/D + Q/E)</span>
              <span className={`text-[10px] px-2 py-0.5 rounded ${isHumanControl ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}>
                {isHumanControl ? 'ACTIVO' : 'BLOQUEADO EN AUTO'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dthrottle: 5 })} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 py-1.5 rounded cursor-pointer">+ POTENCIA (E)</button>
              <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dpitch: 2 })} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 py-1.5 rounded cursor-pointer">CABECEAR + (W)</button>
              <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dthrottle: -5 })} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 py-1.5 rounded cursor-pointer">- POTENCIA (Q)</button>
              <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', droll: -4 })} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 py-1.5 rounded cursor-pointer">ALABEO IZQ (A)</button>
              <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dpitch: -2 })} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 py-1.5 rounded cursor-pointer">PICAR - (S)</button>
              <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', droll: 4 })} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 py-1.5 rounded cursor-pointer">ALABEO DER (D)</button>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold flex items-center gap-1.5" style={{ color: aircraft.accentColor }}>
                <Flame className="w-4 h-4" /> {aircraft.propulsionLabel}
              </h2>
              <span className="text-[11px] font-mono text-emerald-400">
                {selectedAircraft === 'H2_VALKYRIE' ? `${data?.fuel_cell_kw ?? 0} kW` : aircraft.cruiseMach}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black p-2 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">{aircraft.fuelLabel}</div>
                <div className="text-sm font-bold font-mono text-cyan-300">
                  {selectedAircraft === 'H2_VALKYRIE'
                    ? `${data?.h2_pressure_bar ?? 700} bar`
                    : `${Math.round(((data?.h2_pressure_bar ?? 700) / 700) * 100)} %`}
                </div>
              </div>
              <div className="bg-black p-2 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">TEMP. PLANTA / TOBERAS</div>
                <div className={`text-sm font-bold font-mono ${(data?.fuel_cell_temp ?? 0) > 80 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {selectedAircraft === 'H2_VALKYRIE'
                    ? `${data?.fuel_cell_temp ?? 28} °C`
                    : `${Math.round((data?.fuel_cell_temp ?? 28) * 11.5)} °C`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA CENTRAL: SIMULADOR 3D FLIGHT SIMULATOR (7 CÁMARAS 360°) + BOTONERA */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col flex-1">
            <div className="px-3 py-2 bg-black border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Camera className="w-4 h-4" /> SIMULADOR ÓPTICO 3D 360° (7 CÁMARAS)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const cam = CAMERAS.find((c) => c.id === activeCam);
                    setCamPan(cam?.basePan ?? 0);
                    setCamTilt(0);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-1 cursor-pointer"
                  title="Centrar ángulo de cámara (Tecla R)"
                >
                  <Compass className="w-3 h-3 text-cyan-400" /> 0°
                </button>
                <button
                  onClick={() => setActiveCam('MULTI_7')}
                  className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer ${
                    activeCam === 'MULTI_7' ? 'bg-cyan-600 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                  }`}
                >
                  <Grid className="w-3 h-3" /> 7-CAM
                </button>
                <button
                  onClick={() => setRecording(!recording)}
                  className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${recording ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
                >
                  {recording ? '● REC' : 'REC'}
                </button>
              </div>
            </div>

            <div className="px-2 py-1.5 bg-black border-b border-zinc-800 grid grid-cols-4 gap-1">
              {CAMERAS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectCamera(c.id)}
                  className={`text-[10px] py-1 px-1.5 rounded font-mono truncate cursor-pointer transition ${
                    activeCam === c.id
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                  }`}
                >
                  {c.short}
                </button>
              ))}
              <button
                onClick={() => setActiveCam('MULTI_7')}
                className={`text-[10px] py-1 px-1.5 rounded font-mono truncate cursor-pointer transition ${
                  activeCam === 'MULTI_7'
                    ? 'bg-amber-500 text-black font-bold'
                    : 'bg-zinc-900 text-amber-400 hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                0. TODAS
              </button>
            </div>

            <div className="relative flex-1 min-h-[360px] bg-black">
              {activeCam === 'MULTI_7' ? (
                <div className="w-full h-full grid grid-cols-3 grid-rows-3 gap-1.5 p-1.5 bg-black">
                  {CAMERAS.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCamera(c.id)}
                      className="cursor-pointer border border-zinc-800 hover:border-cyan-400 rounded overflow-hidden"
                    >
                      {renderCameraViewport(c.id, true)}
                    </div>
                  ))}
                  <div className="col-span-2 bg-zinc-950 border border-zinc-800 rounded p-2.5 flex flex-col justify-center text-[11px] font-mono text-zinc-300">
                    <div className="text-cyan-400 font-bold">{aircraft.name} // {aircraft.cruiseMach}</div>
                    <div>TECHO: {aircraft.ceilingM}m | VEL. MAX: {aircraft.maxSpeedKmh}km/h</div>
                    <div className="text-zinc-500 text-[10px]">Clic en cámara o teclas 1–7 (Flechas = Giro 360°)</div>
                  </div>
                </div>
              ) : (
                renderCameraViewport(activeCam, false)
              )}
            </div>

            <div className="p-3 bg-black border-t border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-400 tracking-wide">PROCEDIMIENTO DE DESPEGUE Y TREN DE ATERRIZAJE</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  gearDown ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                }`}>
                  TREN: {gearDown ? 'EXTENDIDO (DOWN)' : 'RETRAÍDO (UP)'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono text-center">
                <div className={`py-1 rounded border ${preflightChecked ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  ESTRUCTURA: {preflightChecked ? 'OK' : 'PEND'}
                </div>
                <div className={`py-1 rounded border ${preflightChecked ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  AVIÓNICA: {preflightChecked ? 'OK' : 'PEND'}
                </div>
                <div className={`py-1 rounded border ${preflightChecked ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  SATCOM 360: {preflightChecked ? 'OK' : 'PEND'}
                </div>
                <div className={`py-1 rounded border ${h2CellIgnited ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  MOTORES: {h2CellIgnited ? 'ON' : 'OFF'}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                <button
                  onClick={() => setPreflightChecked(true)}
                  className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 border cursor-pointer transition ${
                    preflightChecked
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>1. Pre-Vuelo</span>
                </button>

                <button
                  disabled={!preflightChecked}
                  onClick={() => setH2CellIgnited(true)}
                  className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 border cursor-pointer transition disabled:opacity-40 ${
                    h2CellIgnited
                      ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <Power className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>2. Ignición</span>
                </button>

                <button
                  disabled={!preflightChecked || !h2CellIgnited}
                  onClick={() => sendCmd({ action: 'START_MISSION' })}
                  className="py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border disabled:border-zinc-800 text-white cursor-pointer transition"
                >
                  <Play className="w-4 h-4 shrink-0" />
                  <span>3. Despegar</span>
                </button>

                <button
                  onClick={() => setGearDown(!gearDown)}
                  className={`py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 border cursor-pointer transition ${
                    gearDown
                      ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {gearDown ? <ArrowUpCircle className="w-4 h-4 shrink-0" /> : <ArrowDownCircle className="w-4 h-4 shrink-0" />}
                  <span>{gearDown ? '4. Subir Tren' : '4. Bajar Tren'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: COPILOTO IA, PRUEBAS DE SEGURIDAD Y BITÁCORA */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" /> COPILOTO IA (MODO ASESOR)
              </h2>
              <span className="text-[9px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded">SIN AUTORIDAD</span>
            </div>
            <p className="text-xs text-zinc-300 bg-black p-2.5 rounded-lg border border-zinc-800">
              {data?.ai_recommendation || `Motor 3D activo para ${aircraft.name} (${aircraft.cruiseMach}). Cobertura esférica 360° operativa.`}
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
            <h2 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" /> PRUEBAS DE SEGURIDAD Y FALLOS
            </h2>
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <button
                onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'COMMS_LOSS' })}
                className="bg-black hover:bg-red-950/50 border border-zinc-800 hover:border-red-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
              >
                1. Simular Pérdida de Comunicaciones
              </button>
              <button
                onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'H2_LEAK' })}
                className="bg-black hover:bg-red-950/50 border border-zinc-800 hover:border-red-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
              >
                2. Simular Caída Presión / Combustible
              </button>
              <button
                onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'THERMAL_SPIKE' })}
                className="bg-black hover:bg-amber-950/50 border border-zinc-800 hover:border-amber-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
              >
                3. Simular Sobretemperatura Planta
              </button>
              <button
                onClick={handleResetSimulation}
                className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-cyan-300 flex items-center justify-center gap-1.5 py-1.5 rounded mt-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reiniciar Simulación en Arica
              </button>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> BITÁCORA Y CAJA NEGRA
              </h2>
              <button
                onClick={downloadBlackbox}
                className="text-[10px] bg-black hover:bg-zinc-900 border border-zinc-800 text-cyan-400 px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" /> Exportar JSON
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-56 pr-1">
              {data?.alerts.length === 0 && (
                <div className="text-xs text-zinc-500 italic">Sin alertas activas. Selecciona modelo y ejecuta Check Pre-Vuelo.</div>
              )}
              {data?.alerts.map((al, i) => (
                <div
                  key={i}
                  className={`text-[11px] p-2 rounded border ${
                    al.level === 'CRIT'
                      ? 'bg-red-950/50 border-red-500/40 text-red-200'
                      : al.level === 'WARN'
                      ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                      : 'bg-black border-zinc-800 text-zinc-300'
                  }`}
                >
                  <span className="font-bold mr-1">[{al.level}]</span>
                  {al.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}