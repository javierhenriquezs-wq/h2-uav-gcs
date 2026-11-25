import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Download, Wifi, Eye, Package, Settings, Play, Pause, FastForward
} from 'lucide-react';
import L from 'leaflet';
import * as THREE from 'three';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/telemetry';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Telemetry {
  battery_soc: number;
  h2_pressure_bar: number;
  fuel_cell_kw: number;
}

type AircraftId = 'H2_VALKYRIE' | 'SR_71' | 'F_35' | 'F_22';
type MapLayerId = 'SATELLITE' | 'TOPO' | 'DARK';
type WeatherPreset = 'GOLDEN_HOUR' | 'CLEAR_DAY' | 'OVERCAST_ANDES';
type DrawerTab = 'NONE' | 'MAP' | 'SENSORS' | 'PAYLOAD' | 'SYSTEMS';
type CameraId = 'CAM8_EXTERNA' | 'CAM1_PROA' | 'CAM2_GIMBAL' | 'CAM3_NADIR' | 'CAM4_FLIR';

type FlightPhase =
  | 'TAKEOFF_ROLL'
  | 'CLIMB'
  | 'CRUISE'
  | 'APPROACH'
  | 'LANDING_FLARE'
  | 'TURNAROUND_REFUEL'
  | 'TOUR_COMPLETED';

type BiomeType = 'ATACAMA_DESERT' | 'NORTE_CHICO' | 'CENTRAL_VALLEY' | 'SOUTHERN_LAKES' | 'PATAGONIA_FJORDS';

interface ChileRegionInfo {
  code: string;
  name: string;
  latMin: number;
  latMax: number;
  biome: BiomeType;
  valleyHex: number;
  rockHex: number;
  fogHex: number;
  hasSnowPeaks: boolean;
}

const CHILE_REGIONS: ChileRegionInfo[] = [
  { code: 'XV', name: 'Región de Arica y Parinacota', latMin: -19.2, latMax: -17.4, biome: 'ATACAMA_DESERT', valleyHex: 0x9b6b43, rockHex: 0x523420, fogHex: 0xd99e62, hasSnowPeaks: true },
  { code: 'I', name: 'Región de Tarapacá', latMin: -21.6, latMax: -19.2, biome: 'ATACAMA_DESERT', valleyHex: 0xa47147, rockHex: 0x593923, fogHex: 0xdca165, hasSnowPeaks: true },
  { code: 'II', name: 'Región de Antofagasta', latMin: -26.1, latMax: -21.6, biome: 'ATACAMA_DESERT', valleyHex: 0xad784c, rockHex: 0x613e26, fogHex: 0xdfa66a, hasSnowPeaks: true },
  { code: 'III', name: 'Región de Atacama', latMin: -29.3, latMax: -26.1, biome: 'NORTE_CHICO', valleyHex: 0x8e6643, rockHex: 0x4b3322, fogHex: 0xd49b66, hasSnowPeaks: true },
  { code: 'IV', name: 'Región de Coquimbo', latMin: -32.2, latMax: -29.3, biome: 'NORTE_CHICO', valleyHex: 0x7c6340, rockHex: 0x423424, fogHex: 0xcf9b69, hasSnowPeaks: true },
  { code: 'V', name: 'Región de Valparaíso', latMin: -33.2, latMax: -32.2, biome: 'CENTRAL_VALLEY', valleyHex: 0x6a5c3a, rockHex: 0x3b3527, fogHex: 0xd29c64, hasSnowPeaks: true },
  { code: 'RM', name: 'Región Metropolitana de Santiago', latMin: -34.3, latMax: -33.2, biome: 'CENTRAL_VALLEY', valleyHex: 0x6e5c3b, rockHex: 0x3c3428, fogHex: 0xd49d64, hasSnowPeaks: true },
  { code: 'VI', name: "Región de O'Higgins", latMin: -35.0, latMax: -34.3, biome: 'CENTRAL_VALLEY', valleyHex: 0x615938, rockHex: 0x363226, fogHex: 0xcc9762, hasSnowPeaks: true },
  { code: 'VII', name: 'Región del Maule', latMin: -36.5, latMax: -35.0, biome: 'CENTRAL_VALLEY', valleyHex: 0x565434, rockHex: 0x302f25, fogHex: 0xc4915f, hasSnowPeaks: true },
  { code: 'XVI', name: 'Región de Ñuble', latMin: -37.2, latMax: -36.5, biome: 'CENTRAL_VALLEY', valleyHex: 0x4d5031, rockHex: 0x2c2d24, fogHex: 0xbd8d5e, hasSnowPeaks: true },
  { code: 'VIII', name: 'Región del Biobío', latMin: -38.5, latMax: -37.2, biome: 'SOUTHERN_LAKES', valleyHex: 0x3f4c2f, rockHex: 0x262c24, fogHex: 0xb5885c, hasSnowPeaks: true },
  { code: 'IX', name: 'Región de La Araucanía', latMin: -39.6, latMax: -38.5, biome: 'SOUTHERN_LAKES', valleyHex: 0x35462d, rockHex: 0x222923, fogHex: 0xad845c, hasSnowPeaks: true },
  { code: 'XIV', name: 'Región de Los Ríos', latMin: -40.7, latMax: -39.6, biome: 'SOUTHERN_LAKES', valleyHex: 0x2e412c, rockHex: 0x1f2723, fogHex: 0xa6805c, hasSnowPeaks: true },
  { code: 'X', name: 'Región de Los Lagos', latMin: -44.0, latMax: -40.7, biome: 'SOUTHERN_LAKES', valleyHex: 0x283c2c, rockHex: 0x1d2624, fogHex: 0x9e7d5e, hasSnowPeaks: true },
  { code: 'XI', name: 'Región de Aysén', latMin: -49.2, latMax: -44.0, biome: 'PATAGONIA_FJORDS', valleyHex: 0x2a3b36, rockHex: 0x243036, fogHex: 0x937b63, hasSnowPeaks: true },
  { code: 'XII', name: 'Región de Magallanes y Antártica', latMin: -56.5, latMax: -49.2, biome: 'PATAGONIA_FJORDS', valleyHex: 0x2d3c3b, rockHex: 0x2a3640, fogHex: 0x8d7a67, hasSnowPeaks: true },
];

function getRegionByLat(lat: number): ChileRegionInfo {
  return CHILE_REGIONS.find((r) => lat <= r.latMax && lat >= r.latMin) || CHILE_REGIONS[6];
}

interface AirportSpec {
  icao: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  rwyHeading: number;
  rwyLabel: string;
  ilsFreq: string;
}

const CHILE_AIRPORTS: AirportSpec[] = [
  { icao: 'SCAR', name: 'Chacalluta', city: 'Arica', lat: -18.3485, lon: -70.3387, rwyHeading: 180, rwyLabel: 'RWY 02/20', ilsFreq: '109.90 MHz' },
  { icao: 'SCDA', name: 'Diego Aracena', city: 'Iquique', lat: -20.5352, lon: -70.1813, rwyHeading: 185, rwyLabel: 'RWY 19/01', ilsFreq: '110.30 MHz' },
  { icao: 'SCFA', name: 'Andrés Sabella', city: 'Antofagasta', lat: -23.4445, lon: -70.4451, rwyHeading: 188, rwyLabel: 'RWY 19/01', ilsFreq: '110.70 MHz' },
  { icao: 'SCEL', name: 'Santiago AMB', city: 'Santiago', lat: -33.3930, lon: -70.7858, rwyHeading: 175, rwyLabel: 'RWY 17L/35R', ilsFreq: '111.50 MHz' },
  { icao: 'SCIE', name: 'Carriel Sur', city: 'Concepción', lat: -36.7727, lon: -73.0631, rwyHeading: 195, rwyLabel: 'RWY 02/20', ilsFreq: '109.50 MHz' },
  { icao: 'SCTE', name: 'El Tepual', city: 'Puerto Montt', lat: -41.4389, lon: -73.0940, rwyHeading: 175, rwyLabel: 'RWY 17/35', ilsFreq: '110.10 MHz' },
  { icao: 'SCCI', name: 'Punta Arenas', city: 'Punta Arenas', lat: -53.0026, lon: -70.8546, rwyHeading: 210, rwyLabel: 'RWY 25/07', ilsFreq: '109.90 MHz' },
  { icao: 'SCGZ', name: 'Puerto Williams', city: 'Fin de Chile', lat: -54.9311, lon: -67.6263, rwyHeading: 160, rwyLabel: 'RWY 08/26', ilsFreq: '108.90 MHz' },
];

