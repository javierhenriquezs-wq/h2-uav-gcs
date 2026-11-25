import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Flame, Navigation,
  RotateCcw, AlertTriangle, Camera, Download, Cpu,
  Hand, Plane, Grid, CheckCircle2, Power, ArrowUpCircle, ArrowDownCircle,
  Layers, Compass, LayoutGrid, GripVertical, Maximize2, Minimize2, PlaneLanding, PlaneTakeoff
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
type CameraId =
  | 'CAM8_EXTERNA'
  | 'CAM1_PROA'
  | 'CAM2_GIMBAL'
  | 'CAM3_NADIR'
  | 'CAM4_FLIR'
  | 'CAM5_ALA_IZQ'
  | 'CAM6_ALA_DER'
  | 'CAM7_VTAIL'
  | 'MULTI_7';

type FlightPhase = 'PARKED' | 'TAKEOFF_ROLL' | 'CLIMB' | 'CRUISE' | 'APPROACH' | 'LANDING_FLARE' | 'LANDED';
type PanelId = 'CAMERAS' | 'MAP' | 'FLIGHT_OPS' | 'PROPULSION' | 'AI_SAFETY' | 'BLACKBOX';
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
  return CHILE_REGIONS.find((r) => lat <= r.latMax && lat >= r.latMin) || CHILE_REGIONS[0];
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
}

const CHILE_AIRPORTS: AirportSpec[] = [
  { icao: 'SCAR', name: 'Chacalluta Intl', city: 'Arica', regionCode: 'XV', lat: -18.3485, lon: -70.3387, rwyHeading: 20, rwyLabel: 'RWY 02/20' },
  { icao: 'SCDA', name: 'Diego Aracena', city: 'Iquique', regionCode: 'I', lat: -20.5352, lon: -70.1813, rwyHeading: 190, rwyLabel: 'RWY 19/01' },
  { icao: 'SCFA', name: 'Andrés Sabella', city: 'Antofagasta', regionCode: 'II', lat: -23.4445, lon: -70.4451, rwyHeading: 190, rwyLabel: 'RWY 19/01' },
  { icao: 'SCEL', name: 'Arturo Merino Benítez', city: 'Santiago', regionCode: 'RM', lat: -33.3930, lon: -70.7858, rwyHeading: 170, rwyLabel: 'RWY 17L/35R' },
  { icao: 'SCIE', name: 'Carriel Sur', city: 'Concepción', regionCode: 'VIII', lat: -36.7727, lon: -73.0631, rwyHeading: 20, rwyLabel: 'RWY 02/20' },
  { icao: 'SCTE', name: 'El Tepual', city: 'Puerto Montt', regionCode: 'X', lat: -41.4389, lon: -73.0940, rwyHeading: 170, rwyLabel: 'RWY 17/35' },
  { icao: 'SCCI', name: 'Carlos Ibáñez del Campo', city: 'Punta Arenas', regionCode: 'XII', lat: -53.0026, lon: -70.8546, rwyHeading: 250, rwyLabel: 'RWY 25/07' },
];

interface AircraftSpec {
  id: AircraftId;
  name: string;
  role: string;
  maxSpeedKmh: number;
  vRotateKmh: number;
  vApproachKmh: number;
  cruiseMach: string;
  ceilingM: number;
  speedMultiplier: number;
  altMultiplier: number;
  propulsionLabel: string;
  fuelLabel: string;
  accentColor: string;
  bodyColor: number;
  svgPath: string;
}

