import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Flame, Navigation,
  RotateCcw, AlertTriangle, Camera, Download, Cpu,
  Plane, Grid, Power,
  Layers, LayoutGrid, PlaneLanding, PlaneTakeoff,
  Monitor, Sun, CloudRain, Radio, Wifi, Eye, Package, Settings
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
type WeatherPreset = 'GOLDEN_HOUR' | 'CLEAR_DAY' | 'NIGHT_NVG' | 'OVERCAST_ANDES';
type DrawerTab = 'NONE' | 'MAP' | 'SENSORS' | 'PAYLOAD' | 'SYSTEMS';
type CameraId =
  | 'CAM8_EXTERNA'
  | 'CAM1_PROA'
  | 'CAM2_GIMBAL'
  | 'CAM3_NADIR'
  | 'CAM4_FLIR'
  | 'CAM5_ALA_IZQ'
  | 'CAM6_ALA_DER'
  | 'CAM7_VTAIL';

type FlightPhase = 'PARKED' | 'TAKEOFF_ROLL' | 'CLIMB' | 'CRUISE' | 'APPROACH' | 'LANDING_FLARE' | 'LANDED';
type BiomeType = 'ATACAMA_DESERT' | 'NORTE_CHICO' | 'CENTRAL_VALLEY' | 'SOUTHERN_LAKES' | 'PATAGONIA_FJORDS';

interface ChileRegionInfo {
  code: string;
  name: string;
  capital: string;
  latMin: number;
  latMax: number;
  biome: BiomeType;
  groundHex: number;
  groundCss: string;
  ridgeHex: number;
  fogHex: number;
  hasCoastSea: boolean;
  hasSnowPeaks: boolean;
}

const CHILE_REGIONS: ChileRegionInfo[] = [
  { code: 'XV', name: 'Región de Arica y Parinacota', capital: 'Arica', latMin: -19.2, latMax: -17.4, biome: 'ATACAMA_DESERT', groundHex: 0x9c5a34, groundCss: '#9c5a34', ridgeHex: 0x6b3a1e, fogHex: 0xe09f5a, hasCoastSea: true, hasSnowPeaks: false },
  { code: 'I', name: 'Región de Tarapacá', capital: 'Iquique', latMin: -21.6, latMax: -19.2, biome: 'ATACAMA_DESERT', groundHex: 0xa66338, groundCss: '#a66338', ridgeHex: 0x733e20, fogHex: 0xe3a45f, hasCoastSea: true, hasSnowPeaks: false },
  { code: 'II', name: 'Región de Antofagasta', capital: 'Antofagasta', latMin: -26.1, latMax: -21.6, biome: 'ATACAMA_DESERT', groundHex: 0xb06a3b, groundCss: '#b06a3b', ridgeHex: 0x7c4322, fogHex: 0xe6a866, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'III', name: 'Región de Atacama', capital: 'Copiapó', latMin: -29.3, latMax: -26.1, biome: 'NORTE_CHICO', groundHex: 0x8f5b38, groundCss: '#8f5b38', ridgeHex: 0x5c3a24, fogHex: 0xd99b66, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'IV', name: 'Región de Coquimbo', capital: 'La Serena', latMin: -32.2, latMax: -29.3, biome: 'NORTE_CHICO', groundHex: 0x755c38, groundCss: '#755c38', ridgeHex: 0x4d3d26, fogHex: 0xcbd5e1, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'V', name: 'Región de Valparaíso', capital: 'Valparaíso', latMin: -33.2, latMax: -32.2, biome: 'CENTRAL_VALLEY', groundHex: 0x4d6336, groundCss: '#4d6336', ridgeHex: 0x3b4730, fogHex: 0x93c5fd, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'RM', name: 'Región Metropolitana de Santiago', capital: 'Santiago', latMin: -34.3, latMax: -33.2, biome: 'CENTRAL_VALLEY', groundHex: 0x455e32, groundCss: '#455e32', ridgeHex: 0x364232, fogHex: 0x93c5fd, hasCoastSea: false, hasSnowPeaks: true },
  { code: 'VI', name: "Región de O'Higgins", capital: 'Rancagua', latMin: -35.0, latMax: -34.3, biome: 'CENTRAL_VALLEY', groundHex: 0x3f5e2e, groundCss: '#3f5e2e', ridgeHex: 0x2f422b, fogHex: 0x93c5fd, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'VII', name: 'Región del Maule', capital: 'Talca', latMin: -36.5, latMax: -35.0, biome: 'CENTRAL_VALLEY', groundHex: 0x38592b, groundCss: '#38592b', ridgeHex: 0x2b3d28, fogHex: 0x93c5fd, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'XVI', name: 'Región de Ñuble', capital: 'Chillán', latMin: -37.2, latMax: -36.5, biome: 'CENTRAL_VALLEY', groundHex: 0x315429, groundCss: '#315429', ridgeHex: 0x253b26, fogHex: 0x93c5fd, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'VIII', name: 'Región del Biobío', capital: 'Concepción', latMin: -38.5, latMax: -37.2, biome: 'SOUTHERN_LAKES', groundHex: 0x284d27, groundCss: '#284d27', ridgeHex: 0x1e3824, fogHex: 0x94a3b8, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'IX', name: 'Región de La Araucanía', capital: 'Temuco', latMin: -39.6, latMax: -38.5, biome: 'SOUTHERN_LAKES', groundHex: 0x214726, groundCss: '#214726', ridgeHex: 0x193322, fogHex: 0x94a3b8, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'XIV', name: 'Región de Los Ríos', capital: 'Valdivia', latMin: -40.7, latMax: -39.6, biome: 'SOUTHERN_LAKES', groundHex: 0x1c4226, groundCss: '#1c4226', ridgeHex: 0x152e21, fogHex: 0x94a3b8, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'X', name: 'Región de Los Lagos', capital: 'Puerto Montt', latMin: -44.0, latMax: -40.7, biome: 'SOUTHERN_LAKES', groundHex: 0x183b26, groundCss: '#183b26', ridgeHex: 0x132b22, fogHex: 0x7dd3fc, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'XI', name: 'Región de Aysén', capital: 'Coyhaique', latMin: -49.2, latMax: -44.0, biome: 'PATAGONIA_FJORDS', groundHex: 0x1e3a34, groundCss: '#1e3a34', ridgeHex: 0x334155, fogHex: 0x64748b, hasCoastSea: true, hasSnowPeaks: true },
  { code: 'XII', name: 'Región de Magallanes y Antártica', capital: 'Punta Arenas', latMin: -56.5, latMax: -49.2, biome: 'PATAGONIA_FJORDS', groundHex: 0x263b3a, groundCss: '#263b3a', ridgeHex: 0x475569, fogHex: 0x64748b, hasCoastSea: true, hasSnowPeaks: true },
];

function getRegionByLat(lat: number): ChileRegionInfo {
  return CHILE_REGIONS.find((r) => lat <= r.latMax && lat >= r.latMin) || CHILE_REGIONS[6];
}

interface AirportSpec {
  icao: string;
  name: string;
  city: string;
  regionCode: string;
  lat: number;
  lon: number;
  rwyHeading: number;
  rwyLabel: string;
  ilsFreq: string;
}