interface AircraftSpec {
  id: AircraftId;
  name: string;
  maxSpeedKmh: number;
  vRotateKmh: number;
  vApproachKmh: number;
  speedMultiplier: number;
  altMultiplier: number;
  propulsionLabel: string;
  accentColor: string;
  bodyColor: number;
  svgPath: string;
}

const AIRCRAFT_MODELS: Record<AircraftId, AircraftSpec> = {
  H2_VALKYRIE: {
    id: 'H2_VALKYRIE',
    name: 'H2-VALKYRIE',
    maxSpeedKmh: 310,
    vRotateKmh: 115,
    vApproachKmh: 105,
    speedMultiplier: 1.0,
    altMultiplier: 1.0,
    propulsionLabel: 'CELDA HIDRÓGENO PEM 700 BAR',
    accentColor: '#38bdf8',
    bodyColor: 0xeaf0f6,
    svgPath: 'M12 2L15 10L22 14L14 15L13 21L12 19L11 21L10 15L2 14L9 10L12 2Z',
  },
  SR_71: {
    id: 'SR_71',
    name: 'SR-71 BLACKBIRD',
    maxSpeedKmh: 3540,
    vRotateKmh: 390,
    vApproachKmh: 330,
    speedMultiplier: 13.8,
    altMultiplier: 4.5,
    propulsionLabel: '2x PRATT & WHITNEY J58',
    accentColor: '#f59e0b',
    bodyColor: 0x111827,
    svgPath: 'M12 1L13.5 8L16 11L21 18L16 18L15 22L14 19L12 21L10 19L9 22L8 18L3 18L8 11L10.5 8L12 1Z',
  },
  F_35: {
    id: 'F_35',
    name: 'F-35A LIGHTNING II',
    maxSpeedKmh: 1960,
    vRotateKmh: 280,
    vApproachKmh: 250,
    speedMultiplier: 7.6,
    altMultiplier: 2.6,
    propulsionLabel: 'PRATT & WHITNEY F135',
    accentColor: '#0ea5e9',
    bodyColor: 0x334155,
    svgPath: 'M12 2L14 8L21 13L21 15L14 15L16 20L13 20L12 18L11 20L8 20L10 15L3 15L3 13L10 8L12 2Z',
  },
  F_22: {
    id: 'F_22',
    name: 'F-22 RAPTOR',
    maxSpeedKmh: 2410,
    vRotateKmh: 270,
    vApproachKmh: 240,
    speedMultiplier: 9.4,
    altMultiplier: 3.4,
    propulsionLabel: '2x F119 EMPUJE VECTORIAL',
    accentColor: '#10b981',
    bodyColor: 0x475569,
    svgPath: 'M12 1.5L14.2 7.5L22 13.5L21 15.5L14.5 15L17 20.5L13.5 21L12 18.5L10.5 21L7 20.5L9.5 15L3 15.5L2 13.5L9.8 7.5L12 1.5Z',
  },
};

const MAP_LAYERS: Record<MapLayerId, { label: string; url: string; attribution: string; maxZoom: number }> = {
  SATELLITE: {
    label: 'Satélite HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18,
  },
  TOPO: {
    label: 'Topográfico',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap',
    maxZoom: 17,
  },
  DARK: {
    label: 'Táctico',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    maxZoom: 19,
  },
};

const CAMERAS: { id: CameraId; short: string; label: string; basePan: number }[] = [
  { id: 'CAM8_EXTERNA', short: 'CHASE 4K', label: 'PERSECUCIÓN EXTERNA 3/4', basePan: 34 },
  { id: 'CAM1_PROA', short: 'COCKPIT', label: 'CABINA / PROA HUD', basePan: 0 },
  { id: 'CAM2_GIMBAL', short: 'GIMBAL EO', label: 'TORRETA ÓPTICA 30X', basePan: 0 },
  { id: 'CAM3_NADIR', short: 'NADIR', label: 'CENITAL ORTOFOTO', basePan: 0 },
  { id: 'CAM4_FLIR', short: 'FLIR IR', label: 'VISIÓN TÉRMICA LWIR', basePan: 0 },
];

// Ruido fractal determinístico para crestas realistas de la Cordillera de los Andes
function hash2D(ix: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function ridgedFbm(x: number, z: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.52;
  let freq = 1.0;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    let n = valueNoise2D(x * freq, z * freq);
    n = 1.0 - Math.abs(n * 2.0 - 1.0);
    n = n * n * weight;
    weight = Math.min(1.0, Math.max(0.0, n * 1.8));
    sum += n * amp;
    freq *= 2.08;
    amp *= 0.48;
  }
  return sum;
}

// Textura suave para nubes volumétricas iluminadas por el atardecer
function createSoftCloudTexture(isGoldenHour: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  if (isGoldenHour) {
    grad.addColorStop(0.0, 'rgba(255, 244, 224, 0.72)');
    grad.addColorStop(0.38, 'rgba(251, 206, 152, 0.45)');
    grad.addColorStop(0.72, 'rgba(180, 118, 86, 0.16)');
    grad.addColorStop(1.0, 'rgba(120, 80, 60, 0.0)');
  } else {
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.72)');
    grad.addColorStop(0.45, 'rgba(226, 232, 240, 0.38)');
    grad.addColorStop(1.0, 'rgba(226, 232, 240, 0.0)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Textura de halo radial para el brillo de la tobera de hidrógeno
function createGlowSpriteTexture(hexColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.28, hexColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// Aeronave H2-VALKYRIE esculpida con ExtrudeGeometry (ala en flecha invertida + bordes cian)
function buildSculptedAircraftMesh(spec: AircraftSpec, gearDown: boolean, flapsDeg: number): THREE.Group {
  const root = new THREE.Group();

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: spec.bodyColor,
    roughness: 0.22,
    metalness: 0.42,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });

  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x0b1220,
    roughness: 0.3,
    metalness: 0.8,
  });

  const cyanGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.accentColor),
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x040b18,
    emissive: 0x0369a1,
    emissiveIntensity: 0.24,
    roughness: 0.04,
    metalness: 0.95,
    clearcoat: 1.0,
  });

  if (spec.id === 'H2_VALKYRIE') {
    // 1. Planta alar continua (Blended-Wing-Body + alas en flecha hacia adelante)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -4.4);
    wingShape.quadraticCurveTo(1.15, -4.1, 1.55, -2.2);
    wingShape.lineTo(2.15, -1.35);
    wingShape.lineTo(7.45, -2.55); // Punta derecha adelantada (forward-swept)
    wingShape.lineTo(7.65, -1.75);
    wingShape.lineTo(2.1, 0.75);
    wingShape.lineTo(1.35, 3.05);
    wingShape.lineTo(0, 3.45);
    wingShape.lineTo(-1.35, 3.05);
    wingShape.lineTo(-2.1, 0.75);
    wingShape.lineTo(-7.65, -1.75);
    wingShape.lineTo(-7.45, -2.55); // Punta izquierda adelantada
    wingShape.lineTo(-2.15, -1.35);
    wingShape.lineTo(-1.55, -2.2);
    wingShape.quadraticCurveTo(-1.15, -4.1, 0, -4.4);

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.09,
      bevelThickness: 0.09,
    });
    wingGeo.rotateX(Math.PI / 2);
    const wingMesh = new THREE.Mesh(wingGeo, hullMat);
    wingMesh.position.y = 0.06;
    root.add(wingMesh);

    // 2. Domo dorsal aerodinámico esculpido
    const bodyDome = new THREE.Mesh(new THREE.SphereGeometry(1.32, 36, 24), hullMat);
    bodyDome.scale.set(1.12, 0.34, 3.15);
    bodyDome.position.set(0, 0.16, -0.3);
    root.add(bodyDome);

    // 3. Visor panorámico delantero oscuro con reflejo azul
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.14, 32, 20), canopyMat);
    canopy.scale.set(1.06, 0.31, 1.48);
    canopy.position.set(0, 0.24, -2.45);
    root.add(canopy);

    // 4. Carcasa trasera oscura del propulsor de hidrógeno
    const engineSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 2.55, 24), darkCarbonMat);
    engineSpine.rotation.x = Math.PI / 2;
    engineSpine.scale.set(1.22, 0.68, 1);
    engineSpine.position.set(0, 0.3, 2.25);
    root.add(engineSpine);

    // 5. Franjas LED cian luminosas siguiendo el borde de ataque y borde de fuga
    [-1, 1].forEach((side) => {
      const leadCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.45, 0.14, -2.35),
        new THREE.Vector3(side * 2.18, 0.08, -1.42),
        new THREE.Vector3(side * 7.38, 0.05, -2.52),
      ]);
      const leadTube = new THREE.Mesh(new THREE.TubeGeometry(leadCurve, 28, 0.042, 8, false), cyanGlowMat);
      root.add(leadTube);

      const trailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 2.15, 0.07, 0.72),
        new THREE.Vector3(side * 7.55, 0.05, -1.72),
      ]);
      const trailTube = new THREE.Mesh(new THREE.TubeGeometry(trailCurve, 20, 0.032, 8, false), cyanGlowMat);
      root.add(trailTube);

      // Doble deriva en V esculpida con borde luminoso
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(1.55, 0);
      finShape.lineTo(2.15, 1.55);
      finShape.lineTo(1.15, 1.55);
      finShape.closePath();

      const finGeo = new THREE.ExtrudeGeometry(finShape, {
        depth: 0.07,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.03,
        bevelThickness: 0.03,
      });
      const fin = new THREE.Mesh(finGeo, hullMat);
      fin.rotation.y = Math.PI / 2;
      fin.rotation.z = side * -0.54;
      fin.position.set(side * 0.92, 0.12, 3.15);
      root.add(fin);

      // Flaps móviles en el borde de fuga
      const flap = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 0.34), darkCarbonMat);
      flap.position.set(side * 3.1, -0.02 - flapsDeg * 0.005, 0.32);
      flap.rotation.y = side * 0.38;
      flap.rotation.x = (flapsDeg * Math.PI) / 180;
      root.add(flap);
    });
  } else {
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 10.2, 24), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    root.add(fuselage);

    const deltaWing = new THREE.Mesh(new THREE.ConeGeometry(4.8, 7.2, 3), hullMat);
    deltaWing.rotation.x = -Math.PI / 2;
    deltaWing.scale.set(1.25, 1, 0.04);
    deltaWing.position.set(0, -0.02, 1.0);
    root.add(deltaWing);
  }

  // Tren de aterrizaje retráctil
  if (gearDown) {
    const strutMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9 });
    [
      [0, -0.72, -2.5],
      [-1.15, -0.72, 0.85],
      [1.15, -0.72, 0.85],
    ].forEach(([gx, gy, gz]) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 10), strutMat);
      strut.position.set(gx, gy + 0.3, gz);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 16), tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(gx, gy - 0.1, gz);
      root.add(strut, wheel);
    });
  }

  return root;
}