const AIRCRAFT_MODELS: Record<AircraftId, AircraftSpec> = {
  H2_VALKYRIE: {
    id: 'H2_VALKYRIE',
    name: 'H2-VALKYRIE',
    role: 'UAV Autónomo Hidrógeno PEM',
    maxSpeedKmh: 260,
    vRotateKmh: 115,
    vApproachKmh: 105,
    cruiseMach: 'Mach 0.22',
    ceilingM: 12000,
    speedMultiplier: 1.0,
    altMultiplier: 1.0,
    propulsionLabel: 'PROPULSIÓN HIDRÓGENO (PEM 700 BAR)',
    fuelLabel: 'PRESIÓN TANQUE H2',
    accentColor: '#0ea5e9',
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
    ceilingM: 25900,
    speedMultiplier: 13.8,
    altMultiplier: 4.5,
    propulsionLabel: '2x PRATT & WHITNEY J58 TURBORAMJET',
    fuelLabel: 'COMBUSTIBLE JP-7 / POSTQUEMADOR',
    accentColor: '#f59e0b',
    bodyColor: 0x09090b,
    svgPath: 'M12 1L13.5 8L16 11L21 18L16 18L15 22L14 19L12 21L10 19L9 22L8 18L3 18L8 11L10.5 8L12 1Z',
  },
  F_35: {
    id: 'F_35',
    name: 'F-35A LIGHTNING II',
    role: 'Caza Furtivo Polivalente 5ª Gen',
    maxSpeedKmh: 1960,
    vRotateKmh: 280,
    vApproachKmh: 250,
    cruiseMach: 'Mach 1.6',
    ceilingM: 15240,
    speedMultiplier: 7.6,
    altMultiplier: 2.6,
    propulsionLabel: 'PRATT & WHITNEY F135-PW-100',
    fuelLabel: 'COMBUSTIBLE INTERNO JP-8',
    accentColor: '#38bdf8',
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
    ceilingM: 19812,
    speedMultiplier: 9.4,
    altMultiplier: 3.4,
    propulsionLabel: '2x F119-PW-100 EMPUJE VECTORIAL 2D',
    fuelLabel: 'COMBUSTIBLE SUPERCRUCERO',
    accentColor: '#10b981',
    bodyColor: 0x475569,
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
  { id: 'CAM8_EXTERNA', short: '1. PERSECUCIÓN', label: 'CAM 01 // VISTA EXTERNA MSFS 360°', sensor: 'CHASE CAM 360°', basePan: 18 },
  { id: 'CAM1_PROA', short: '2. PROA HUD', label: 'CAM 02 // PROA 360° HUD', sensor: '4K 360° WIDE', basePan: 0 },
  { id: 'CAM2_GIMBAL', short: '3. GIMBAL EO', label: 'CAM 03 // TORRETA EO 360°', sensor: '30X OPT 360°', basePan: 0 },
  { id: 'CAM3_NADIR', short: '4. NADIR', label: 'CAM 04 // CENITAL NADIR 360°', sensor: 'ORTOFOTO LIVE', basePan: 0 },
  { id: 'CAM4_FLIR', short: '5. FLIR IR', label: 'CAM 05 // TÉRMICA LWIR 360°', sensor: 'FLIR 360° IR', basePan: 0 },
  { id: 'CAM5_ALA_IZQ', short: '6. ALA IZQ', label: 'CAM 06 // ENCASTRE ALA BABOR 360°', sensor: 'WING-L 360°', basePan: -75 },
  { id: 'CAM6_ALA_DER', short: '7. ALA DER', label: 'CAM 07 // ENCASTRE ALA ESTRIBOR 360°', sensor: 'WING-R 360°', basePan: 75 },
  { id: 'CAM7_VTAIL', short: '8. COLA V', label: 'CAM 08 // EMPENAJE DORSAL 360°', sensor: 'TAIL-CAM 360°', basePan: 180 },
];

const DEFAULT_PANEL_ORDER: PanelId[] = ['MAP', 'CAMERAS', 'AI_SAFETY', 'FLIGHT_OPS', 'PROPULSION', 'BLACKBOX'];
const DEFAULT_PANEL_SPANS: Record<PanelId, 1 | 2> = {
  MAP: 1,
  CAMERAS: 2,
  AI_SAFETY: 1,
  FLIGHT_OPS: 2,
  PROPULSION: 1,
  BLACKBOX: 1,
};

function buildDetailedAircraftMesh(spec: AircraftSpec, gearDown: boolean): THREE.Group {
  const root = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: spec.bodyColor,
    roughness: spec.id === 'SR_71' ? 0.4 : 0.25,
    metalness: 0.78,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.accentColor),
    roughness: 0.3,
    metalness: 0.5,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0x1e293b,
    emissiveIntensity: 0.3,
    roughness: 0.1,
    metalness: 0.95,
  });

  if (spec.id === 'H2_VALKYRIE') {
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.32, 7.8, 24), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    root.add(fuselage);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.34, 4.2, 24), stripeMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(0, 0.02, 0.2);
    root.add(stripe);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 16), hullMat);
    nose.scale.set(1, 0.85, 2.2);
    nose.position.set(0, -0.04, -4.1);
    root.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 14), canopyMat);
    canopy.scale.set(0.95, 0.72, 2.3);
    canopy.position.set(0, 0.34, -1.9);
    root.add(canopy);

    // Alas invertidas con winglets
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 1.15), hullMat);
    wingL.position.set(-3.6, 0.06, -0.35);
    wingL.rotation.y = -0.22;
    const wingletL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.75), stripeMat);
    wingletL.position.set(-7.1, 0.45, -1.1);
    wingletL.rotation.z = 0.25;

    const wingR = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 1.15), hullMat);
    wingR.position.set(3.6, 0.06, -0.35);
    wingR.rotation.y = 0.22;
    const wingletR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.75), stripeMat);
    wingletR.position.set(7.1, 0.45, -1.1);
    wingletR.rotation.z = -0.25;
    root.add(wingL, wingletL, wingR, wingletR);

    // Doble V-Tail
    const vL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.95, 0.95), hullMat);
    vL.position.set(-0.78, 0.75, 3.3);
    vL.rotation.z = 0.52;
    const vR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.95, 0.95), hullMat);
    vR.position.set(0.78, 0.75, 3.3);
    vR.rotation.z = -0.52;
    root.add(vL, vR);
  } else if (spec.id === 'SR_71') {
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 11.4, 20), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    root.add(fuselage);

    const chine = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.08, 9.8), hullMat);
    chine.position.set(0, 0, -0.4);
    root.add(chine);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 2.9, 20), hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -7.0);
    root.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), canopyMat);
    canopy.scale.set(0.85, 0.65, 2.4);
    canopy.position.set(0, 0.36, -3.5);
    root.add(canopy);

    const deltaWing = new THREE.Mesh(new THREE.ConeGeometry(4.6, 7.2, 3), hullMat);
    deltaWing.rotation.x = -Math.PI / 2;
    deltaWing.scale.set(1.25, 1, 0.04);
    deltaWing.position.set(0, -0.02, 1.4);
    root.add(deltaWing);

    [-2.1, 2.1].forEach((nx) => {
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.44, 5.4, 20), hullMat);
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(nx, 0.05, 1.2);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 16), stripeMat);
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

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.54, 18, 14), canopyMat);
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

  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  navRed.position.set(-5.2, 0.08, 0.1);
  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  navGreen.position.set(5.2, 0.08, 0.1);
  root.add(navRed, navGreen);

  if (gearDown) {
    const strutMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.2 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9 });

    [
      [0, -0.75, -2.8],
      [-1.15, -0.75, 0.8],
      [1.15, -0.75, 0.8],
    ].forEach(([gx, gy, gz]) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 8), strutMat);
      strut.position.set(gx, gy + 0.3, gz);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 14), tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(gx, gy - 0.12, gz);
      root.add(strut, wheel);
    });
  }

  return root;
}