const CHILE_AIRPORTS: AirportSpec[] = [
  { icao: 'SCAR', name: 'Chacalluta', city: 'Arica', regionCode: 'XV', lat: -18.3485, lon: -70.3387, rwyHeading: 20, rwyLabel: 'RWY 02/20', ilsFreq: '109.90 MHz' },
  { icao: 'SCDA', name: 'Diego Aracena', city: 'Iquique', regionCode: 'I', lat: -20.5352, lon: -70.1813, rwyHeading: 190, rwyLabel: 'RWY 19/01', ilsFreq: '110.30 MHz' },
  { icao: 'SCFA', name: 'Andrés Sabella', city: 'Antofagasta', regionCode: 'II', lat: -23.4445, lon: -70.4451, rwyHeading: 190, rwyLabel: 'RWY 19/01', ilsFreq: '110.70 MHz' },
  { icao: 'SCEL', name: 'Santiago AMB', city: 'Santiago', regionCode: 'RM', lat: -33.3930, lon: -70.7858, rwyHeading: 170, rwyLabel: 'RWY 17L/35R', ilsFreq: '111.50 MHz' },
  { icao: 'SCIE', name: 'Carriel Sur', city: 'Concepción', regionCode: 'VIII', lat: -36.7727, lon: -73.0631, rwyHeading: 20, rwyLabel: 'RWY 02/20', ilsFreq: '109.50 MHz' },
  { icao: 'SCTE', name: 'El Tepual', city: 'Puerto Montt', regionCode: 'X', lat: -41.4389, lon: -73.0940, rwyHeading: 170, rwyLabel: 'RWY 17/35', ilsFreq: '110.10 MHz' },
  { icao: 'SCCI', name: 'Punta Arenas', city: 'Punta Arenas', regionCode: 'XII', lat: -53.0026, lon: -70.8546, rwyHeading: 250, rwyLabel: 'RWY 25/07', ilsFreq: '109.90 MHz' },
];

interface AircraftSpec {
  id: AircraftId;
  name: string;
  role: string;
  maxSpeedKmh: number;
  vRotateKmh: number;
  vApproachKmh: number;
  cruiseMach: string;
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
    role: 'UAV Autónomo Hidrógeno PEM',
    maxSpeedKmh: 310,
    vRotateKmh: 115,
    vApproachKmh: 105,
    cruiseMach: 'Mach 0.26',
    speedMultiplier: 1.0,
    altMultiplier: 1.0,
    propulsionLabel: 'CELDA HIDRÓGENO PEM 700 BAR',
    accentColor: '#38bdf8',
    bodyColor: 0xe2e8f0,
    svgPath: 'M12 2L15 10L22 14L14 15L13 21L12 19L11 21L10 15L2 14L9 10L12 2Z',
  },
  SR_71: {
    id: 'SR_71',
    name: 'SR-71 BLACKBIRD',
    role: 'Reconocimiento Estratégico Supersónico',
    maxSpeedKmh: 3540,
    vRotateKmh: 390,
    vApproachKmh: 330,
    cruiseMach: 'Mach 3.2',
    speedMultiplier: 13.8,
    altMultiplier: 4.5,
    propulsionLabel: '2x PRATT & WHITNEY J58',
    accentColor: '#f59e0b',
    bodyColor: 0x09090b,
    svgPath: 'M12 1L13.5 8L16 11L21 18L16 18L15 22L14 19L12 21L10 19L9 22L8 18L3 18L8 11L10.5 8L12 1Z',
  },
  F_35: {
    id: 'F_35',
    name: 'F-35A LIGHTNING II',
    role: 'Caza Furtivo 5ª Gen',
    maxSpeedKmh: 1960,
    vRotateKmh: 280,
    vApproachKmh: 250,
    cruiseMach: 'Mach 1.6',
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
    role: 'Superioridad Aérea Supercrucero',
    maxSpeedKmh: 2410,
    vRotateKmh: 270,
    vApproachKmh: 240,
    cruiseMach: 'Mach 2.25',
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
  { id: 'CAM8_EXTERNA', short: 'CHASE 4K', label: 'PERSECUCIÓN EXTERNA MSFS 4K', basePan: 24 },
  { id: 'CAM1_PROA', short: 'COCKPIT', label: 'CABINA / PROA HUD 4K', basePan: 0 },
  { id: 'CAM2_GIMBAL', short: 'GIMBAL EO', label: 'TORRETA ÓPTICA 30X', basePan: 0 },
  { id: 'CAM3_NADIR', short: 'NADIR', label: 'CENITAL ORTOFOTO', basePan: 0 },
  { id: 'CAM4_FLIR', short: 'FLIR IR', label: 'VISIÓN TÉRMICA LWIR', basePan: 0 },
  { id: 'CAM5_ALA_IZQ', short: 'ALA IZQ', label: 'ALA BABOR', basePan: -75 },
  { id: 'CAM6_ALA_DER', short: 'ALA DER', label: 'ALA ESTRIBOR', basePan: 75 },
  { id: 'CAM7_VTAIL', short: 'COLA V', label: 'EMPENAJE DORSAL', basePan: 180 },
];