function createRunwayTexture(rwyLabel: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 4096;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 1024, 4096);
  for (let i = 0; i < 24000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.22)';
    ctx.fillRect(Math.random() * 1024, Math.random() * 4096, 3, 3);
  }

  ctx.fillStyle = '#e4e4e7';
  ctx.fillRect(56, 0, 18, 4096);
  ctx.fillRect(950, 0, 18, 4096);
  ctx.fillStyle = '#f4f4f5';
  for (let x = 128; x <= 848; x += 96) {
    if (Math.abs(x - 492) < 56) continue;
    ctx.fillRect(x, 3380, 48, 260);
    ctx.fillRect(x, 360, 48, 260);
  }
  ctx.font = 'bold 92px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(rwyLabel.replace('RWY ', '').split('/')[0], 512, 3240);
  for (let y = 680; y < 3120; y += 180) {
    ctx.fillRect(500, y, 24, 104);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  return tex;
}

function createDetailedTerrainTexture(isFlir: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = isFlir ? '#3f3f46' : '#d6d3d1';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18000; i++) {
    const shade = 150 + Math.floor(Math.random() * 85);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.16)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  tex.anisotropy = 16;
  return tex;
}

// Instrumentos laterales exactos como la imagen de referencia
function drawMsfsInstruments(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: {
    heading: number;
    course: number;
    aircraftName: string;
    airportIcao: string;
    distNm: number;
    speedKt: number;
    tasKt: number;
    altFt: number;
    vsFpm: number;
    throttlePct: number;
    fuelPct: number;
    aoaDeg: number;
    gearDown: boolean;
    flapsDeg: number;
    trimPct: number;
  }
) {
  const {
    heading,
    course,
    aircraftName,
    airportIcao,
    distNm,
    speedKt,
    tasKt,
    altFt,
    vsFpm,
    throttlePct,
    fuelPct,
    aoaDeg,
    gearDown,
    flapsDeg,
    trimPct,
  } = params;

  // 1. BRÚJULA SUPERIOR IZQUIERDA + PLACA H2-VALKYRIE + FMS
  const cx = 78;
  const cy = 84;
  const r = 52;

  ctx.save();
  ctx.fillStyle = 'rgba(12, 16, 24, 0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200, 212, 226, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(10, 14, 22, 0.92)';
  ctx.fillRect(cx - 26, cy - r - 22, 52, 18);
  ctx.strokeStyle = 'rgba(190, 204, 220, 0.65)';
  ctx.strokeRect(cx - 26, cy - r - 22, 52, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(heading)}°`, cx, cy - r - 8);

  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`HDG ${Math.round(heading)}°`, cx - 49, cy - r - 8);
  ctx.fillStyle = '#e879f9';
  ctx.fillText(`CRS ${Math.round(course)}°`, cx + 49, cy - r - 8);

  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);

  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const inner = isMajor ? r - 10 : r - 5;
    ctx.strokeStyle = deg === 0 ? '#ef4444' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = isMajor ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.sin(rad) * inner, -Math.cos(rad) * inner);
    ctx.lineTo(Math.sin(rad) * r, -Math.cos(rad) * r);
    ctx.stroke();

    if (isMajor) {
      ctx.save();
      ctx.translate(Math.sin(rad) * (r - 19), -Math.cos(rad) * (r - 19));
      ctx.rotate(rad);
      ctx.fillStyle = deg === 0 ? '#f87171' : '#f8fafc';
      ctx.font = 'bold 10px sans-serif';
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : `${deg / 10}`;
      ctx.fillText(label, 0, 3);
      ctx.restore();
    }
  }

  const crsRad = (course * Math.PI) / 180;
  ctx.rotate(crsRad);
  ctx.strokeStyle = '#e879f9';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, -r + 6);
  ctx.lineTo(0, r - 6);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.stroke();

  ctx.fillStyle = 'rgba(20, 26, 36, 0.84)';
  ctx.fillRect(16, cy + r + 10, 124, 22);
  ctx.strokeStyle = 'rgba(180, 195, 215, 0.45)';
  ctx.strokeRect(16, cy + r + 10, 124, 22);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(aircraftName, 78, cy + r + 25);

  ctx.fillStyle = 'rgba(20, 26, 36, 0.82)';
  ctx.fillRect(142, 52, 126, 38);
  ctx.strokeStyle = 'rgba(180, 195, 215, 0.45)';
  ctx.strokeRect(142, 52, 126, 38);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('FMS', 149, 66);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`> ${airportIcao} ${distNm.toFixed(1)} NM`, 149, 82);

  // 2. INFERIOR IZQUIERDA: AIRSPEED + ENGINE + FUEL + AOA
  const blX = 16;
  const blY = h - 142;

  ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.fillRect(blX, blY, 64, 126);
  ctx.strokeStyle = 'rgba(160, 175, 195, 0.5)';
  ctx.strokeRect(blX, blY, 64, 126);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AIRSPEED', blX + 32, blY + 12);

  ctx.save();
  ctx.beginPath();
  ctx.rect(blX, blY + 16, 64, 88);
  ctx.clip();
  const baseSpd = Math.floor(speedKt / 10) * 10;
  for (let s = baseSpd - 30; s <= baseSpd + 30; s += 10) {
    if (s < 0) continue;
    const yOffset = blY + 60 - (s - speedKt) * 1.45;
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(blX + 50, yOffset);
    ctx.lineTo(blX + 64, yOffset);
    ctx.stroke();
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${s}`, blX + 46, yOffset + 3);
  }
  ctx.restore();

  ctx.fillStyle = '#000000';
  ctx.fillRect(blX + 3, blY + 50, 54, 22);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(blX + 3, blY + 50, 54, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(speedKt)}`, blX + 30, blY + 65);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '8px monospace';
  ctx.fillText(`TAS ${Math.round(tasKt)} KTS`, blX + 32, blY + 119);

  const engX = blX + 70;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.fillRect(engX, blY + 22, 76, 104);
  ctx.strokeStyle = 'rgba(160, 175, 195, 0.5)';
  ctx.strokeRect(engX, blY + 22, 76, 104);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('ENGINE', engX + 38, blY + 34);

  const dialCx = engX + 38;
  const dialCy = blY + 70;
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(dialCx, dialCy, 25, Math.PI * 0.75, Math.PI * 0.75 + (Math.PI * 1.5 * Math.min(100, throttlePct)) / 100);
  ctx.stroke();
  const needleAng = Math.PI * 0.75 + (Math.PI * 1.5 * Math.min(100, throttlePct)) / 100;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(dialCx, dialCy);
  ctx.lineTo(dialCx + Math.cos(needleAng) * 23, dialCy + Math.sin(needleAng) * 23);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`${Math.round(throttlePct)}%`, dialCx, blY + 117);

  const fuelX = engX + 80;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.fillRect(fuelX, blY + 22, 40, 104);
  ctx.strokeStyle = 'rgba(160, 175, 195, 0.5)';
  ctx.strokeRect(fuelX, blY + 22, 40, 104);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('FUEL', fuelX + 20, blY + 34);
  const barH = 60;
  const fillH = (barH * Math.max(0, Math.min(100, fuelPct))) / 100;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(fuelX + 14, blY + 41, 12, barH);
  ctx.fillStyle = fuelPct > 25 ? '#22c55e' : '#ef4444';
  ctx.fillRect(fuelX + 14, blY + 41 + (barH - fillH), 12, fillH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${Math.round(fuelPct)}%`, fuelX + 20, blY + 117);

  const aoaX = fuelX + 44;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.fillRect(aoaX, blY + 22, 38, 104);
  ctx.strokeStyle = 'rgba(160, 175, 195, 0.5)';
  ctx.strokeRect(aoaX, blY + 22, 38, 104);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('AOA', aoaX + 19, blY + 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${aoaDeg.toFixed(1)}°`, aoaX + 19, blY + 117);

  // 3. INFERIOR DERECHA: FLAPS + TRIM + ALTITUDE + VS
  const brX = w - 172;
  const brY = h - 142;

  ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.fillRect(brX, brY + 22, 66, 104);
  ctx.strokeStyle = 'rgba(160, 175, 195, 0.5)';
  ctx.strokeRect(brX, brY + 22, 66, 104);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('FLAPS  TRIM', brX + 33, brY + 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${flapsDeg}°`, brX + 18, brY + 117);
  ctx.fillText(`${trimPct}%`, brX + 50, brY + 117);
  ctx.fillStyle = gearDown ? '#f59e0b' : '#38bdf8';
  ctx.font = '8px monospace';
  ctx.fillText(gearDown ? 'DN' : 'UP', brX + 50, brY + 52);

  const altX = brX + 70;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
  ctx.fillRect(altX, brY, 86, 126);
  ctx.strokeStyle = 'rgba(160, 175, 195, 0.5)';
  ctx.strokeRect(altX, brY, 86, 126);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('ALTITUDE', altX + 31, brY + 12);
  ctx.fillText('VS', altX + 72, brY + 12);

  ctx.save();
  ctx.beginPath();
  ctx.rect(altX, brY + 16, 62, 88);
  ctx.clip();
  const baseAlt = Math.floor(altFt / 100) * 100;
  for (let a = baseAlt - 300; a <= baseAlt + 300; a += 100) {
    if (a < 0) continue;
    const yOffset = brY + 60 - (a - altFt) * 0.145;
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(altX, yOffset);
    ctx.lineTo(altX + 9, yOffset);
    ctx.stroke();
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${a}`, altX + 12, yOffset + 3);
  }
  ctx.restore();

  ctx.fillStyle = '#000000';
  ctx.fillRect(altX + 4, brY + 50, 56, 22);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(altX + 4, brY + 50, 56, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(altFt).toLocaleString('en-US')}`, altX + 32, brY + 65);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '9px monospace';
  ctx.fillText(`${Math.round(vsFpm)}`, altX + 73, brY + 64);
  ctx.fillText('29.91 IN', altX + 43, brY + 119);
}