function createRunwayTexture(rwyLabel: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 512, 2048);

  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)';
    ctx.fillRect(Math.random() * 512, Math.random() * 2048, 2, 2);
  }

  ctx.fillStyle = '#e4e4e7';
  ctx.fillRect(28, 0, 10, 2048);
  ctx.fillRect(474, 0, 10, 2048);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  for (let y = 1860; y <= 1980; y += 55) {
    ctx.beginPath();
    ctx.moveTo(120, y + 35);
    ctx.lineTo(256, y);
    ctx.lineTo(392, y + 35);
    ctx.stroke();
  }

  ctx.fillStyle = '#f4f4f5';
  for (let x = 64; x <= 424; x += 48) {
    if (Math.abs(x - 246) < 28) continue;
    ctx.fillRect(x, 1690, 24, 130);
    ctx.fillRect(x, 180, 24, 130);
  }

  ctx.save();
  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 46px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(rwyLabel.replace('RWY ', '').split('/')[0], 256, 1620);
  ctx.restore();

  ctx.fillStyle = 'rgba(9, 9, 11, 0.72)';
  ctx.fillRect(150, 1320, 75, 320);
  ctx.fillRect(287, 1320, 75, 320);

  for (let y = 340; y < 1560; y += 90) {
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(250, y, 12, 52);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

function createRegionalTerrainTexture(region: ChileRegionInfo, isFlir: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isFlir ? '#27272a' : region.groundCss;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 2 + Math.random() * 14;
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

  // Lagos / Fiordos / Salares según la región de Chile
  if (region.biome === 'PATAGONIA_FJORDS' || region.biome === 'SOUTHERN_LAKES') {
    ctx.fillStyle = isFlir ? '#18181b' : '#0c4a6e';
    for (let l = 0; l < 6; l++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * 512, Math.random() * 512, 48 + Math.random() * 60, 18 + Math.random() * 24, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  return tex;
}

// Dibuja los instrumentos estilo Microsoft Flight Simulator en las 4 esquinas del visor
function drawMsfsInstruments(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: {
    heading: number;
    course: number;
    speedKt: number;
    altFt: number;
    vsFpm: number;
    throttlePct: number;
    fuelPct: number;
    aoaDeg: number;
    gearDown: boolean;
    pitchDeg: number;
  }
) {
  const { heading, course, speedKt, altFt, vsFpm, throttlePct, fuelPct, aoaDeg, gearDown, pitchDeg } = params;

  // 1. SUPERIOR IZQUIERDA: BRÚJULA CIRCULAR GIRATORIA (HSI / COMPASS ROSE)
  const cx = 66;
  const cy = 68;
  const r = 46;

  ctx.save();
  ctx.fillStyle = 'rgba(9, 13, 22, 0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Caja digital HDG superior
  ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
  ctx.fillRect(cx - 24, cy - r - 18, 48, 16);
  ctx.strokeStyle = '#38bdf8';
  ctx.strokeRect(cx - 24, cy - r - 18, 48, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(heading)}°`, cx, cy - r - 6);

  // Etiquetas HDG y CRS
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`HDG ${Math.round(heading)}°`, cx - 44, cy - r - 6);
  ctx.fillStyle = '#e879f9';
  ctx.fillText(`CRS ${Math.round(course)}°`, cx + 44, cy - r - 6);

  // Disco giratorio con rumbos
  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);

  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const inner = isMajor ? r - 9 : r - 5;
    ctx.strokeStyle = deg === 0 ? '#ef4444' : 'rgba(255,255,255,0.75)';
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.sin(rad) * inner, -Math.cos(rad) * inner);
    ctx.lineTo(Math.sin(rad) * r, -Math.cos(rad) * r);
    ctx.stroke();

    if (isMajor) {
      ctx.save();
      ctx.translate(Math.sin(rad) * (r - 17), -Math.cos(rad) * (r - 17));
      ctx.rotate(rad);
      ctx.fillStyle = deg === 0 ? '#f87171' : '#f8fafc';
      ctx.font = 'bold 9px sans-serif';
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : `${deg / 10}`;
      ctx.fillText(label, 0, 3);
      ctx.restore();
    }
  }

  // Aguja de curso magenta
  const crsRad = (course * Math.PI) / 180;
  ctx.rotate(crsRad);
  ctx.strokeStyle = '#e879f9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -r + 6);
  ctx.lineTo(0, r - 6);
  ctx.stroke();
  ctx.restore();

  // Avión central fijo en brújula
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.stroke();

  // 2. INFERIOR IZQUIERDA: CINTA AIRSPEED + ENGINE % + FUEL + AOA
  const blX = 12;
  const blY = h - 122;

  // Cinta vertical de Airspeed (Nudos KT)
  ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
  ctx.fillRect(blX, blY, 54, 110);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(blX, blY, 54, 110);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AIRSPEED', blX + 27, blY + 10);

  ctx.save();
  ctx.beginPath();
  ctx.rect(blX, blY + 14, 54, 82);
  ctx.clip();

  const baseSpd = Math.floor(speedKt / 10) * 10;
  for (let s = baseSpd - 30; s <= baseSpd + 30; s += 10) {
    if (s < 0) continue;
    const yOffset = blY + 55 - (s - speedKt) * 1.4;
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(blX + 42, yOffset);
    ctx.lineTo(blX + 54, yOffset);
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${s}`, blX + 39, yOffset + 3);
  }
  ctx.restore();

  // Ventana central negra de velocidad actual
  ctx.fillStyle = '#000000';
  ctx.fillRect(blX + 2, blY + 45, 46, 20);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(blX + 2, blY + 45, 46, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(speedKt)}`, blX + 25, blY + 59);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '8px monospace';
  ctx.fillText(`KT`, blX + 27, blY + 105);

  // Reloj circular ENGINE %
  const engX = blX + 60;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
  ctx.fillRect(engX, blY + 18, 66, 92);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(engX, blY + 18, 66, 92);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('ENGINE', engX + 33, blY + 29);

  const dialCx = engX + 33;
  const dialCy = blY + 62;
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(dialCx, dialCy, 22, Math.PI * 0.75, Math.PI * 0.75 + (Math.PI * 1.5 * Math.min(100, throttlePct)) / 100);
  ctx.stroke();

  const needleAng = Math.PI * 0.75 + (Math.PI * 1.5 * Math.min(100, throttlePct)) / 100;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dialCx, dialCy);
  ctx.lineTo(dialCx + Math.cos(needleAng) * 20, dialCy + Math.sin(needleAng) * 20);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${Math.round(throttlePct)}%`, dialCx, blY + 102);

  // Barra vertical FUEL
  const fuelX = engX + 70;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
  ctx.fillRect(fuelX, blY + 18, 34, 92);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(fuelX, blY + 18, 34, 92);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('FUEL', fuelX + 17, blY + 29);

  const barH = 54;
  const fillH = (barH * Math.max(0, Math.min(100, fuelPct))) / 100;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(fuelX + 12, blY + 35, 10, barH);
  ctx.fillStyle = fuelPct > 25 ? '#22c55e' : '#ef4444';
  ctx.fillRect(fuelX + 12, blY + 35 + (barH - fillH), 10, fillH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px monospace';
  ctx.fillText(`${Math.round(fuelPct)}%`, fuelX + 17, blY + 102);

  // Barra AOA
  const aoaX = fuelX + 38;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
  ctx.fillRect(aoaX, blY + 18, 32, 92);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(aoaX, blY + 18, 32, 92);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('AOA', aoaX + 16, blY + 29);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${aoaDeg.toFixed(1)}°`, aoaX + 16, blY + 68);

  // 3. INFERIOR DERECHA: FLAPS / GEAR + ALTITUDE + VS
  const brX = w - 144;
  const brY = h - 122;

  // Caja FLAPS / GEAR
  ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
  ctx.fillRect(brX, brY + 18, 52, 92);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(brX, brY + 18, 52, 92);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('GEAR/FLP', brX + 26, brY + 29);

  ctx.fillStyle = gearDown ? '#f59e0b' : '#22c55e';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(gearDown ? 'DN' : 'UP', brX + 26, brY + 55);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(gearDown ? 'FLP 15°' : 'FLP 0°', brX + 26, brY + 82);

  // Cinta vertical ALTITUDE (Pies FT) + VS
  const altX = brX + 56;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
  ctx.fillRect(altX, brY, 76, 110);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.strokeRect(altX, brY, 76, 110);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('ALTITUDE', altX + 28, brY + 10);
  ctx.fillText('VS', altX + 64, brY + 10);

  ctx.save();
  ctx.beginPath();
  ctx.rect(altX, brY + 14, 54, 82);
  ctx.clip();

  const baseAlt = Math.floor(altFt / 100) * 100;
  for (let a = baseAlt - 300; a <= baseAlt + 300; a += 100) {
    if (a < 0) continue;
    const yOffset = brY + 55 - (a - altFt) * 0.14;
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(altX, yOffset);
    ctx.lineTo(altX + 8, yOffset);
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${a}`, altX + 11, yOffset + 3);
  }
  ctx.restore();

  // Ventana negra de altitud actual
  ctx.fillStyle = '#000000';
  ctx.fillRect(altX + 4, brY + 45, 50, 20);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(altX + 4, brY + 45, 50, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(altFt)}`, altX + 29, brY + 59);

  // Columna VS (Variómetro)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '8px monospace';
  ctx.fillText(`${Math.round(vsFpm)}`, altX + 64, brY + 58);
  ctx.fillText('29.92 IN', altX + 38, brY + 105);
}

// Visor 3D Flight Simulator con cambio dinámico por cada Región de Chile
function FlightSim3DViewport({
  camId,
  aircraft,
  region,
  airport,
  flightPhase,
  simAltM,
  simSpeedKmh,
  simPitchDeg,
  simRollDeg,
  simHeadingDeg,
  runwayProgress,
  gearDown,
  panOffset,
  tiltOffset,
  compact = false,
}: {
  camId: CameraId;
  aircraft: AircraftSpec;
  region: ChileRegionInfo;
  airport: AirportSpec;
  flightPhase: FlightPhase;
  simAltM: number;
  simSpeedKmh: number;
  simPitchDeg: number;
  simRollDeg: number;
  simHeadingDeg: number;
  runwayProgress: number;
  gearDown: boolean;
  panOffset: number;
  tiltOffset: number;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    camId,
    aircraft,
    region,
    airport,
    flightPhase,
    simAltM,
    simSpeedKmh,
    simPitchDeg,
    simRollDeg,
    simHeadingDeg,
    runwayProgress,
    gearDown,
    panOffset,
    tiltOffset,
    compact,
  });
  stateRef.current = {
    camId,
    aircraft,
    region,
    airport,
    flightPhase,
    simAltM,
    simSpeedKmh,
    simPitchDeg,
    simRollDeg,
    simHeadingDeg,
    runwayProgress,
    gearDown,
    panOffset,
    tiltOffset,
    compact,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(region.fogHex, 0.00044);

    const camera = new THREE.PerspectiveCamera(
      camId === 'CAM2_GIMBAL' ? 30 : 60,
      (container.clientWidth || 640) / (container.clientHeight || 400),
      0.2,
      3800
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 400);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xfff3d6, 0x1e293b, 0.95);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffcf87, 2.4);
    sunLight.position.set(-550, 240, -900);
    scene.add(sunLight);

    // Cúpula celeste atardecer dorado estilo MSFS
    const skyGeo = new THREE.SphereGeometry(2800, 32, 20);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 32;
    skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d')!;
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    sGrad.addColorStop(0.0, '#091936');
    sGrad.addColorStop(0.32, '#2d4f80');
    sGrad.addColorStop(0.46, '#f59e0b');
    sGrad.addColorStop(0.51, '#fef08a');
    sGrad.addColorStop(1.0, '#1e293b');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 32, 256);
    const skyDome = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(skyCanvas), side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);

    // Disco solar en el horizonte oeste
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(68, 24),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3, fog: false })
    );
    sunDisc.position.set(-620, 95, -2100);
    sunDisc.lookAt(0, 0, 0);
    scene.add(sunDisc);

    // Nubes iluminadas por el atardecer
    const cloudsGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xc2410c,
      emissiveIntensity: 0.25,
      roughness: 0.95,
      transparent: true,
      opacity: 0.78,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1, 1);
    for (let i = 0; i < 42; i++) {
      const cluster = new THREE.Group();
      for (let p = 0; p < 4; p++) {
        const mesh = new THREE.Mesh(puffGeo, cloudMat);
        mesh.scale.set(32 + Math.random() * 38, 8 + Math.random() * 9, 24 + Math.random() * 28);
        mesh.position.set((p - 1.5) * 26, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 20);
        cluster.add(mesh);
      }
      cluster.position.set((Math.random() - 0.5) * 2400, 175 + Math.random() * 145, (Math.random() - 0.5) * 2400);
      cloudsGroup.add(cluster);
    }
    scene.add(cloudsGroup);

    // Terreno 3D regional: Costa del Pacífico a la izquierda, valle central, Cordillera de los Andes a la derecha/fondo
    const terrainGeo = new THREE.PlaneGeometry(3400, 3400, 130, 130);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    const colors: number[] = [];
    const baseCol = new THREE.Color(region.groundHex);
    const ridgeCol = new THREE.Color(region.ridgeHex);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const corridorMask = THREE.MathUtils.smoothstep(Math.abs(x), 75, 260);

      // Si la región tiene costa, hacia el oeste (x < -380) desciende al Océano Pacífico
      const isSea = region.hasCoastSea && x < -420;
      const ridgeNoise =
        Math.sin(x * 0.012) * Math.cos(z * 0.012) * 34 +
        Math.sin(x * 0.032 + z * 0.025) * 14;

      const andesBack = z < -620 || x > 550 ? Math.pow(Math.max(0, (-z - 620) / 1050, (x - 550) / 1100), 1.5) * 260 : 0;
      const andesPeaks =
        andesBack > 10 ? Math.abs(Math.sin(x * 0.0085 + z * 0.006)) * 120 : 0;

      const height = isSea
        ? -4
        : Math.max(0, corridorMask * (Math.max(0, ridgeNoise) + 12)) + andesBack + andesPeaks;
      posAttr.setY(i, height);

      if (isSea) {
        colors.push(0.05, 0.22, 0.38);
      } else if (region.hasSnowPeaks && height > 210) {
        colors.push(0.95, 0.96, 0.99);
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
        roughness: 0.9,
      })
    );
    scene.add(terrainMesh);

    // Pista de aterrizaje 3D + Torre de control + Luces PAPI
    const runwayGroup = new THREE.Group();
    const runwayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 820),
      new THREE.MeshStandardMaterial({ map: createRunwayTexture(airport.rwyLabel), roughness: 0.78 })
    );
    runwayMesh.rotation.x = -Math.PI / 2;
    runwayMesh.position.set(0, 0.25, -260);
    runwayGroup.add(runwayMesh);

    const edgeLightGeo = new THREE.SphereGeometry(0.7, 8, 8);
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

    const aircraftModel = buildDetailedAircraftMesh(aircraft, gearDown);
    scene.add(aircraftModel);

    const afterburnerMat = new THREE.MeshBasicMaterial({
      color: aircraft.id === 'H2_VALKYRIE' ? 0x38bdf8 : aircraft.id === 'SR_71' ? 0xf59e0b : 0x60a5fa,
      transparent: true,
      opacity: 0.82,
    });
    const afterburner = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.8, 16), afterburnerMat);
    afterburner.rotation.x = Math.PI / 2;
    afterburner.position.set(0, 0, 5.2);
    aircraftModel.add(afterburner);

    let animId: number;
    let cruiseScroll = 0;

    const animate = () => {
      const st = stateRef.current;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 400;
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
        cruiseScroll += (st.simSpeedKmh / 3600) * 24;
        terrainMesh.position.z = cruiseScroll % 200;
        aircraftModel.position.set(0, 105 + Math.min(240, st.simAltM * 0.025), 0);
      }

      aircraftModel.rotation.set(pitchRad, 0, -rollRad);
      afterburner.visible = st.simSpeedKmh > 40;
      afterburner.scale.setScalar(0.7 + Math.min(1.4, st.simSpeedKmh / 1200) + Math.random() * 0.12);

      cloudsGroup.children.forEach((c) => {
        c.position.z += 0.25;
        if (c.position.z > 1200) c.position.z = -1200;
      });

      const isFlir = st.camId === 'CAM4_FLIR';
      scene.fog = new THREE.FogExp2(isFlir ? 0x18181b : st.region.fogHex, isFlir ? 0.00075 : 0.00044);
      skyDome.visible = !isFlir;
      sunDisc.visible = !isFlir;
      renderer.setClearColor(isFlir ? 0x09090b : st.region.fogHex);

      camera.fov = st.camId === 'CAM2_GIMBAL' ? 28 : 60;
      camera.updateProjectionMatrix();

      const panRad = (-st.panOffset * Math.PI) / 180;
      const tiltRad = (st.tiltOffset * Math.PI) / 180;

      if (st.camId === 'CAM8_EXTERNA') {
        aircraftModel.visible = true;
        const dist = st.aircraft.id === 'SR_71' ? 15.5 : 12.5;
        const camX = aircraftModel.position.x + Math.sin(panRad) * Math.cos(tiltRad) * dist;
        const camY = aircraftModel.position.y + 2.1 + Math.sin(tiltRad) * dist;
        const camZ = aircraftModel.position.z + Math.cos(panRad) * Math.cos(tiltRad) * dist;
        camera.position.set(camX, Math.max(1.2, camY), camZ);
        camera.lookAt(aircraftModel.position.clone().add(new THREE.Vector3(0, 0.3, -1.5)));
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

      // Dibujar instrumentos MSFS en las 4 esquinas
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

        if (!st.compact) {
          drawMsfsInstruments(hCtx, w, h, {
            heading: (st.simHeadingDeg + st.panOffset + 360) % 360,
            course: st.airport.rwyHeading,
            speedKt: st.simSpeedKmh * 0.539957,
            altFt: st.simAltM * 3.28084,
            vsFpm: st.simPitchDeg * 140,
            throttlePct: st.simSpeedKmh > 0 ? Math.min(100, 35 + (st.simSpeedKmh / st.aircraft.maxSpeedKmh) * 65) : 0,
            fuelPct: 84,
            aoaDeg: st.simPitchDeg,
            gearDown: st.gearDown,
            pitchDeg: st.simPitchDeg,
          });
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
  }, [camId, aircraft, region, airport, gearDown]);

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
  const [recording, setRecording] = useState(false);

  const [selectedAircraft, setSelectedAircraft] = useState<AircraftId>('H2_VALKYRIE');
  const [selectedAirportIcao, setSelectedAirportIcao] = useState<string>('SCAR');
  const [mapLayerId, setMapLayerId] = useState<MapLayerId>('SATELLITE');
  const [autoFollowMap, setAutoFollowMap] = useState<boolean>(true);

  const [flightPhase, setFlightPhase] = useState<FlightPhase>('PARKED');
  const [runwayProgress, setRunwayProgress] = useState<number>(0.02);
  const [localAltM, setLocalAltM] = useState<number>(0);
  const [localSpeedKmh, setLocalSpeedKmh] = useState<number>(0);
  const [localPitchDeg, setLocalPitchDeg] = useState<number>(0);

  const [editLayoutMode, setEditLayoutMode] = useState<boolean>(false);
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(() => {
    try {
      const saved = localStorage.getItem('gcs_panel_order_v1');
      return saved ? JSON.parse(saved) : DEFAULT_PANEL_ORDER;
    } catch {
      return DEFAULT_PANEL_ORDER;
    }
  });
  const [panelSpans, setPanelSpans] = useState<Record<PanelId, 1 | 2>>(() => {
    try {
      const saved = localStorage.getItem('gcs_panel_spans_v1');
      return saved ? JSON.parse(saved) : DEFAULT_PANEL_SPANS;
    } catch {
      return DEFAULT_PANEL_SPANS;
    }
  });
  const draggedPanelRef = useRef<PanelId | null>(null);

  const [camPan, setCamPan] = useState(18);
  const [camTilt, setCamTilt] = useState(10);
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
  const currentAirport = CHILE_AIRPORTS.find((a) => a.icao === selectedAirportIcao) || CHILE_AIRPORTS[0];

  // Latitud y Región de Chile dinámica según el desplazamiento en el mapa
  const activeLat = flightPhase === 'CRUISE' && data ? data.lat : currentAirport.lat;
  const activeLon = flightPhase === 'CRUISE' && data ? data.lon : currentAirport.lon;
  const currentRegion = getRegionByLat(activeLat);

  const sendCmd = (payload: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  useEffect(() => {
    localStorage.setItem('gcs_panel_order_v1', JSON.stringify(panelOrder));
  }, [panelOrder]);

  useEffect(() => {
    localStorage.setItem('gcs_panel_spans_v1', JSON.stringify(panelSpans));
  }, [panelSpans]);

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

  // Bucle físico de despegue y aterrizaje
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
            const nextAlt = alt + 18 * aircraft.altMultiplier;
            setRunwayProgress((p) => Math.min(1.5, p + 0.015));
            setLocalSpeedKmh((s) => Math.min(aircraft.maxSpeedKmh * 0.82, s + 14 * aircraft.speedMultiplier));
            if (nextAlt > 180) setGearDown(false);
            if (nextAlt >= 1200) {
              setLocalPitchDeg(2);
              setFlightPhase('CRUISE');
            }
            return nextAlt;
          });
        } else if (phase === 'CRUISE') {
          setLocalAltM((data?.alt ?? 1200) * aircraft.altMultiplier || 1200);
          setLocalSpeedKmh((data?.speed ?? 230) * aircraft.speedMultiplier || aircraft.maxSpeedKmh * 0.8);
          setLocalPitchDeg(data?.pitch ?? 0);
        } else if (phase === 'APPROACH') {
          setGearDown(true);
          setLocalPitchDeg(-3.5);
          setLocalSpeedKmh((s) => Math.max(aircraft.vApproachKmh, s * 0.96));
          setLocalAltM((alt) => {
            const nextAlt = Math.max(12, alt - 16);
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
  }, [aircraft, data, localSpeedKmh]);

  const handleSelectAirport = (icao: string) => {
    setSelectedAirportIcao(icao);
    const ap = CHILE_AIRPORTS.find((a) => a.icao === icao);
    if (!ap) return;
    mapRef.current?.flyTo([ap.lat, ap.lon], 11, { duration: 1.2 });
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
      setFlightPhase('PARKED');
    }
  };

  const triggerTakeoff = () => {
    setPreflightChecked(true);
    setH2CellIgnited(true);
    setGearDown(true);
    setRunwayProgress(0.02);
    setLocalAltM(0);
    setLocalSpeedKmh(25);
    setLocalPitchDeg(0);
    setFlightPhase('TAKEOFF_ROLL');
    sendCmd({ action: 'START_MISSION' });
  };

  const triggerLandingAtAirport = () => {
    setGearDown(true);
    setRunwayProgress(-0.38);
    setLocalAltM(390);
    setLocalSpeedKmh(aircraft.vApproachKmh * 1.25);
    setFlightPhase('APPROACH');
    mapRef.current?.flyTo([currentAirport.lat, currentAirport.lon], 12, { duration: 1.2 });
  };

  const handleSelectCamera = (id: CameraId) => {
    setActiveCam(id);
    const meta = CAMERAS.find((c) => c.id === id);
    setCamPan(meta?.basePan ?? 0);
    setCamTilt(id === 'CAM8_EXTERNA' ? 10 : 0);
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [currentAirport.lat, currentAirport.lon],
      zoom: 9,
      zoomControl: true,
    });

    const initialLayer = MAP_LAYERS[mapLayerId];
    tileLayerRef.current = L.tileLayer(initialLayer.url, {
      attribution: initialLayer.attribution,
      maxZoom: initialLayer.maxZoom,
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
    tileLayerRef.current.setUrl(MAP_LAYERS[mapLayerId].url);
  }, [mapLayerId]);

  // Actualizar mapa automáticamente a medida que la aeronave avanza por cada región de Chile
  useEffect(() => {
    if (!mapRef.current) return;
    const hdg = flightPhase === 'CRUISE' && data ? data.heading : currentAirport.rwyHeading;

    const planeIcon = L.divIcon({
      className: 'custom-uav-icon',
      html: `<div style="transform: rotate(${hdg}deg); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 6px ${aircraft.accentColor});">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="${aircraft.accentColor}" stroke="#000000" stroke-width="1.6">
          <path d="${aircraft.svgPath}"/>
        </svg>
      </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    if (!planeMarkerRef.current) {
      planeMarkerRef.current = L.marker([activeLat, activeLon], { icon: planeIcon }).addTo(mapRef.current);
    } else {
      planeMarkerRef.current.setLatLng([activeLat, activeLon]);
      planeMarkerRef.current.setIcon(planeIcon);
    }

    if (autoFollowMap && flightPhase === 'CRUISE') {
      mapRef.current.panTo([activeLat, activeLon], { animate: true, duration: 0.8 });
    }

    if (data?.waypoints) {
      routeLineRef.current?.setLatLngs(data.waypoints.map((w) => [w.lat, w.lon] as [number, number]));
      trailLineRef.current?.setLatLngs(data.trail);
    }

    wpLayerRef.current?.clearLayers();
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
  }, [data, aircraft, activeLat, activeLon, flightPhase, selectedAirportIcao, autoFollowMap]);

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

  const handleDropPanel = (targetId: PanelId) => {
    const sourceId = draggedPanelRef.current;
    if (!sourceId || sourceId === targetId) return;
    setPanelOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(sourceId);
      const toIdx = next.indexOf(targetId);
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, sourceId);
      return next;
    });
    draggedPanelRef.current = null;
  };

  const togglePanelSpan = (id: PanelId) => {
    setPanelSpans((prev) => ({ ...prev, [id]: prev[id] === 1 ? 2 : 1 }));
  };

  const resetLayout = () => {
    setPanelOrder(DEFAULT_PANEL_ORDER);
    setPanelSpans(DEFAULT_PANEL_SPANS);
  };

  const renderCameraViewport = (camId: CameraId, compact = false) => {
    const camMeta = CAMERAS.find((c) => c.id === camId) || CAMERAS[0];
    const hdg = flightPhase === 'CRUISE' && data ? data.heading : currentAirport.rwyHeading;
    const roll = flightPhase === 'CRUISE' && data ? data.roll : 0;

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
          region={currentRegion}
          airport={currentAirport}
          flightPhase={flightPhase}
          simAltM={Math.round(localAltM)}
          simSpeedKmh={Math.round(localSpeedKmh)}
          simPitchDeg={Number(localPitchDeg.toFixed(1))}
          simRollDeg={roll}
          simHeadingDeg={hdg}
          runwayProgress={runwayProgress}
          gearDown={gearDown}
          panOffset={compact ? camMeta.basePan : camPan}
          tiltOffset={compact ? 0 : camTilt}
          compact={compact}
        />

        {!compact ? (
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-black/75 border border-zinc-700/80 px-3 py-1 rounded-full text-[11px] font-mono text-amber-300 shadow">
            {currentRegion.code} • {currentRegion.name} ({flightPhase})
          </div>
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

  const renderModule = (panelId: PanelId) => {
    const spanClass = panelSpans[panelId] === 2 ? 'lg:col-span-2' : 'lg:col-span-1';

    const wrapWithFrame = (title: string, content: React.ReactNode) => (
      <div
        key={panelId}
        draggable={editLayoutMode}
        onDragStart={() => {
          draggedPanelRef.current = panelId;
        }}
        onDragOver={(e) => {
          if (editLayoutMode) e.preventDefault();
        }}
        onDrop={() => handleDropPanel(panelId)}
        className={`${spanClass} bg-zinc-950 border ${
          editLayoutMode ? 'border-amber-400/80 ring-1 ring-amber-400/40' : 'border-zinc-800'
        } rounded-xl overflow-hidden flex flex-col transition-all`}
      >
        {editLayoutMode && (
          <div className="bg-amber-500/20 border-b border-amber-500/40 px-3 py-1 flex items-center justify-between text-[11px] font-bold text-amber-300 cursor-move">
            <span className="flex items-center gap-1.5">
              <GripVertical className="w-4 h-4" /> ARRASTRAR: {title}
            </span>
            <button
              onClick={() => togglePanelSpan(panelId)}
              className="bg-black/80 hover:bg-black text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer"
            >
              {panelSpans[panelId] === 2 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              {panelSpans[panelId] === 2 ? '1 Columna' : '2 Columnas'}
            </button>
          </div>
        )}
        {content}
      </div>
    );

    if (panelId === 'CAMERAS') {
      return wrapWithFrame(
        'SIMULADOR FLIGHT SIMULATOR 3D',
        <>
          <div className="px-3 py-2 bg-black border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <Camera className="w-4 h-4" /> VISOR FLIGHT SIMULATOR 3D (8 CÁMARAS 360°)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const cam = CAMERAS.find((c) => c.id === activeCam);
                  setCamPan(cam?.basePan ?? 0);
                  setCamTilt(activeCam === 'CAM8_EXTERNA' ? 10 : 0);
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-1 cursor-pointer"
              >
                <Compass className="w-3 h-3 text-cyan-400" /> 0°
              </button>
              <button
                onClick={() => setActiveCam('MULTI_7')}
                className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer ${
                  activeCam === 'MULTI_7' ? 'bg-cyan-600 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                <Grid className="w-3 h-3" /> MOSAICO
              </button>
              <button
                onClick={() => setRecording(!recording)}
                className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${recording ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}
              >
                {recording ? '● REC' : 'REC'}
              </button>
            </div>
          </div>

          <div className="px-2 py-1.5 bg-black border-b border-zinc-800 grid grid-cols-4 sm:grid-cols-5 gap-1">
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

          <div className="relative flex-1 min-h-[390px] bg-black">
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
                <div className="bg-zinc-950 border border-zinc-800 rounded p-2 flex flex-col justify-center text-[10px] font-mono text-zinc-300">
                  <div className="text-cyan-400 font-bold">{aircraft.name}</div>
                  <div>{currentRegion.name}</div>
                </div>
              </div>
            ) : (
              renderCameraViewport(activeCam, false)
            )}
          </div>
        </>
      );
    }

    if (panelId === 'MAP') {
      return wrapWithFrame(
        'MAPA REGIONAL DE CHILE',
        <>
          <div className="px-3 py-2 bg-black border-b border-zinc-800 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
              <Navigation className="w-4 h-4" /> {currentRegion.code} • {currentRegion.capital.toUpperCase()}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAutoFollowMap(!autoFollowMap)}
                className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer ${
                  autoFollowMap ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                {autoFollowMap ? 'AUTO-REGIÓN' : 'LIBRE'}
              </button>
              <div className="flex items-center gap-0.5 bg-zinc-950 p-0.5 rounded border border-zinc-800">
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
            </div>
          </div>

          <div ref={mapContainerRef} className="w-full h-64 z-10" />

          <div className="p-2.5 bg-black border-t border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-400">REGIÓN ACTUAL:</span>
              <span className="text-amber-300 font-bold">{currentRegion.name}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
              {CHILE_AIRPORTS.map((ap) => (
                <button
                  key={ap.icao}
                  onClick={() => handleSelectAirport(ap.icao)}
                  className={`text-left px-2 py-1 rounded text-[10px] font-mono border cursor-pointer transition ${
                    ap.icao === selectedAirportIcao
                      ? 'bg-cyan-950/70 border-cyan-400 text-cyan-200 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-white font-bold">{ap.icao}</div>
                  <div className="truncate">{ap.city}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      );
    }

    if (panelId === 'FLIGHT_OPS') {
      return wrapWithFrame(
        'PROCEDIMIENTO DESPEGUE Y ATERRIZAJE',
        <div className="p-3 bg-black space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-cyan-400">
              OPERACIONES // {currentAirport.icao} - {currentAirport.name} ({currentAirport.rwyLabel})
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              gearDown ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
            }`}>
              TREN: {gearDown ? 'EXTENDIDO (DOWN)' : 'RETRAÍDO (UP)'}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5 text-xs">
            <button
              onClick={() => setPreflightChecked(true)}
              className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 border cursor-pointer ${
                preflightChecked ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300' : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>1. Check</span>
            </button>

            <button
              onClick={() => {
                setPreflightChecked(true);
                setH2CellIgnited(true);
              }}
              className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 border cursor-pointer ${
                h2CellIgnited ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300' : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700'
              }`}
            >
              <Power className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>2. Ignición</span>
            </button>

            <button
              onClick={triggerTakeoff}
              className="py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              <PlaneTakeoff className="w-4 h-4 shrink-0" />
              <span>3. Despegar</span>
            </button>

            <button
              onClick={triggerLandingAtAirport}
              className="py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
            >
              <PlaneLanding className="w-4 h-4 shrink-0" />
              <span>4. Aterrizar</span>
            </button>

            <button
              onClick={() => setGearDown(!gearDown)}
              className={`py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1 border cursor-pointer ${
                gearDown ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400' : 'bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border-emerald-500/40'
              }`}
            >
              {gearDown ? <ArrowUpCircle className="w-4 h-4 shrink-0" /> : <ArrowDownCircle className="w-4 h-4 shrink-0" />}
              <span>{gearDown ? 'Subir Tren' : 'Bajar Tren'}</span>
            </button>
          </div>
        </div>
      );
    }

    if (panelId === 'PROPULSION') {
      return wrapWithFrame(
        'PROPULSIÓN Y TELEMETRÍA',
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold flex items-center gap-1.5" style={{ color: aircraft.accentColor }}>
              <Flame className="w-4 h-4" /> {aircraft.propulsionLabel}
            </h2>
            <span className="text-[11px] font-mono text-emerald-400">{aircraft.cruiseMach}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-black p-2 rounded-lg border border-zinc-800">
              <div className="text-zinc-400 text-[10px]">{aircraft.fuelLabel}</div>
              <div className="text-sm font-bold font-mono text-cyan-300">
                {selectedAircraft === 'H2_VALKYRIE' ? `${data?.h2_pressure_bar ?? 700} bar` : '96 %'}
              </div>
            </div>
            <div className="bg-black p-2 rounded-lg border border-zinc-800">
              <div className="text-zinc-400 text-[10px]">VEL. ROTACIÓN / APROX.</div>
              <div className="text-sm font-bold font-mono text-emerald-400">
                {aircraft.vRotateKmh} / {aircraft.vApproachKmh} km/h
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (panelId === 'AI_SAFETY') {
      return wrapWithFrame(
        'COPILOTO IA Y SEGURIDAD',
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
              <Cpu className="w-4 h-4" /> COPILOTO IA (ASESOR)
            </h2>
            <span className="text-[9px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded">SIN AUTORIDAD</span>
          </div>
          <p className="text-xs text-zinc-300 bg-black p-2 rounded-lg border border-zinc-800">
            Sobrevolando <strong>{currentRegion.name}</strong> ({activeLat.toFixed(2)}°, {activeLon.toFixed(2)}°). Bioma 3D: <strong>{currentRegion.biome}</strong>.
          </p>
          <div className="grid grid-cols-1 gap-1.5 text-xs">
            <button
              onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'COMMS_LOSS' })}
              className="bg-black hover:bg-red-950/50 border border-zinc-800 hover:border-red-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
            >
              1. Simular Pérdida de Comunicaciones
            </button>
            <button
              onClick={() => handleSelectAirport(selectedAirportIcao)}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-cyan-300 flex items-center justify-center gap-1.5 py-1.5 rounded cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reposicionar en Cabecera {currentAirport.icao}
            </button>
          </div>
        </div>
      );
    }

    return wrapWithFrame(
      'BITÁCORA Y CAJA NEGRA',
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> BITÁCORA Y CAJA NEGRA
          </h2>
          <button
            onClick={downloadBlackbox}
            className="text-[10px] bg-black hover:bg-zinc-900 border border-zinc-800 text-cyan-400 px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" /> JSON
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 max-h-40 pr-1 text-[11px]">
          <div className="p-2 rounded border bg-black border-zinc-800 text-zinc-300">
            [REGIÓN {currentRegion.code}] {currentRegion.name} • Pista {currentAirport.icao} ({currentAirport.rwyLabel})
          </div>
          {data?.alerts.map((al, i) => (
            <div key={i} className="p-2 rounded border bg-black border-zinc-800 text-zinc-300">
              <span className="font-bold mr-1">[{al.level}]</span>
              {al.msg}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-zinc-200 flex flex-col">
      <header className="bg-black border-b border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-zinc-950 border border-cyan-500/40 flex items-center justify-center">
            <Plane className="w-5 h-5" style={{ color: aircraft.accentColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold tracking-wider text-sm text-white">GCS // {aircraft.name}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                {connected ? 'TELEMETRÍA LIVE' : 'SIMULACIÓN LOCAL'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">{currentRegion.name} • <span className="text-cyan-400 font-mono">{currentAirport.icao} ({currentAirport.city})</span></p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          {(Object.keys(AIRCRAFT_MODELS) as AircraftId[]).map((id) => {
            const m = AIRCRAFT_MODELS[id];
            const active = selectedAircraft === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedAircraft(id)}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                  active ? 'bg-zinc-800 text-white border border-zinc-600' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                style={active ? { borderColor: m.accentColor, color: m.accentColor } : undefined}
              >
                {m.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditLayoutMode(!editLayoutMode)}
            className={`font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 border cursor-pointer transition ${
              editLayoutMode
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border-zinc-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            {editLayoutMode ? 'Guardar Diseño' : 'Personalizar Interfaz'}
          </button>

          {editLayoutMode && (
            <button
              onClick={resetLayout}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs px-2.5 py-2 rounded-lg text-zinc-300 cursor-pointer"
            >
              Restaurar Orden
            </button>
          )}

          {data?.mode !== 'STANDBY' && (
            <button
              onClick={() => sendCmd({ action: 'SET_MODE', mode: isHumanControl ? 'AUTONOMOUS' : 'ASSISTED' })}
              className={`font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer ${
                isHumanControl ? 'bg-cyan-600 text-white' : 'bg-zinc-900 border border-zinc-700 text-amber-400'
              }`}
            >
              <Hand className="w-4 h-4" />
              {isHumanControl ? 'AUTO' : 'MANUAL'}
            </button>
          )}

          <button
            onClick={() => sendCmd({ action: 'SET_MODE', mode: 'FAILSAFE' })}
            className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" /> FAILSAFE
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 p-3 bg-black items-start">
        {panelOrder.map((panelId) => renderModule(panelId))}
      </main>
    </div>
  );
}