// Construcción 3D de alta fidelidad de la aeronave (incluyendo ala invertida H2-VALKYRIE con franjas luminosas cian)
function buildDetailedAircraftMesh(spec: AircraftSpec, gearDown: boolean, flapsDeg: number): THREE.Group {
  const root = new THREE.Group();

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: spec.bodyColor,
    roughness: spec.id === 'SR_71' ? 0.36 : 0.22,
    metalness: 0.78,
    clearcoat: 0.75,
    clearcoatRoughness: 0.15,
  });
  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.65,
  });
  const glowStripMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.accentColor),
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x060b14,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.18,
    roughness: 0.06,
    metalness: 0.95,
    clearcoat: 1.0,
  });

  if (spec.id === 'H2_VALKYRIE') {
    // Fuselaje aerodinámico integrado
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.34, 7.6, 32), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    root.add(fuselage);

    const dorsalSpine = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 5.2), darkCarbonMat);
    dorsalSpine.position.set(0, 0.38, 0.4);
    root.add(dorsalSpine);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 20), hullMat);
    nose.scale.set(1.05, 0.82, 2.3);
    nose.position.set(0, -0.04, -4.0);
    root.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), canopyMat);
    canopy.scale.set(1.0, 0.68, 2.4);
    canopy.position.set(0, 0.32, -2.1);
    root.add(canopy);

    // Alas invertidas estilo Valkyrie con borde luminoso cian
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.11, 1.25), hullMat);
    wingL.position.set(-3.6, 0.06, -0.25);
    wingL.rotation.y = -0.24;
    const stripL = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.04, 0.14), glowStripMat);
    stripL.position.set(-3.6, 0.12, -0.78);
    stripL.rotation.y = -0.24;

    const flapL = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.35), darkCarbonMat);
    flapL.position.set(-2.4, 0.02 - flapsDeg * 0.006, 0.42);
    flapL.rotation.x = (flapsDeg * Math.PI) / 180;

    const wingletL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.95, 0.82), hullMat);
    wingletL.position.set(-7.15, 0.48, -1.08);
    wingletL.rotation.z = 0.28;

    const wingR = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.11, 1.25), hullMat);
    wingR.position.set(3.6, 0.06, -0.25);
    wingR.rotation.y = 0.24;
    const stripR = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.04, 0.14), glowStripMat);
    stripR.position.set(3.6, 0.12, -0.78);
    stripR.rotation.y = 0.24;

    const flapR = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.35), darkCarbonMat);
    flapR.position.set(2.4, 0.02 - flapsDeg * 0.006, 0.42);
    flapR.rotation.x = (flapsDeg * Math.PI) / 180;

    const wingletR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.95, 0.82), hullMat);
    wingletR.position.set(7.15, 0.48, -1.08);
    wingletR.rotation.z = -0.28;

    root.add(wingL, stripL, flapL, wingletL, wingR, stripR, flapR, wingletR);

    // Doble estabilizador V-Tail
    const vL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 1.0), hullMat);
    vL.position.set(-0.78, 0.78, 3.2);
    vL.rotation.z = 0.54;
    const vR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 1.0), hullMat);
    vR.position.set(0.78, 0.78, 3.2);
    vR.rotation.z = -0.54;
    root.add(vL, vR);
  } else if (spec.id === 'SR_71') {
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 11.4, 24), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    root.add(fuselage);

    const chine = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.08, 9.8), hullMat);
    chine.position.set(0, 0, -0.4);
    root.add(chine);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 2.9, 24), hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -7.0);
    root.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), canopyMat);
    canopy.scale.set(0.85, 0.65, 2.4);
    canopy.position.set(0, 0.36, -3.5);
    root.add(canopy);

    const deltaWing = new THREE.Mesh(new THREE.ConeGeometry(4.6, 7.2, 3), hullMat);
    deltaWing.rotation.x = -Math.PI / 2;
    deltaWing.scale.set(1.25, 1, 0.04);
    deltaWing.position.set(0, -0.02, 1.4);
    root.add(deltaWing);

    [-2.1, 2.1].forEach((nx) => {
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.44, 5.4, 24), hullMat);
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(nx, 0.05, 1.2);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 20), glowStripMat);
      spike.rotation.x = -Math.PI / 2;
      spike.position.set(nx, 0.05, -2.0);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.85, 1.4), hullMat);
      fin.position.set(nx * 0.92, 0.98, 2.3);
      fin.rotation.z = nx < 0 ? -0.26 : 0.26;
      root.add(nacelle, spike, fin);
    });
  } else {
    const isF22 = spec.id === 'F_22';
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(isF22 ? 1.85 : 1.55, 0.68, 8.2), hullMat);
    root.add(fuselage);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.6, 4), hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.scale.set(1.1, 1, 0.55);
    nose.position.set(0, -0.04, -5.3);
    root.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.54, 22, 16), canopyMat);
    canopy.scale.set(0.95, 0.72, 2.5);
    canopy.position.set(0, 0.45, -2.2);
    root.add(canopy);

    const wingSpan = isF22 ? 5.6 : 4.8;
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(wingSpan, 0.1, 2.4), hullMat);
    wingL.position.set(-wingSpan / 2 - 0.5, 0.04, 0.4);
    wingL.rotation.y = 0.36;
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(wingSpan, 0.1, 2.4), hullMat);
    wingR.position.set(wingSpan / 2 + 0.5, 0.04, 0.4);
    wingR.rotation.y = -0.36;
    root.add(wingL, wingR);

    [-0.95, 0.95].forEach((fx) => {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 1.3), hullMat);
      fin.position.set(fx, 0.85, 3.0);
      fin.rotation.z = fx < 0 ? 0.34 : -0.34;
      root.add(fin);
    });
  }

  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  navRed.position.set(-5.2, 0.08, 0.1);
  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  navGreen.position.set(5.2, 0.08, 0.1);
  root.add(navRed, navGreen);

  if (gearDown) {
    const strutMat = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, metalness: 0.92, roughness: 0.18 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.88 });

    [
      [0, -0.75, -2.8],
      [-1.15, -0.75, 0.8],
      [1.15, -0.75, 0.8],
    ].forEach(([gx, gy, gz]) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 10), strutMat);
      strut.position.set(gx, gy + 0.3, gz);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 16), tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(gx, gy - 0.12, gz);
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

  for (let i = 0; i < 32000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)';
    ctx.fillRect(Math.random() * 1024, Math.random() * 4096, 3, 3);
  }

  ctx.fillStyle = '#e4e4e7';
  ctx.fillRect(56, 0, 18, 4096);
  ctx.fillRect(950, 0, 18, 4096);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 18;
  for (let y = 3720; y <= 3960; y += 110) {
    ctx.beginPath();
    ctx.moveTo(240, y + 70);
    ctx.lineTo(512, y);
    ctx.lineTo(784, y + 70);
    ctx.stroke();
  }

  ctx.fillStyle = '#f4f4f5';
  for (let x = 128; x <= 848; x += 96) {
    if (Math.abs(x - 492) < 56) continue;
    ctx.fillRect(x, 3380, 48, 260);
    ctx.fillRect(x, 360, 48, 260);
  }

  ctx.save();
  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 92px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(rwyLabel.replace('RWY ', '').split('/')[0], 512, 3240);
  ctx.restore();

  ctx.fillStyle = 'rgba(9, 9, 11, 0.72)';
  ctx.fillRect(300, 2640, 150, 640);
  ctx.fillRect(574, 2640, 150, 640);

  for (let y = 680; y < 3120; y += 180) {
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(500, y, 24, 104);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  return tex;
}

function createRegionalTerrainTexture(region: ChileRegionInfo, isFlir: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isFlir ? '#27272a' : region.groundCss;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 3 + Math.random() * 22;
    if (isFlir) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(220,220,225,0.06)' : 'rgba(10,10,12,0.12)';
    } else if (region.biome === 'ATACAMA_DESERT') {
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(217,119,6,0.12)' : 'rgba(69,26,3,0.14)';
    } else if (region.biome === 'PATAGONIA_FJORDS') {
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(14,116,144,0.16)' : 'rgba(15,23,42,0.18)';
    } else if (region.biome === 'SOUTHERN_LAKES') {
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(21,128,61,0.14)' : 'rgba(6,78,59,0.16)';
    } else {
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(101,163,13,0.13)' : 'rgba(54,83,20,0.15)';
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.12)' : 'rgba(253, 224, 71, 0.25)';
  ctx.lineWidth = 2;
  for (let road = 0; road < 18; road++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 1024, 0);
    ctx.lineTo(Math.random() * 1024, 1024);
    ctx.stroke();
  }

  if (region.biome === 'PATAGONIA_FJORDS' || region.biome === 'SOUTHERN_LAKES') {
    ctx.fillStyle = isFlir ? '#18181b' : '#0c4a6e';
    for (let l = 0; l < 8; l++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * 1024, Math.random() * 1024, 80 + Math.random() * 110, 30 + Math.random() * 44, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 20);
  tex.anisotropy = 16;
  return tex;
}