function FlightSim3DViewport({
  camId,
  aircraft,
  region,
  airport,
  weather,
  simAltM,
  simSpeedKmh,
  simPitchDeg,
  simRollDeg,
  simHeadingDeg,
  runwayProgress,
  gearDown,
  flapsDeg,
  trimPct,
  fuelPct,
  distToNextNm,
  panOffset,
  tiltOffset,
}: {
  camId: CameraId;
  aircraft: AircraftSpec;
  region: ChileRegionInfo;
  airport: AirportSpec;
  weather: WeatherPreset;
  simAltM: number;
  simSpeedKmh: number;
  simPitchDeg: number;
  simRollDeg: number;
  simHeadingDeg: number;
  runwayProgress: number;
  gearDown: boolean;
  flapsDeg: number;
  trimPct: number;
  fuelPct: number;
  distToNextNm: number;
  panOffset: number;
  tiltOffset: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    camId,
    aircraft,
    region,
    airport,
    weather,
    simAltM,
    simSpeedKmh,
    simPitchDeg,
    simRollDeg,
    simHeadingDeg,
    runwayProgress,
    gearDown,
    flapsDeg,
    trimPct,
    fuelPct,
    distToNextNm,
    panOffset,
    tiltOffset,
  });
  stateRef.current = {
    camId,
    aircraft,
    region,
    airport,
    weather,
    simAltM,
    simSpeedKmh,
    simPitchDeg,
    simRollDeg,
    simHeadingDeg,
    runwayProgress,
    gearDown,
    flapsDeg,
    trimPct,
    fuelPct,
    distToNextNm,
    panOffset,
    tiltOffset,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const isGolden = weather === 'GOLDEN_HOUR';
    const activeFog =
      weather === 'OVERCAST_ANDES' ? 0x64748b : weather === 'CLEAR_DAY' ? 0x89c4f4 : region.fogHex;
    scene.fog = new THREE.FogExp2(activeFog, isGolden ? 0.00034 : 0.00042);

    const camera = new THREE.PerspectiveCamera(
      camId === 'CAM2_GIMBAL' ? 28 : 48,
      (container.clientWidth || 1280) / (container.clientHeight || 720),
      0.2,
      5200
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Iluminación cinematográfica del atardecer andino
    const hemiLight = new THREE.HemisphereLight(
      isGolden ? 0xffdfb0 : 0xdbeafe,
      0x292524,
      1.15
    );
    scene.add(hemiLight);

    const sunDirection = new THREE.Vector3(0.42, isGolden ? 0.13 : 0.45, -0.89).normalize();
    const sunLight = new THREE.DirectionalLight(isGolden ? 0xffc375 : 0xffffff, 2.8);
    sunLight.position.copy(sunDirection).multiplyScalar(1500);
    scene.add(sunLight);

    // Luz de relleno azulada desde las cumbres nevadas de la izquierda
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
    rimLight.position.set(-600, 350, 200);
    scene.add(rimLight);

    // Shader GLSL atmosférico con brillo solar realista (Mie scattering)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: sunDirection },
        uTopColor: { value: new THREE.Color(isGolden ? 0x243b5e : weather === 'CLEAR_DAY' ? 0x0c4a6e : 0x334155) },
        uMidColor: { value: new THREE.Color(isGolden ? 0x8f8a96 : weather === 'CLEAR_DAY' ? 0x60a5fa : 0x64748b) },
        uHorizonColor: { value: new THREE.Color(isGolden ? 0xf2b56b : weather === 'CLEAR_DAY' ? 0xe0f2fe : 0xcbd5e1) },
        uSunColor: { value: new THREE.Color(isGolden ? 0xfff3c4 : 0xffffff) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunColor;
        varying vec3 vWorldPos;
        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.24, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.72, h));

          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float sunHalo = pow(sunDot, 10.0) * 0.55 + pow(sunDot, 90.0) * 0.85;
          float sunCore = smoothstep(0.9985, 0.9996, sunDot) * 1.4;
          col += uSunColor * (sunHalo + sunCore);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 24), skyMat);
    scene.add(skyDome);

    // Nubes volumétricas suaves (Sprites) sobre la cordillera y el valle
    const cloudTex = createSoftCloudTexture(isGolden);
    const cloudsGroup = new THREE.Group();
    for (let i = 0; i < 85; i++) {
      const spriteMat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.58 + Math.random() * 0.3,
      });
      const sprite = new THREE.Sprite(spriteMat);
      const scaleW = 190 + Math.random() * 340;
      const scaleH = 52 + Math.random() * 90;
      sprite.scale.set(scaleW, scaleH, 1);
      sprite.position.set(
        (Math.random() - 0.5) * 3800,
        145 + Math.random() * 190,
        (Math.random() - 0.5) * 3800
      );
      cloudsGroup.add(sprite);
    }
    scene.add(cloudsGroup);

    // Terreno 3D con Cordillera de los Andes fractal (izquierda) y valle dorado (derecha)
    const terrainGeo = new THREE.PlaneGeometry(4600, 4600, 190, 190);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    const heights = new Float32Array(posAttr.count);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const runwayCorridor = THREE.MathUtils.smoothstep(Math.abs(x), 65, 220);

      // Cordillera principal al flanco izquierdo (x < 0) y fondo lejano
      const andesWeight = THREE.MathUtils.smoothstep(-x, -380, 1450);
      const farRangeWeight = THREE.MathUtils.smoothstep(-z, 550, 2100) * 0.65;
      const mountainMask = Math.max(andesWeight, farRangeWeight);

      const ridge = ridgedFbm((x + 1200) * 0.0014, (z + 800) * 0.0014, 5);
      const foothills = ridgedFbm((x - 400) * 0.0022, (z + 300) * 0.0022, 4);

      const h =
        runwayCorridor *
        (mountainMask * (110 + ridge * 580) + (1 - mountainMask) * (foothills * 68));
      posAttr.setY(i, h);
      heights[i] = h;
    }
    terrainGeo.computeVertexNormals();

    // Coloreado por altitud + pendiente normal (nieve realista en crestas y laderas altas)
    const normAttr = terrainGeo.attributes.normal;
    const colors: number[] = [];
    const valleyCol = new THREE.Color(region.valleyHex);
    const rockCol = new THREE.Color(region.rockHex);
    const snowCol = new THREE.Color(0xf6f8fc);

    for (let i = 0; i < posAttr.count; i++) {
      const h = heights[i];
      const ny = normAttr.getY(i); // 1 = plano, 0 = acantilado vertical
      const c = new THREE.Color();

      const rockBlend = THREE.MathUtils.smoothstep(h, 45, 190);
      c.copy(valleyCol).lerp(rockCol, rockBlend);

      if (region.hasSnowPeaks) {
        const snowLine = 175 + (1 - ny) * 185;
        const snowBlend = THREE.MathUtils.smoothstep(h, snowLine, snowLine + 95);
        c.lerp(snowCol, snowBlend);
      }
      colors.push(c.r, c.g, c.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const terrainMesh = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({
        map: createDetailedTerrainTexture(camId === 'CAM4_FLIR'),
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.04,
      })
    );
    scene.add(terrainMesh);

    // Pista de aterrizaje ILS del aeropuerto actual
    const runwayGroup = new THREE.Group();
    const runwayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 820),
      new THREE.MeshStandardMaterial({ map: createRunwayTexture(airport.rwyLabel), roughness: 0.78 })
    );
    runwayMesh.rotation.x = -Math.PI / 2;
    runwayMesh.position.set(0, 0.3, -260);
    runwayGroup.add(runwayMesh);

    const lightGeo = new THREE.SphereGeometry(0.75, 10, 10);
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    for (let z = 140; z >= -660; z -= 34) {
      const lL = new THREE.Mesh(lightGeo, whiteMat);
      lL.position.set(-20.5, 0.7, z);
      const lR = new THREE.Mesh(lightGeo, whiteMat);
      lR.position.set(20.5, 0.7, z);
      runwayGroup.add(lL, lR);
    }
    for (let x = -18; x <= 18; x += 4.5) {
      const tL = new THREE.Mesh(lightGeo, greenMat);
      tL.position.set(x, 0.72, 148);
      runwayGroup.add(tL);
    }
    scene.add(runwayGroup);

    // Aeronave 3D esculpida + halo eléctrico azul en la tobera
    const aircraftModel = buildSculptedAircraftMesh(aircraft, gearDown, flapsDeg);
    scene.add(aircraftModel);

    const thrusterSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowSpriteTexture(aircraft.accentColor),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    );
    thrusterSprite.position.set(0, 0.28, 3.65);
    thrusterSprite.scale.set(2.2, 1.5, 1);
    aircraftModel.add(thrusterSprite);

    let animId: number;
    let cruiseScroll = 0;

    const animate = () => {
      const st = stateRef.current;
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 720;
      if (
        renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) ||
        renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())
      ) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      const rollRad = (st.simRollDeg * Math.PI) / 180;
      const pitchRad = (st.simPitchDeg * Math.PI) / 180;

      const nearAirport = st.simAltM < 450;
      runwayGroup.visible = nearAirport;

      if (nearAirport) {
        terrainMesh.position.z = 0;
        const zOnRunway = 135 - st.runwayProgress * 580;
        const yHeight = 1.15 + st.simAltM * 0.22;
        aircraftModel.position.set(0, yHeight, zOnRunway);
      } else {
        cruiseScroll += (st.simSpeedKmh / 3600) * 32;
        terrainMesh.position.z = cruiseScroll % 240;
        aircraftModel.position.set(0, 175 + Math.min(180, st.simAltM * 0.02), 0);
      }

      aircraftModel.rotation.set(pitchRad, 0, -rollRad);
      thrusterSprite.visible = st.simSpeedKmh > 25;
      const pulse = 1.85 + Math.sin(performance.now() * 0.02) * 0.2;
      thrusterSprite.scale.set(pulse * 1.15, pulse * 0.8, 1);

      cloudsGroup.children.forEach((c) => {
        c.position.z += 0.35;
        if (c.position.z > 1800) c.position.z = -1800;
      });

      const isFlir = st.camId === 'CAM4_FLIR';
      scene.fog = new THREE.FogExp2(isFlir ? 0x18181b : activeFog, isFlir ? 0.00075 : 0.00034);
      skyDome.visible = !isFlir;
      renderer.setClearColor(isFlir ? 0x09090b : activeFog);

      const panRad = (-st.panOffset * Math.PI) / 180;
      const tiltRad = (st.tiltOffset * Math.PI) / 180;

      if (st.camId === 'CAM8_EXTERNA') {
        aircraftModel.visible = true;
        const dist = 12.2;
        const camX = aircraftModel.position.x + Math.sin(panRad) * Math.cos(tiltRad) * dist;
        const camY = aircraftModel.position.y + 1.85 + Math.sin(tiltRad) * dist;
        const camZ = aircraftModel.position.z + Math.cos(panRad) * Math.cos(tiltRad) * dist;
        camera.position.set(camX, Math.max(1.4, camY), camZ);
        camera.lookAt(aircraftModel.position.clone().add(new THREE.Vector3(-0.35, 0.05, -1.6)));
      } else if (st.camId === 'CAM3_NADIR') {
        aircraftModel.visible = false;
        camera.position.copy(aircraftModel.position).add(new THREE.Vector3(0, -0.3, 0));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(-Math.PI / 2 + tiltRad * 0.4, panRad, -rollRad);
      } else {
        aircraftModel.visible = st.camId === 'CAM1_PROA';
        camera.position.copy(aircraftModel.position).add(new THREE.Vector3(0, 0.55, -2.5));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
      }

      renderer.render(scene, camera);

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

        const speedKt = st.simSpeedKmh * 0.539957;
        drawMsfsInstruments(hCtx, w, h, {
          heading: (st.simHeadingDeg + st.panOffset + 360) % 360,
          course: st.airport.rwyHeading,
          aircraftName: st.aircraft.name,
          airportIcao: st.airport.icao,
          distNm: st.distToNextNm,
          speedKt,
          tasKt: speedKt * (1 + st.simAltM / 45000),
          altFt: st.simAltM * 3.28084,
          vsFpm: st.simPitchDeg * 145,
          throttlePct: st.simSpeedKmh > 0 ? Math.min(112, 42 + (st.simSpeedKmh / st.aircraft.maxSpeedKmh) * 70) : 0,
          fuelPct: st.fuelPct,
          aoaDeg: st.simPitchDeg,
          gearDown: st.gearDown,
          flapsDeg: st.flapsDeg,
          trimPct: st.trimPct,
        });
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
  }, [camId, aircraft, region, airport, weather, gearDown, flapsDeg]);

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
  const [activeCam, setActiveCam] = useState<CameraId>('CAM8_EXTERNA');
  const [activeDrawer, setActiveDrawer] = useState<DrawerTab>('NONE');

  const [selectedAircraft, setSelectedAircraft] = useState<AircraftId>('H2_VALKYRIE');
  const [mapLayerId, setMapLayerId] = useState<MapLayerId>('SATELLITE');
  const [weatherPreset, setWeatherPreset] = useState<WeatherPreset>('GOLDEN_HOUR');

  // Arranca en vuelo de crucero sobre los Andes rumbo a SCAR/SCDA (mismo encuadre de la imagen 2)
  // y recorre de Norte a Sur los 8 aeropuertos de Chile aterrizando y despegando en cada escala
  const [chileTourActive, setChileTourActive] = useState<boolean>(true);
  const [tourSpeedMultiplier, setTourSpeedMultiplier] = useState<number>(1);
  const [airportIdx, setAirportIdx] = useState<number>(0);
  const [flightPhase, setFlightPhase] = useState<FlightPhase>('CRUISE');
  const [legProgress, setLegProgress] = useState<number>(0.25);
  const [runwayProgress, setRunwayProgress] = useState<number>(0.02);
  const [refuelTimer, setRefuelTimer] = useState<number>(0);

  const [localAltM, setLocalAltM] = useState<number>(4700);
  const [localSpeedKmh, setLocalSpeedKmh] = useState<number>(304);
  const [localPitchDeg, setLocalPitchDeg] = useState<number>(4.2);
  const [localRollDeg, setLocalRollDeg] = useState<number>(-15);
  const [flapsDeg, setFlapsDeg] = useState<number>(10);
  const [trimPct] = useState<number>(4);
  const [fuelPct, setFuelPct] = useState<number>(76);
  const [autopilotEngaged, setAutopilotEngaged] = useState<boolean>(true);

  const [camPan, setCamPan] = useState(34);
  const [camTilt, setCamTilt] = useState(10);
  const isDraggingCam = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [gearDown, setGearDown] = useState(false);
  const [utcClock, setUtcClock] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const aircraft = AIRCRAFT_MODELS[selectedAircraft];
  const originAirport = CHILE_AIRPORTS[airportIdx];
  const targetAirport = CHILE_AIRPORTS[Math.min(CHILE_AIRPORTS.length - 1, airportIdx + 1)];

  const activeLat = originAirport.lat + (targetAirport.lat - originAirport.lat) * legProgress;
  const activeLon = originAirport.lon + (targetAirport.lon - originAirport.lon) * legProgress;
  const currentRegion = getRegionByLat(activeLat);

  const dLat = (targetAirport.lat - activeLat) * 60;
  const dLon = (targetAirport.lon - activeLon) * 60 * Math.cos((activeLat * Math.PI) / 180);
  const distToNextNm = Math.max(0.1, Math.hypot(dLat, dLon));

  const sendCmd = (payload: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setUtcClock(now.toISOString().slice(11, 16) + 'Z');
    };
    updateClock();
    const t = setInterval(updateClock, 1000);
    return () => clearInterval(t);
  }, []);

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') setGearDown((g) => !g);
      if (e.key === 'f' || e.key === 'F') setFlapsDeg((f) => (f === 0 ? 10 : f === 10 ? 30 : 0));
      if (!autopilotEngaged) {
        if (e.key === 'w' || e.key === 'W') setLocalPitchDeg((p) => Math.max(-25, p - 1.5));
        if (e.key === 's' || e.key === 'S') setLocalPitchDeg((p) => Math.min(25, p + 1.5));
        if (e.key === 'a' || e.key === 'A') setLocalRollDeg((r) => Math.max(-45, r - 2.5));
        if (e.key === 'd' || e.key === 'D') setLocalRollDeg((r) => Math.min(45, r + 2.5));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [autopilotEngaged]);

  // Motor autónomo de Travesía por todo Chile: Crucero -> Aterrizaje -> Recarga H2 -> Despegue -> Siguiente Aeropuerto
  useEffect(() => {
    if (!chileTourActive) return;

    const interval = setInterval(() => {
      const mult = tourSpeedMultiplier;

      setFlightPhase((phase) => {
        if (phase === 'TAKEOFF_ROLL') {
          setGearDown(true);
          setFlapsDeg(10);
          setLocalRollDeg(0);
          setLocalSpeedKmh((spd) => {
            const nextSpd = spd + aircraft.vRotateKmh * 0.04 * mult;
            setRunwayProgress((p) => Math.min(0.95, p + 0.015 * mult));
            if (nextSpd >= aircraft.vRotateKmh) {
              setLocalPitchDeg(10.5);
              setFlightPhase('CLIMB');
            }
            return nextSpd;
          });
        } else if (phase === 'CLIMB') {
          setLocalAltM((alt) => {
            const nextAlt = alt + 34 * aircraft.altMultiplier * mult;
            setRunwayProgress((p) => Math.min(1.5, p + 0.02 * mult));
            setLocalSpeedKmh((s) => Math.min(aircraft.maxSpeedKmh * 0.98, s + 16 * aircraft.speedMultiplier * mult));
            if (nextAlt > 220) {
              setGearDown(false);
              setFlapsDeg(0);
            }
            if (nextAlt >= 4700) {
              setLocalPitchDeg(4.2);
              setLocalRollDeg(-15);
              setFlightPhase('CRUISE');
            }
            return nextAlt;
          });
        } else if (phase === 'CRUISE') {
          setFuelPct((f) => Math.max(22, f - 0.025 * mult));
          setLegProgress((prog) => {
            const nextProg = prog + 0.012 * mult;
            if (nextProg >= 0.84) {
              setRunwayProgress(-0.38);
              setFlightPhase('APPROACH');
            }
            return Math.min(0.84, nextProg);
          });
        } else if (phase === 'APPROACH') {
          setGearDown(true);
          setFlapsDeg(30);
          setLocalPitchDeg(-3.5);
          setLocalRollDeg(0);
          setLocalSpeedKmh((s) => Math.max(aircraft.vApproachKmh, s * 0.94));
          setLegProgress((prog) => Math.min(0.98, prog + 0.008 * mult));
          setLocalAltM((alt) => {
            const nextAlt = Math.max(12, alt - 48 * mult);
            setRunwayProgress((p) => Math.min(0.28, p + 0.015 * mult));
            if (nextAlt <= 14) {
              setFlightPhase('LANDING_FLARE');
            }
            return nextAlt;
          });
        } else if (phase === 'LANDING_FLARE') {
          setLocalPitchDeg(4.2);
          setLegProgress(1.0);
          setLocalAltM((alt) => {
            const nextAlt = Math.max(0, alt - 4.5 * mult);
            setRunwayProgress((p) => Math.min(0.88, p + 0.018 * mult));
            setLocalSpeedKmh((s) => Math.max(0, s - aircraft.vApproachKmh * 0.06 * mult));
            if (nextAlt === 0 && localSpeedKmh <= 15) {
              setLocalPitchDeg(0);
              setLocalSpeedKmh(0);
              setRefuelTimer(0);
              if (airportIdx + 1 >= CHILE_AIRPORTS.length - 1) {
                setAirportIdx(CHILE_AIRPORTS.length - 1);
                setFlightPhase('TOUR_COMPLETED');
              } else {
                setFlightPhase('TURNAROUND_REFUEL');
              }
            }
            return nextAlt;
          });
        } else if (phase === 'TURNAROUND_REFUEL') {
          setFuelPct((f) => Math.min(100, f + 4 * mult));
          setRefuelTimer((t) => {
            const nextT = t + 0.1 * mult;
            if (nextT >= 2.2) {
              setAirportIdx((idx) => Math.min(CHILE_AIRPORTS.length - 1, idx + 1));
              setLegProgress(0);
              setRunwayProgress(0.02);
              setLocalSpeedKmh(30);
              setFlapsDeg(10);
              setFlightPhase('TAKEOFF_ROLL');
            }
            return nextT;
          });
        }
        return phase;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [chileTourActive, tourSpeedMultiplier, aircraft, airportIdx, localSpeedKmh]);

  useEffect(() => {
    if (activeDrawer !== 'MAP' || !mapContainerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    const map = L.map(mapContainerRef.current, {
      center: [activeLat, activeLon],
      zoom: 5,
      zoomControl: true,
    });
    const initialLayer = MAP_LAYERS[mapLayerId];
    L.tileLayer(initialLayer.url, {
      attribution: initialLayer.attribution,
      maxZoom: initialLayer.maxZoom,
    }).addTo(map);

    const routeCoords = CHILE_AIRPORTS.map((ap) => [ap.lat, ap.lon] as [number, number]);
    L.polyline(routeCoords, { color: '#38bdf8', weight: 3, dashArray: '6 6' }).addTo(map);

    CHILE_AIRPORTS.forEach((ap, idx) => {
      const visited = idx <= airportIdx;
      L.circleMarker([ap.lat, ap.lon], {
        radius: idx === airportIdx + 1 ? 8 : 5,
        color: visited ? '#22c55e' : '#38bdf8',
        fillColor: visited ? '#22c55e' : '#0284c7',
        fillOpacity: 0.95,
      })
        .bindTooltip(`${idx + 1}. ${ap.icao} - ${ap.city}`, { direction: 'right' })
        .on('click', () => jumpToAirport(idx))
        .addTo(map);
    });

    const planeIcon = L.divIcon({
      className: 'custom-uav-icon',
      html: `<div style="transform: rotate(180deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="${aircraft.accentColor}" stroke="#000" stroke-width="1.5">
          <path d="${aircraft.svgPath}"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    L.marker([activeLat, activeLon], { icon: planeIcon }).addTo(map);
    mapRef.current = map;
  }, [activeDrawer, mapLayerId, airportIdx]);

  const jumpToAirport = (idx: number) => {
    const safeIdx = Math.min(CHILE_AIRPORTS.length - 1, Math.max(0, idx));
    setAirportIdx(safeIdx);
    setLegProgress(0);
    setRunwayProgress(0.02);
    setLocalAltM(0);
    setLocalSpeedKmh(30);
    setGearDown(true);
    setFlapsDeg(10);
    setFlightPhase(safeIdx === CHILE_AIRPORTS.length - 1 ? 'TOUR_COMPLETED' : 'TAKEOFF_ROLL');
  };

  const restartFullChileTour = () => {
    setAirportIdx(0);
    setLegProgress(0);
    setRunwayProgress(0.02);
    setLocalAltM(0);
    setLocalSpeedKmh(35);
    setFuelPct(100);
    setGearDown(true);
    setFlapsDeg(10);
    setChileTourActive(true);
    setFlightPhase('TAKEOFF_ROLL');
  };

  const triggerLandingNow = () => {
    setGearDown(true);
    setFlapsDeg(30);
    setRunwayProgress(-0.38);
    setLocalAltM(390);
    setLocalSpeedKmh(aircraft.vApproachKmh * 1.2);
    setFlightPhase('APPROACH');
  };

  const handleSelectCamera = (id: CameraId) => {
    setActiveCam(id);
    const meta = CAMERAS.find((c) => c.id === id);
    setCamPan(meta?.basePan ?? 0);
    setCamTilt(id === 'CAM8_EXTERNA' ? 10 : 0);
  };

  const downloadBlackbox = async () => {
    const res = await fetch(`${API_URL}/api/blackbox`);
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${aircraft.name}-CHILE-TOUR-${Date.now()}.json`;
    a.click();
  };

  const phaseLabel: Record<FlightPhase, string> = {
    TAKEOFF_ROLL: `DESPEGANDO DE ${originAirport.icao} (${originAirport.city.toUpperCase()})`,
    CLIMB: `ASCENSO RUMBO A ${targetAirport.icao} (${targetAirport.city.toUpperCase()})`,
    CRUISE: `CRUCERO ${currentRegion.code} • ${currentRegion.name.toUpperCase()} → ${targetAirport.icao}`,
    APPROACH: `APROXIMACIÓN ILS A ${targetAirport.icao} (${targetAirport.city.toUpperCase()})`,
    LANDING_FLARE: `ATERRIZANDO EN ${targetAirport.icao} (${targetAirport.rwyLabel})`,
    TURNAROUND_REFUEL: `ESCALA EN ${targetAirport.icao} • RECARGA H2 (${refuelTimer.toFixed(1)}s)`,
    TOUR_COMPLETED: 'TRAVESÍA COMPLETADA • FIN DE CHILE (PUERTO WILLIAMS)',
  };

  return (
    <div
      className="fixed inset-0 bg-black text-zinc-100 select-none overflow-hidden"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button, select, input, .drawer-panel')) return;
        isDraggingCam.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseMove={(e) => {
        if (!isDraggingCam.current) return;
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
      {/* VISOR 3D ATMOSFÉRICO A PANTALLA COMPLETA */}
      <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <FlightSim3DViewport
          camId={activeCam}
          aircraft={aircraft}
          region={currentRegion}
          airport={targetAirport}
          weather={weatherPreset}
          simAltM={Math.round(localAltM)}
          simSpeedKmh={Math.round(localSpeedKmh)}
          simPitchDeg={Number(localPitchDeg.toFixed(1))}
          simRollDeg={Number(localRollDeg.toFixed(1))}
          simHeadingDeg={265}
          runwayProgress={runwayProgress}
          gearDown={gearDown}
          flapsDeg={flapsDeg}
          trimPct={trimPct}
          fuelPct={fuelPct}
          distToNextNm={distToNextNm}
          panOffset={camPan}
          tiltOffset={camTilt}
        />
      </div>

      {/* CONSOLA SUPERIOR CENTRAL METÁLICA BISELADA */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5">
        <div
          className="bg-gradient-to-b from-slate-700/95 via-slate-900/95 to-slate-950/95 backdrop-blur-md border-2 border-slate-500/80 rounded-xl px-3.5 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.85)] flex items-center gap-2"
          style={{ clipPath: 'polygon(2% 0%, 98% 0%, 100% 100%, 0% 100%)' }}
        >
          <button
            onClick={restartFullChileTour}
            className={`px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wider flex flex-col items-center gap-1 cursor-pointer transition ${
              flightPhase === 'TAKEOFF_ROLL' || flightPhase === 'CLIMB'
                ? 'bg-slate-900 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-zinc-200'
            }`}
          >
            <span className="w-7 h-1 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
            <span>TAKEOFF</span>
          </button>

          <button
            onClick={triggerLandingNow}
            className={`px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wider flex flex-col items-center gap-1 cursor-pointer transition ${
              flightPhase === 'APPROACH' || flightPhase === 'LANDING_FLARE'
                ? 'bg-slate-900 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-zinc-200'
            }`}
          >
            <span className="w-7 h-1 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
            <span>LANDING</span>
          </button>

          <button
            onClick={() => setAutopilotEngaged(!autopilotEngaged)}
            className={`px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wider flex flex-col items-center gap-1 cursor-pointer transition ${
              autopilotEngaged
                ? 'bg-slate-900 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                : 'bg-amber-500 border-amber-300 text-black'
            }`}
          >
            <span className={`w-7 h-1 rounded-full ${autopilotEngaged ? 'bg-cyan-400 shadow-[0_0_8px_#38bdf8]' : 'bg-black'}`} />
            <span>{autopilotEngaged ? 'AUTOPILOT' : 'MANUAL'}</span>
          </button>

          <button
            onClick={() => setFlapsDeg((f) => (f === 0 ? 10 : f === 10 ? 30 : 0))}
            className="px-3.5 py-2 rounded-lg border bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-zinc-100 text-xs font-bold tracking-wider flex flex-col items-center gap-0.5 cursor-pointer"
          >
            <span className="w-7 h-1 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
            <span>FLAPS</span>
            <span className="text-[10px] font-mono text-zinc-300">{flapsDeg}°</span>
          </button>

          <button
            onClick={() => setGearDown(!gearDown)}
            className="px-3.5 py-2 rounded-lg border bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-zinc-100 text-xs font-bold tracking-wider flex flex-col items-center gap-0.5 cursor-pointer"
          >
            <span className={`w-7 h-1 rounded-full ${gearDown ? 'bg-cyan-400 shadow-[0_0_8px_#38bdf8]' : 'bg-emerald-400'}`} />
            <span>GEAR</span>
            <span className="text-[10px] font-mono text-zinc-300">{gearDown ? 'DOWN' : 'UP'}</span>
          </button>
        </div>

        {/* Indicador compacto de la Travesía Nacional por Chile */}
        <div className="bg-slate-950/75 backdrop-blur-md border border-slate-700/70 px-3 py-1 rounded-full flex items-center gap-2 text-[10px] font-mono shadow-lg">
          <button
            onClick={() => setChileTourActive(!chileTourActive)}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
          >
            {chileTourActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>CHILE ({airportIdx + 1}/{CHILE_AIRPORTS.length})</span>
          </button>
          <span className="text-slate-600">|</span>
          <span className="text-amber-200 font-bold truncate max-w-[320px]">{phaseLabel[flightPhase]}</span>
          <span className="text-slate-600">|</span>
          <button
            onClick={() => setTourSpeedMultiplier((s) => (s === 1 ? 3 : s === 3 ? 6 : 1))}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold cursor-pointer"
          >
            <FastForward className="w-3 h-3" /> {tourSpeedMultiplier}x
          </button>
        </div>
      </div>

      {/* TARJETAS DE AEROPUERTOS SUPERIOR DERECHA (LIMPIO COMO LA IMAGEN 2) */}
      <div className="absolute top-3 right-3 z-30">
        <div className="bg-gradient-to-b from-slate-700/95 to-slate-950/95 backdrop-blur-md border-2 border-slate-500/80 rounded-xl p-1.5 shadow-2xl flex items-center gap-1.5">
          {[
            { icao: 'SCAR', idx: 0, label: 'Chacalluta' },
            { icao: 'SCEL', idx: 3, label: 'Santiago AMB' },
            { icao: 'SCCI', idx: 6, label: 'Punta Arenas' },
          ].map((item) => {
            const active = targetAirport.icao === item.icao || originAirport.icao === item.icao;
            return (
              <button
                key={item.icao}
                onClick={() => jumpToAirport(item.idx)}
                className={`px-3 py-1.5 rounded-lg border text-left transition cursor-pointer ${
                  active
                    ? 'bg-slate-900 border-cyan-400 text-white shadow-[0_0_10px_rgba(56,189,248,0.35)]'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700/80 text-zinc-300'
                }`}
              >
                <div className="text-xs font-bold font-mono tracking-wide">{item.icao}</div>
                <div className="text-[10px] text-zinc-400">{item.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* BARRAS DE HYDROGEN FUEL Y BATT SOBRE EL ALTÍMETRO (DERECHA) */}
      <div className="absolute right-4 bottom-40 z-30 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-lg p-2 w-44 font-mono text-[10px] space-y-1.5 shadow-xl">
        <div>
          <div className="flex justify-between text-zinc-200 font-bold mb-0.5">
            <span>HYDROGEN FUEL: {Math.round(fuelPct)}%</span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${fuelPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-zinc-200 font-bold mb-0.5">
            <span>BATT: {data?.battery_soc ?? 92}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-emerald-400" style={{ width: `${data?.battery_soc ?? 92}%` }} />
          </div>
        </div>
      </div>

      {/* CONSOLA INFERIOR DE SUBSISTEMAS + TIME/DATE */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
        <div
          className="bg-gradient-to-b from-slate-700/95 via-slate-900/95 to-slate-950/95 backdrop-blur-md border-2 border-slate-500/80 rounded-xl px-3.5 py-2 shadow-2xl flex items-center gap-2.5"
          style={{ clipPath: 'polygon(0% 0%, 100% 0%, 98% 100%, 2% 100%)' }}
        >
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'MAP' ? 'NONE' : 'MAP')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'MAP'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-100'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-cyan-400" /> COMMS
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'SENSORS' ? 'NONE' : 'SENSORS')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'SENSORS'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-100'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" /> SENSORS
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'PAYLOAD' ? 'NONE' : 'PAYLOAD')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'PAYLOAD'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-100'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-cyan-400" /> PAYLOAD
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'SYSTEMS' ? 'NONE' : 'SYSTEMS')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'SYSTEMS'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-100'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" /> SYSTEMS
          </button>
        </div>

        <div className="hidden xl:block bg-slate-950/85 border border-slate-700/80 rounded-lg px-3 py-1.5 font-mono text-[10px] text-zinc-300">
          <div>TIME: <span className="text-white font-bold">{utcClock || '23:42Z'}</span></div>
          <div>DATE: <span className="text-zinc-400">NOV 25 2026</span></div>
        </div>
      </div>

      {/* PANELES DESPLEGABLES FLOTANTES */}
      {activeDrawer !== 'NONE' && (
        <div className="drawer-panel absolute bottom-20 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-2xl bg-slate-950/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-black/80 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 font-mono">
              {activeDrawer === 'MAP' && `ITINERARIO NACIONAL CHILE // ${currentRegion.name}`}
              {activeDrawer === 'SENSORS' && 'CÁMARAS 360° Y AMBIENTACIÓN ATMOSFÉRICA'}
              {activeDrawer === 'PAYLOAD' && `PROPULSIÓN HIDRÓGENO Y FLOTA // ${aircraft.name}`}
              {activeDrawer === 'SYSTEMS' && 'BITÁCORA DE VUELO, CAJA NEGRA Y FAILSAFE'}
            </span>
            <button
              onClick={() => setActiveDrawer('NONE')}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded cursor-pointer"
            >
              Cerrar ✕
            </button>
          </div>

          {activeDrawer === 'MAP' && (
            <div className="p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(Object.keys(MAP_LAYERS) as MapLayerId[]).map((lid) => (
                    <button
                      key={lid}
                      onClick={() => setMapLayerId(lid)}
                      className={`text-[10px] px-2 py-1 rounded cursor-pointer ${
                        mapLayerId === lid ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-900 text-zinc-400'
                      }`}
                    >
                      {MAP_LAYERS[lid].label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={restartFullChileTour}
                  className="text-[10px] px-2.5 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-bold cursor-pointer"
                >
                  Reiniciar Travesía Arica → Fin de Chile
                </button>
              </div>
              <div ref={mapContainerRef} className="w-full h-52 rounded-xl overflow-hidden border border-slate-800" />
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
                {CHILE_AIRPORTS.map((ap, idx) => (
                  <button
                    key={ap.icao}
                    onClick={() => jumpToAirport(idx)}
                    className={`p-1.5 rounded text-left font-mono text-[10px] border cursor-pointer ${
                      idx === airportIdx
                        ? 'bg-cyan-950 border-cyan-400 text-white font-bold'
                        : idx < airportIdx
                        ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-zinc-400'
                    }`}
                  >
                    <div>{idx + 1}.{ap.icao}</div>
                    <div className="truncate text-[9px]">{ap.city}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeDrawer === 'SENSORS' && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CAMERAS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      handleSelectCamera(c.id);
                      setActiveDrawer('NONE');
                    }}
                    className={`p-3 rounded-xl border text-left font-mono cursor-pointer ${
                      activeCam === c.id ? 'bg-cyan-950 border-cyan-400 text-white' : 'bg-slate-900 border-slate-800 text-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-cyan-400">{c.short}</div>
                    <div className="text-[10px] text-zinc-400 mt-1">{c.label}</div>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-zinc-400">CLIMA:</span>
                {(['GOLDEN_HOUR', 'CLEAR_DAY', 'OVERCAST_ANDES'] as WeatherPreset[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => setWeatherPreset(w)}
                    className={`px-2.5 py-1 rounded cursor-pointer ${
                      weatherPreset === w ? 'bg-amber-500 text-black font-bold' : 'bg-slate-900 text-zinc-300'
                    }`}
                  >
                    {w === 'GOLDEN_HOUR' ? 'Atardecer Andes' : w === 'CLEAR_DAY' ? 'Día Despejado' : 'Nublado'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeDrawer === 'PAYLOAD' && (
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(AIRCRAFT_MODELS) as AircraftId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => setSelectedAircraft(id)}
                    className={`px-3 py-1 rounded text-xs font-mono cursor-pointer ${
                      selectedAircraft === id ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-900 text-zinc-400'
                    }`}
                  >
                    {AIRCRAFT_MODELS[id].name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <div className="text-zinc-400 text-[10px]">SISTEMA PROPULSOR</div>
                  <div className="text-cyan-300 font-bold mt-1">{aircraft.propulsionLabel}</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <div className="text-zinc-400 text-[10px]">PRESIÓN TANQUE H2</div>
                  <div className="text-emerald-400 font-bold text-base mt-1">{data?.h2_pressure_bar ?? 700} BAR</div>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <div className="text-zinc-400 text-[10px]">POTENCIA PILA PEM</div>
                  <div className="text-amber-300 font-bold text-base mt-1">{data?.fuel_cell_kw ?? 14.8} kW</div>
                </div>
              </div>
            </div>
          )}

          {activeDrawer === 'SYSTEMS' && (
            <div className="p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-zinc-300">
                  Estado Enlace: <strong className="text-emerald-400">{connected ? 'TELEMETRÍA CONECTADA' : 'SIMULACIÓN AUTÓNOMA 4K'}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadBlackbox}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar Caja Negra JSON
                  </button>
                  <button
                    onClick={() => sendCmd({ action: 'SET_MODE', mode: 'FAILSAFE' })}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" /> FAILSAFE
                  </button>
                </div>
              </div>
              <div className="bg-black/80 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300">
                [OK] Tramo activo: {originAirport.icao} ({originAirport.city}) → {targetAirport.icao} ({targetAirport.city}) • {currentRegion.name}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}