// Instrumentos estilo Microsoft Flight Simulator dibujados directamente en el visor 4K
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
    pitchDeg: number;
    rollDeg: number;
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
    pitchDeg,
    rollDeg,
  } = params;

  // Horizonte central sutil
  const pitchOffsetY = Math.max(-60, Math.min(60, pitchDeg * 3.2));
  ctx.save();
  ctx.translate(w / 2, h / 2 + pitchOffsetY);
  ctx.rotate((-rollDeg * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-48, 0);
  ctx.lineTo(-14, 0);
  ctx.moveTo(14, 0);
  ctx.lineTo(48, 0);
  ctx.stroke();
  ctx.restore();

  // 1. SUPERIOR IZQUIERDA: BRÚJULA CIRCULAR GIRATORIA + PLACA AERONAVE + CAJA FMS
  const cx = 78;
  const cy = 84;
  const r = 52;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 15, 24, 0.78)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Caja digital HDG superior
  ctx.fillStyle = 'rgba(10, 15, 24, 0.94)';
  ctx.fillRect(cx - 28, cy - r - 22, 56, 18);
  ctx.strokeStyle = '#38bdf8';
  ctx.strokeRect(cx - 28, cy - r - 22, 56, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(heading)}°`, cx, cy - r - 8);

  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`HDG ${Math.round(heading)}°`, cx - 50, cy - r - 8);
  ctx.fillStyle = '#e879f9';
  ctx.fillText(`CRS ${Math.round(course)}°`, cx + 50, cy - r - 8);

  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);

  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const inner = isMajor ? r - 10 : r - 5;
    ctx.strokeStyle = deg === 0 ? '#ef4444' : 'rgba(255,255,255,0.82)';
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
  ctx.moveTo(cx, cy - 9);
  ctx.lineTo(cx, cy + 9);
  ctx.moveTo(cx - 9, cy);
  ctx.lineTo(cx + 9, cy);
  ctx.stroke();

  // Placa con nombre de aeronave debajo de la brújula
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(16, cy + r + 10, 124, 22);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.strokeRect(16, cy + r + 10, 124, 22);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(aircraftName, 78, cy + r + 25);

  // Caja FMS a la derecha de la brújula
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.fillRect(142, 52, 118, 36);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(142, 52, 118, 36);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('FMS', 149, 65);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`> ${airportIcao} ${distNm.toFixed(1)} NM`, 149, 80);

  // 2. INFERIOR IZQUIERDA: AIRSPEED + TAS + ENGINE % + FUEL + AOA
  const blX = 16;
  const blY = h - 142;

  ctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
  ctx.fillRect(blX, blY, 64, 126);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.strokeRect(blX, blY, 64, 126);

  ctx.fillStyle = '#38bdf8';
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
    ctx.fillStyle = '#e2e8f0';
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

  ctx.fillStyle = '#94a3b8';
  ctx.font = '8px monospace';
  ctx.fillText(`TAS ${Math.round(tasKt)} KTS`, blX + 32, blY + 119);

  // Reloj ENGINE %
  const engX = blX + 70;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
  ctx.fillRect(engX, blY + 22, 76, 104);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
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

  // Barra FUEL
  const fuelX = engX + 80;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
  ctx.fillRect(fuelX, blY + 22, 40, 104);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
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

  // Barra AOA
  const aoaX = fuelX + 44;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
  ctx.fillRect(aoaX, blY + 22, 38, 104);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.strokeRect(aoaX, blY + 22, 38, 104);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('AOA', aoaX + 19, blY + 34);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${aoaDeg.toFixed(1)}°`, aoaX + 19, blY + 76);

  // 3. INFERIOR DERECHA: FLAPS + TRIM + ALTITUDE + VS
  const brX = w - 172;
  const brY = h - 142;

  ctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
  ctx.fillRect(brX, brY + 22, 66, 104);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.strokeRect(brX, brY + 22, 66, 104);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('FLAPS  TRIM', brX + 33, brY + 34);

  ctx.fillStyle = gearDown ? '#f59e0b' : '#22c55e';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${flapsDeg}°`, brX + 18, brY + 75);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`${trimPct}%`, brX + 50, brY + 75);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '8px monospace';
  ctx.fillText(gearDown ? 'GEAR DN' : 'GEAR UP', brX + 33, brY + 117);

  const altX = brX + 70;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
  ctx.fillRect(altX, brY, 86, 126);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.strokeRect(altX, brY, 86, 126);

  ctx.fillStyle = '#38bdf8';
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
    ctx.fillStyle = '#e2e8f0';
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
  ctx.fillText(`${Math.round(altFt)}`, altX + 32, brY + 65);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px monospace';
  ctx.fillText(`${Math.round(vsFpm)}`, altX + 73, brY + 64);
  ctx.fillText('29.92 IN', altX + 43, brY + 119);
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
    panOffset,
    tiltOffset,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const activeFog =
      weather === 'NIGHT_NVG'
        ? 0x04120a
        : weather === 'OVERCAST_ANDES'
        ? 0x64748b
        : weather === 'CLEAR_DAY'
        ? 0x7dd3fc
        : region.fogHex;
    scene.fog = new THREE.FogExp2(activeFog, weather === 'OVERCAST_ANDES' ? 0.00068 : 0.0004);

    const camera = new THREE.PerspectiveCamera(
      camId === 'CAM2_GIMBAL' ? 28 : 56,
      (container.clientWidth || 1280) / (container.clientHeight || 720),
      0.2,
      4400
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = weather === 'NIGHT_NVG' ? 1.45 : 1.2;
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(
      weather === 'NIGHT_NVG' ? 0x10b981 : 0xfff3d6,
      0x1e293b,
      weather === 'NIGHT_NVG' ? 0.65 : 1.05
    );
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(
      weather === 'GOLDEN_HOUR' ? 0xffcf87 : weather === 'NIGHT_NVG' ? 0x34d399 : 0xffffff,
      weather === 'NIGHT_NVG' ? 0.9 : 2.6
    );
    sunLight.position.set(550, weather === 'CLEAR_DAY' ? 520 : 195, -950);
    scene.add(sunLight);

    const skyGeo = new THREE.SphereGeometry(3400, 36, 24);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 32;
    skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d')!;
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    if (weather === 'NIGHT_NVG') {
      sGrad.addColorStop(0.0, '#020617');
      sGrad.addColorStop(0.5, '#052e16');
      sGrad.addColorStop(1.0, '#020617');
    } else if (weather === 'CLEAR_DAY') {
      sGrad.addColorStop(0.0, '#0c4a6e');
      sGrad.addColorStop(0.45, '#38bdf8');
      sGrad.addColorStop(0.52, '#e0f2fe');
      sGrad.addColorStop(1.0, '#1e293b');
    } else if (weather === 'OVERCAST_ANDES') {
      sGrad.addColorStop(0.0, '#1e293b');
      sGrad.addColorStop(0.48, '#64748b');
      sGrad.addColorStop(0.53, '#cbd5e1');
      sGrad.addColorStop(1.0, '#0f172a');
    } else {
      sGrad.addColorStop(0.0, '#091936');
      sGrad.addColorStop(0.32, '#2d4f80');
      sGrad.addColorStop(0.46, '#f59e0b');
      sGrad.addColorStop(0.51, '#fef08a');
      sGrad.addColorStop(1.0, '#1e293b');
    }
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 32, 256);
    const skyDome = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(skyCanvas), side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);

    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(78, 28),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3, fog: false })
    );
    sunDisc.position.set(620, weather === 'CLEAR_DAY' ? 420 : 88, -2300);
    sunDisc.lookAt(0, 0, 0);
    sunDisc.visible = weather !== 'NIGHT_NVG' && weather !== 'OVERCAST_ANDES';
    scene.add(sunDisc);

    // Nubes volumétricas
    const cloudsGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: weather === 'GOLDEN_HOUR' ? 0xffedd5 : 0xf8fafc,
      emissive: weather === 'GOLDEN_HOUR' ? 0xc2410c : 0x334155,
      emissiveIntensity: weather === 'GOLDEN_HOUR' ? 0.28 : 0.12,
      roughness: 0.95,
      transparent: true,
      opacity: weather === 'OVERCAST_ANDES' ? 0.88 : 0.78,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1, 1);
    for (let i = 0; i < 55; i++) {
      const cluster = new THREE.Group();
      for (let p = 0; p < 5; p++) {
        const mesh = new THREE.Mesh(puffGeo, cloudMat);
        mesh.scale.set(36 + Math.random() * 44, 8 + Math.random() * 10, 26 + Math.random() * 32);
        mesh.position.set((p - 2) * 26, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 22);
        cluster.add(mesh);
      }
      cluster.position.set((Math.random() - 0.5) * 2900, 175 + Math.random() * 165, (Math.random() - 0.5) * 2900);
      cloudsGroup.add(cluster);
    }
    scene.add(cloudsGroup);

    // Terreno 4K de Chile con Cordillera de los Andes nevada a la izquierda/fondo y valle a la derecha
    const terrainGeo = new THREE.PlaneGeometry(4000, 4000, 160, 160);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    const colors: number[] = [];
    const baseCol = new THREE.Color(region.groundHex);
    const ridgeCol = new THREE.Color(region.ridgeHex);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const corridorMask = THREE.MathUtils.smoothstep(Math.abs(x), 75, 260);
      const isSea = region.hasCoastSea && x > 620;
      const ridgeNoise =
        Math.sin(x * 0.012) * Math.cos(z * 0.012) * 34 +
        Math.sin(x * 0.032 + z * 0.025) * 14;

      const andesBack = z < -620 || x < -380 ? Math.pow(Math.max(0, (-z - 620) / 1050, (-x - 380) / 1100), 1.45) * 310 : 0;
      const andesPeaks =
        andesBack > 10 ? Math.abs(Math.sin(x * 0.0085 + z * 0.006)) * 145 : 0;

      const height = isSea
        ? -4
        : Math.max(0, corridorMask * (Math.max(0, ridgeNoise) + 12)) + andesBack + andesPeaks;
      posAttr.setY(i, height);

      if (isSea) {
        colors.push(0.05, 0.24, 0.42);
      } else if (region.hasSnowPeaks && height > 195) {
        colors.push(0.96, 0.97, 0.99);
      } else if (height > 90) {
        colors.push(ridgeCol.r, ridgeCol.g, ridgeCol.b);
      } else {
        colors.push(baseCol.r, baseCol.g, baseCol.b);
      }
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({
        map: createRegionalTerrainTexture(region, camId === 'CAM4_FLIR'),
        vertexColors: true,
        roughness: 0.88,
      })
    );
    scene.add(terrainMesh);

    // Pista de aterrizaje 4K
    const runwayGroup = new THREE.Group();
    const runwayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 820),
      new THREE.MeshStandardMaterial({ map: createRunwayTexture(airport.rwyLabel), roughness: 0.76 })
    );
    runwayMesh.rotation.x = -Math.PI / 2;
    runwayMesh.position.set(0, 0.25, -260);
    runwayGroup.add(runwayMesh);

    const edgeLightGeo = new THREE.SphereGeometry(0.72, 10, 10);
    const whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const redLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });

    for (let z = 140; z >= -660; z -= 32) {
      const lL = new THREE.Mesh(edgeLightGeo, whiteLightMat);
      lL.position.set(-20.5, 0.65, z);
      const lR = new THREE.Mesh(edgeLightGeo, whiteLightMat);
      lR.position.set(20.5, 0.65, z);
      runwayGroup.add(lL, lR);
    }
    for (let x = -18; x <= 18; x += 4.5) {
      const thresh = new THREE.Mesh(edgeLightGeo, greenLightMat);
      thresh.position.set(x, 0.7, 148);
      runwayGroup.add(thresh);
    }
    [-28, -31.5, -35, -38.5].forEach((px, idx) => {
      const papi = new THREE.Mesh(edgeLightGeo, idx < 2 ? redLightMat : whiteLightMat);
      papi.position.set(px, 0.85, 85);
      runwayGroup.add(papi);
    });
    scene.add(runwayGroup);

    const aircraftModel = buildDetailedAircraftMesh(aircraft, gearDown, flapsDeg);
    scene.add(aircraftModel);

    const afterburnerMat = new THREE.MeshBasicMaterial({
      color: aircraft.id === 'H2_VALKYRIE' ? 0x38bdf8 : aircraft.id === 'SR_71' ? 0xf59e0b : 0x60a5fa,
      transparent: true,
      opacity: 0.88,
    });
    const afterburner = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.8, 18), afterburnerMat);
    afterburner.rotation.x = Math.PI / 2;
    afterburner.position.set(0, 0, 5.2);
    aircraftModel.add(afterburner);

    let animId: number;
    let cruiseScroll = 0;

    const animate = () => {
      const st = stateRef.current;
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 720;
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) {
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
        cruiseScroll += (st.simSpeedKmh / 3600) * 26;
        terrainMesh.position.z = cruiseScroll % 200;
        aircraftModel.position.set(0, 112 + Math.min(240, st.simAltM * 0.025), 0);
      }

      aircraftModel.rotation.set(pitchRad, 0, -rollRad);
      afterburner.visible = st.simSpeedKmh > 40;
      afterburner.scale.setScalar(0.7 + Math.min(1.4, st.simSpeedKmh / 1200) + Math.random() * 0.12);

      cloudsGroup.children.forEach((c) => {
        c.position.z += 0.25;
        if (c.position.z > 1400) c.position.z = -1400;
      });

      const isFlir = st.camId === 'CAM4_FLIR';
      scene.fog = new THREE.FogExp2(isFlir ? 0x18181b : activeFog, isFlir ? 0.00075 : 0.0004);
      skyDome.visible = !isFlir;
      renderer.setClearColor(isFlir ? 0x09090b : activeFog);

      camera.fov = st.camId === 'CAM2_GIMBAL' ? 28 : 56;
      camera.updateProjectionMatrix();

      const panRad = (-st.panOffset * Math.PI) / 180;
      const tiltRad = (st.tiltOffset * Math.PI) / 180;

      if (st.camId === 'CAM8_EXTERNA') {
        aircraftModel.visible = true;
        const dist = st.aircraft.id === 'SR_71' ? 15.5 : 11.8;
        const camX = aircraftModel.position.x + Math.sin(panRad) * Math.cos(tiltRad) * dist;
        const camY = aircraftModel.position.y + 1.85 + Math.sin(tiltRad) * dist;
        const camZ = aircraftModel.position.z + Math.cos(panRad) * Math.cos(tiltRad) * dist;
        camera.position.set(camX, Math.max(1.2, camY), camZ);
        camera.lookAt(aircraftModel.position.clone().add(new THREE.Vector3(0, 0.25, -1.5)));
      } else if (st.camId === 'CAM3_NADIR') {
        aircraftModel.visible = false;
        camera.position.copy(aircraftModel.position).add(new THREE.Vector3(0, -0.3, 0));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(-Math.PI / 2 + tiltRad * 0.4, panRad, -rollRad);
      } else if (st.camId === 'CAM5_ALA_IZQ') {
        aircraftModel.visible = true;
        camera.position.copy(aircraftModel.position).add(new THREE.Vector3(-0.75, 0.35, -0.1));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
      } else if (st.camId === 'CAM6_ALA_DER') {
        aircraftModel.visible = true;
        camera.position.copy(aircraftModel.position).add(new THREE.Vector3(0.75, 0.35, -0.1));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
      } else if (st.camId === 'CAM7_VTAIL') {
        aircraftModel.visible = true;
        camera.position.copy(aircraftModel.position).add(new THREE.Vector3(0, 0.85, 1.3));
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitchRad + tiltRad, panRad, -rollRad);
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
          distNm: Math.max(0.2, 12.3 - st.runwayProgress * 10),
          speedKt,
          tasKt: speedKt * (1 + st.simAltM / 45000),
          altFt: st.simAltM * 3.28084,
          vsFpm: st.simPitchDeg * 145,
          throttlePct: st.simSpeedKmh > 0 ? Math.min(100, 35 + (st.simSpeedKmh / st.aircraft.maxSpeedKmh) * 65) : 0,
          fuelPct: 76,
          aoaDeg: st.simPitchDeg,
          gearDown: st.gearDown,
          flapsDeg: st.flapsDeg,
          trimPct: st.trimPct,
          pitchDeg: st.simPitchDeg,
          rollDeg: st.simRollDeg,
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
  const [selectedAirportIcao, setSelectedAirportIcao] = useState<string>('SCEL');
  const [mapLayerId, setMapLayerId] = useState<MapLayerId>('SATELLITE');
  const [weatherPreset, setWeatherPreset] = useState<WeatherPreset>('GOLDEN_HOUR');
  const [autoFollowMap, setAutoFollowMap] = useState<boolean>(true);

  const [flightPhase, setFlightPhase] = useState<FlightPhase>('CRUISE');
  const [runwayProgress, setRunwayProgress] = useState<number>(0.02);
  const [localAltM, setLocalAltM] = useState<number>(4700);
  const [localSpeedKmh, setLocalSpeedKmh] = useState<number>(304);
  const [localPitchDeg, setLocalPitchDeg] = useState<number>(4.2);
  const [localRollDeg, setLocalRollDeg] = useState<number>(-14);
  const [flapsDeg, setFlapsDeg] = useState<number>(10);
  const [trimPct, setTrimPct] = useState<number>(4);
  const [autopilotEngaged, setAutopilotEngaged] = useState<boolean>(true);

  const [camPan, setCamPan] = useState(24);
  const [camTilt, setCamTilt] = useState(11);
  const isDraggingCam = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [gearDown, setGearDown] = useState(true);
  const [utcClock, setUtcClock] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const planeMarkerRef = useRef<L.Marker | null>(null);
  const wpLayerRef = useRef<L.LayerGroup | null>(null);

  const aircraft = AIRCRAFT_MODELS[selectedAircraft];
  const currentAirport = CHILE_AIRPORTS.find((a) => a.icao === selectedAirportIcao) || CHILE_AIRPORTS[3];

  const activeLat = flightPhase === 'CRUISE' && data ? data.lat : currentAirport.lat;
  const activeLon = flightPhase === 'CRUISE' && data ? data.lon : currentAirport.lon;
  const currentRegion = getRegionByLat(activeLat);

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

  // Controles de teclado Flight Simulator (WASD, G, F)
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

  // Dinámica de vuelo y transición de fases
  useEffect(() => {
    const interval = setInterval(() => {
      setFlightPhase((phase) => {
        if (phase === 'TAKEOFF_ROLL') {
          setLocalSpeedKmh((spd) => {
            const nextSpd = Math.min(aircraft.vRotateKmh + 30, spd + aircraft.vRotateKmh * 0.035);
            setRunwayProgress((p) => Math.min(0.95, p + 0.012));
            if (nextSpd >= aircraft.vRotateKmh) {
              setLocalPitchDeg(11);
              setFlightPhase('CLIMB');
            }
            return nextSpd;
          });
        } else if (phase === 'CLIMB') {
          setLocalAltM((alt) => {
            const nextAlt = alt + 22 * aircraft.altMultiplier;
            setRunwayProgress((p) => Math.min(1.5, p + 0.015));
            setLocalSpeedKmh((s) => Math.min(aircraft.maxSpeedKmh * 0.95, s + 14 * aircraft.speedMultiplier));
            if (nextAlt > 220) {
              setGearDown(false);
              setFlapsDeg(0);
            }
            if (nextAlt >= 4700) {
              setLocalPitchDeg(4.2);
              setFlightPhase('CRUISE');
            }
            return nextAlt;
          });
        } else if (phase === 'CRUISE') {
          if (autopilotEngaged && data) {
            setLocalAltM(data.alt * aircraft.altMultiplier);
            setLocalSpeedKmh(data.speed * aircraft.speedMultiplier);
            setLocalPitchDeg(data.pitch);
            setLocalRollDeg(data.roll);
          } else if (!autopilotEngaged) {
            setLocalAltM((a) => Math.max(50, a + localPitchDeg * 1.4));
          }
        } else if (phase === 'APPROACH') {
          setGearDown(true);
          setFlapsDeg(30);
          setLocalPitchDeg(-3.5);
          setLocalSpeedKmh((s) => Math.max(aircraft.vApproachKmh, s * 0.96));
          setLocalAltM((alt) => {
            const nextAlt = Math.max(12, alt - 22);
            setRunwayProgress((p) => Math.min(0.28, p + 0.01));
            if (nextAlt <= 14) {
              setFlightPhase('LANDING_FLARE');
            }
            return nextAlt;
          });
        } else if (phase === 'LANDING_FLARE') {
          setLocalPitchDeg(4.5);
          setLocalAltM((alt) => {
            const nextAlt = Math.max(0, alt - 3.5);
            setRunwayProgress((p) => Math.min(0.88, p + 0.014));
            setLocalSpeedKmh((s) => Math.max(0, s - aircraft.vApproachKmh * 0.04));
            if (nextAlt === 0 && localSpeedKmh <= 12) {
              setLocalPitchDeg(0);
              setLocalSpeedKmh(0);
              setFlightPhase('LANDED');
            }
            return nextAlt;
          });
        }
        return phase;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [aircraft, data, localSpeedKmh, autopilotEngaged, localPitchDeg]);

  // Inicializar mapa táctico regional cuando se abre el panel MAP
  useEffect(() => {
    if (activeDrawer !== 'MAP' || !mapContainerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    const map = L.map(mapContainerRef.current, {
      center: [activeLat, activeLon],
      zoom: 9,
      zoomControl: true,
    });
    const initialLayer = MAP_LAYERS[mapLayerId];
    tileLayerRef.current = L.tileLayer(initialLayer.url, {
      attribution: initialLayer.attribution,
      maxZoom: initialLayer.maxZoom,
    }).addTo(map);

    wpLayerRef.current = L.layerGroup().addTo(map);
    CHILE_AIRPORTS.forEach((ap) => {
      const isSelected = ap.icao === selectedAirportIcao;
      L.circleMarker([ap.lat, ap.lon], {
        radius: isSelected ? 8 : 5,
        color: isSelected ? '#f59e0b' : '#38bdf8',
        fillColor: isSelected ? '#f59e0b' : '#0284c7',
        fillOpacity: 0.95,
      })
        .bindTooltip(`${ap.icao} - ${ap.city} (${ap.rwyLabel})`, { direction: 'right' })
        .on('click', () => handleSelectAirport(ap.icao))
        .addTo(wpLayerRef.current!);
    });

    const planeIcon = L.divIcon({
      className: 'custom-uav-icon',
      html: `<div style="transform: rotate(${currentAirport.rwyHeading}deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="${aircraft.accentColor}" stroke="#000" stroke-width="1.5">
          <path d="${aircraft.svgPath}"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    planeMarkerRef.current = L.marker([activeLat, activeLon], { icon: planeIcon }).addTo(map);
    mapRef.current = map;
  }, [activeDrawer, mapLayerId, selectedAirportIcao]);

  const handleSelectAirport = (icao: string) => {
    setSelectedAirportIcao(icao);
    const ap = CHILE_AIRPORTS.find((a) => a.icao === icao);
    if (!ap) return;
    if (flightPhase === 'CRUISE' || flightPhase === 'CLIMB') {
      setRunwayProgress(-0.35);
      setLocalAltM(380);
      setFlightPhase('APPROACH');
    } else {
      setRunwayProgress(0.02);
      setLocalAltM(0);
      setLocalSpeedKmh(0);
      setLocalPitchDeg(0);
      setGearDown(true);
      setFlapsDeg(10);
      setFlightPhase('PARKED');
    }
  };

  const triggerTakeoff = () => {
    setGearDown(true);
    setFlapsDeg(15);
    setRunwayProgress(0.02);
    setLocalAltM(0);
    setLocalSpeedKmh(25);
    setLocalPitchDeg(0);
    setFlightPhase('TAKEOFF_ROLL');
    sendCmd({ action: 'START_MISSION' });
  };

  const triggerLandingAtAirport = () => {
    setGearDown(true);
    setFlapsDeg(30);
    setRunwayProgress(-0.38);
    setLocalAltM(390);
    setLocalSpeedKmh(aircraft.vApproachKmh * 1.25);
    setFlightPhase('APPROACH');
  };

  const handleSelectCamera = (id: CameraId) => {
    setActiveCam(id);
    const meta = CAMERAS.find((c) => c.id === id);
    setCamPan(meta?.basePan ?? 0);
    setCamTilt(id === 'CAM8_EXTERNA' ? 11 : 0);
  };

  const downloadBlackbox = async () => {
    const res = await fetch(`${API_URL}/api/blackbox`);
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${aircraft.name}-${currentRegion.code}-${Date.now()}.json`;
    a.click();
  };

  const hdg = flightPhase === 'CRUISE' && data ? data.heading : 265;
  const roll = flightPhase === 'CRUISE' && data && autopilotEngaged ? data.roll : localRollDeg;

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
      {/* CAPA 1: VISOR 3D 4K A PANTALLA COMPLETA */}
      <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <FlightSim3DViewport
          camId={activeCam}
          aircraft={aircraft}
          region={currentRegion}
          airport={currentAirport}
          weather={weatherPreset}
          simAltM={Math.round(localAltM)}
          simSpeedKmh={Math.round(localSpeedKmh)}
          simPitchDeg={Number(localPitchDeg.toFixed(1))}
          simRollDeg={Number(roll.toFixed(1))}
          simHeadingDeg={hdg}
          runwayProgress={runwayProgress}
          gearDown={gearDown}
          flapsDeg={flapsDeg}
          trimPct={trimPct}
          panOffset={camPan}
          tiltOffset={camTilt}
        />
      </div>

      {/* CAPA 2: CONSOLA SUPERIOR CENTRAL (TAKEOFF, LANDING, AUTOPILOT, FLAPS, GEAR) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5">
        <div className="bg-slate-950/88 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 py-2 shadow-2xl flex items-center gap-2">
          <button
            onClick={triggerTakeoff}
            className={`px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wider flex flex-col items-center gap-1 cursor-pointer transition ${
              flightPhase === 'TAKEOFF_ROLL' || flightPhase === 'CLIMB'
                ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-zinc-100'
            }`}
          >
            <span className="w-6 h-1 rounded-full bg-cyan-400" />
            <span>TAKEOFF</span>
          </button>

          <button
            onClick={triggerLandingAtAirport}
            className={`px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wider flex flex-col items-center gap-1 cursor-pointer transition ${
              flightPhase === 'APPROACH' || flightPhase === 'LANDING_FLARE'
                ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-zinc-100'
            }`}
          >
            <span className="w-6 h-1 rounded-full bg-cyan-400" />
            <span>LANDING</span>
          </button>

          <button
            onClick={() => setAutopilotEngaged(!autopilotEngaged)}
            className={`px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wider flex flex-col items-center gap-1 cursor-pointer transition ${
              autopilotEngaged
                ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'bg-amber-500/90 border-amber-300 text-black'
            }`}
          >
            <span className={`w-6 h-1 rounded-full ${autopilotEngaged ? 'bg-cyan-400' : 'bg-black'}`} />
            <span>{autopilotEngaged ? 'AUTOPILOT' : 'MANUAL'}</span>
          </button>

          <button
            onClick={() => setFlapsDeg((f) => (f === 0 ? 10 : f === 10 ? 30 : 0))}
            className="px-3.5 py-2 rounded-lg border bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-zinc-100 text-xs font-bold tracking-wider flex flex-col items-center gap-0.5 cursor-pointer"
          >
            <span className="w-6 h-1 rounded-full bg-cyan-400" />
            <span>FLAPS</span>
            <span className="text-[10px] font-mono text-cyan-300">{flapsDeg}°</span>
          </button>

          <button
            onClick={() => setGearDown(!gearDown)}
            className={`px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wider flex flex-col items-center gap-0.5 cursor-pointer ${
              gearDown
                ? 'bg-slate-900/90 border-amber-400/70 text-zinc-100'
                : 'bg-slate-900/90 border-slate-700 text-zinc-300'
            }`}
          >
            <span className={`w-6 h-1 rounded-full ${gearDown ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span>GEAR</span>
            <span className="text-[10px] font-mono text-amber-300">{gearDown ? 'DOWN' : 'UP'}</span>
          </button>
        </div>

        {/* Barra secundaria: Región de Chile + Selector de Aeronave + Clima 4K */}
        <div className="bg-black/75 backdrop-blur-sm border border-slate-800 px-3 py-1 rounded-full flex items-center gap-3 text-[10px] font-mono">
          <span className="text-amber-300 font-bold">{currentRegion.code} • {currentRegion.name}</span>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1">
            {(Object.keys(AIRCRAFT_MODELS) as AircraftId[]).map((id) => (
              <button
                key={id}
                onClick={() => setSelectedAircraft(id)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  selectedAircraft === id ? 'bg-cyan-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {AIRCRAFT_MODELS[id].name}
              </button>
            ))}
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeatherPreset('GOLDEN_HOUR')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${weatherPreset === 'GOLDEN_HOUR' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400'}`}
            >
              Atardecer
            </button>
            <button
              onClick={() => setWeatherPreset('CLEAR_DAY')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${weatherPreset === 'CLEAR_DAY' ? 'bg-sky-500 text-black font-bold' : 'text-zinc-400'}`}
            >
              Día 4K
            </button>
            <button
              onClick={() => setWeatherPreset('OVERCAST_ANDES')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${weatherPreset === 'OVERCAST_ANDES' ? 'bg-slate-400 text-black font-bold' : 'text-zinc-400'}`}
            >
              Andes
            </button>
          </div>
        </div>
      </div>

      {/* CAPA 3: TARJETAS DE AEROPUERTOS SUPERIOR DERECHA (SCAR, SCEL, SCCI + MÁS) */}
      <div className="absolute top-3 right-3 z-30 flex flex-col items-end gap-1.5">
        <div className="bg-slate-950/88 backdrop-blur-md border border-slate-700/80 rounded-xl p-1.5 shadow-2xl flex items-center gap-1.5">
          {['SCAR', 'SCEL', 'SCCI'].map((icao) => {
            const ap = CHILE_AIRPORTS.find((a) => a.icao === icao)!;
            const active = selectedAirportIcao === icao;
            return (
              <button
                key={icao}
                onClick={() => handleSelectAirport(icao)}
                className={`px-3 py-1.5 rounded-lg border text-left transition cursor-pointer ${
                  active
                    ? 'bg-cyan-950/90 border-cyan-400 text-white shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700/80 text-zinc-300'
                }`}
              >
                <div className="text-xs font-bold font-mono tracking-wide">{ap.icao}</div>
                <div className="text-[10px] text-zinc-400">{ap.name}</div>
              </button>
            );
          })}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'MAP' ? 'NONE' : 'MAP')}
            className={`px-2.5 py-2 rounded-lg border text-xs font-bold font-mono cursor-pointer ${
              activeDrawer === 'MAP'
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-cyan-300'
            }`}
            title="Ver Mapa de Chile y todos los aeropuertos"
          >
            MAPA
          </button>
        </div>

        {/* Selector compacto de cámaras 360° */}
        <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-800 rounded-lg px-2 py-1 flex items-center gap-1">
          {CAMERAS.slice(0, 5).map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelectCamera(c.id)}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded cursor-pointer ${
                activeCam === c.id ? 'bg-cyan-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {c.short}
            </button>
          ))}
        </div>
      </div>

      {/* CAPA 4: BARRAS DE HIDRÓGENO Y BATERÍA ENCIMA DEL ALTÍMETRO (DERECHA) */}
      <div className="absolute right-4 bottom-40 z-30 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-lg p-2 w-44 font-mono text-[10px] space-y-1.5 shadow-xl">
        <div>
          <div className="flex justify-between text-zinc-200 font-bold mb-0.5">
            <span>HYDROGEN FUEL:</span>
            <span className="text-emerald-400">76%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: '76%' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-zinc-200 font-bold mb-0.5">
            <span>BATT:</span>
            <span className="text-cyan-400">{data?.battery_soc ?? 92}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-cyan-400" style={{ width: `${data?.battery_soc ?? 92}%` }} />
          </div>
        </div>
      </div>

      {/* CAPA 5: CONSOLA INFERIOR DE SUBSISTEMAS (COMMS, SENSORS, PAYLOAD, SYSTEMS) + RELOJ ZULU */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
        <div className="bg-slate-950/88 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-2 shadow-2xl flex items-center gap-2">
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'MAP' ? 'NONE' : 'MAP')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'MAP'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-200'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-cyan-400" /> COMMS / MAPA
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'SENSORS' ? 'NONE' : 'SENSORS')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'SENSORS'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" /> SENSORS
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'PAYLOAD' ? 'NONE' : 'PAYLOAD')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'PAYLOAD'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-200'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-cyan-400" /> PAYLOAD
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'SYSTEMS' ? 'NONE' : 'SYSTEMS')}
            className={`px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wider flex items-center gap-1.5 cursor-pointer ${
              activeDrawer === 'SYSTEMS'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-zinc-200'
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

      {/* PANEL DESPLEGABLE FLOTANTE PARA MAPA REGIONAL DE CHILE, SENSORES, PAYLOAD O SISTEMAS */}
      {activeDrawer !== 'NONE' && (
        <div className="drawer-panel absolute bottom-20 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-2xl bg-slate-950/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-black/80 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 font-mono">
              {activeDrawer === 'MAP' && `MAPA REGIONAL DE CHILE // ${currentRegion.name}`}
              {activeDrawer === 'SENSORS' && 'MATRIZ DE CÁMARAS Y SENSORES ÓPTICOS / FLIR'}
              {activeDrawer === 'PAYLOAD' && `PROPULSIÓN HIDRÓGENO Y CARGA ÚTIL // ${aircraft.name}`}
              {activeDrawer === 'SYSTEMS' && 'BITÁCORA DE VUELO, CAJA NEGRA Y SEGURIDAD FAILSAFE'}
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
                  onClick={() => setAutoFollowMap(!autoFollowMap)}
                  className="text-[10px] px-2 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 cursor-pointer"
                >
                  {autoFollowMap ? 'AUTO-REGIÓN: ON' : 'MAPA LIBRE'}
                </button>
              </div>
              <div ref={mapContainerRef} className="w-full h-56 rounded-xl overflow-hidden border border-slate-800" />
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                {CHILE_AIRPORTS.map((ap) => (
                  <button
                    key={ap.icao}
                    onClick={() => handleSelectAirport(ap.icao)}
                    className={`p-1.5 rounded text-left font-mono text-[10px] border cursor-pointer ${
                      ap.icao === selectedAirportIcao
                        ? 'bg-cyan-950 border-cyan-400 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-zinc-400'
                    }`}
                  >
                    <div>{ap.icao}</div>
                    <div className="truncate text-[9px]">{ap.city}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeDrawer === 'SENSORS' && (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          )}

          {activeDrawer === 'PAYLOAD' && (
            <div className="p-4 grid grid-cols-3 gap-3 text-xs font-mono">
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
                [OK] Región activa: {currentRegion.name} • Aeropuerto destino: {currentAirport.icao} ({currentAirport.rwyLabel} • ILS {currentAirport.ilsFreq})
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}