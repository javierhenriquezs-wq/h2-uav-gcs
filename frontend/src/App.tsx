import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Flame, Navigation,
  Play, Pause, RotateCcw, AlertTriangle, Camera, Download, Cpu,
  Hand, Plane, Sliders, Grid, CheckCircle2, Power, ArrowUpCircle, ArrowDownCircle, Layers, Compass
} from 'lucide-react';
import L from 'leaflet';

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
  fuelUnit: string;
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
    fuelUnit: 'bar',
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
    fuelUnit: '%',
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
    fuelUnit: '%',
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
    fuelUnit: '%',
    accentColor: '#10b981',
    svgPath: 'M12 1.5L14.2 7.5L22 13.5L21 15.5L14.5 15L17 20.5L13.5 21L12 18.5L10.5 21L7 20.5L9.5 15L3 15.5L2 13.5L9.8 7.5L12 1.5Z',
  },
};

const MAP_LAYERS: Record<MapLayerId, { label: string; url: string; attribution: string; maxZoom: number }> = {
  SATELLITE: {
    label: 'Satélite HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
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

// Motor gráfico de paisaje y estructura anclada con rotación esférica 360°
function TerrainCanvas({
  camId,
  aircraft,
  data,
  gearDown,
  panOffset,
  tiltOffset,
  compact = false,
}: {
  camId: CameraId;
  aircraft: AircraftSpec;
  data: Telemetry | null;
  gearDown: boolean;
  panOffset: number;
  tiltOffset: number;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    let scrollDist = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = (canvas.width = canvas.clientWidth || 320);
      const h = (canvas.height = canvas.clientHeight || 200);

      const lat = data?.lat ?? -18.35;
      const effAlt = Math.round((data?.alt ?? 0) * aircraft.altMultiplier);
      const effSpeed = Math.round((data?.speed ?? 0) * aircraft.speedMultiplier);
      const roll = ((data?.roll ?? 0) * Math.PI) / 180;
      const pitch = (data?.pitch ?? 0) + tiltOffset * 0.45;
      const baseHeading = (data?.heading ?? 180) + panOffset;
      const headingRad = (baseHeading * Math.PI) / 180;

      scrollDist += Math.max(0.5, effSpeed / 80);

      // Bioma dinámico según latitud chilena
      const isNorth = lat > -29;
      const isSouth = lat < -41;
      const isFlir = camId === 'CAM4_FLIR';
      const isHighAlt = effAlt > 16000; // Estratósfera para SR-71 / F-22

      let skyTop = '#020617';
      let skyHorizon = '#1e3a8a';
      let groundNear = '#78350f';
      let groundFar = '#b45309';
      let mountainColor = '#451a03';
      let snowColor = '#e2e8f0';

      if (isFlir) {
        skyTop = '#050505';
        skyHorizon = '#1c1c1c';
        groundNear = '#52525b';
        groundFar = '#27272a';
        mountainColor = '#a1a1aa';
        snowColor = '#ffffff';
      } else if (isNorth) {
        skyTop = isHighAlt ? '#000000' : '#03132b';
        skyHorizon = isHighAlt ? '#0284c7' : '#38bdf8';
        groundNear = '#92400e';
        groundFar = '#d97706';
        mountainColor = '#7c2d12';
        snowColor = '#fef3c7';
      } else if (isSouth) {
        skyTop = isHighAlt ? '#000000' : '#090d16';
        skyHorizon = '#64748b';
        groundNear = '#064e3b';
        groundFar = '#0f766e';
        mountainColor = '#1e293b';
        snowColor = '#f8fafc';
      } else {
        skyTop = isHighAlt ? '#000000' : '#041736';
        skyHorizon = '#0284c7';
        groundNear = '#14532d';
        groundFar = '#3f6212';
        mountainColor = '#334155';
        snowColor = '#f1f5f9';
      }

      ctx.clearRect(0, 0, w, h);

      // VISTA CENITAL / NADIR (-90° mirando al terreno)
      if (camId === 'CAM3_NADIR') {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-headingRad);

        const diag = Math.hypot(w, h) * 1.5;
        ctx.fillStyle = groundNear;
        ctx.fillRect(-diag / 2, -diag / 2, diag, diag);

        // Costa del Pacífico y Cordillera de los Andes
        ctx.fillStyle = isFlir ? '#18181b' : '#0369a1';
        ctx.fillRect(-diag / 2, -diag / 2, diag * 0.35, diag);

        const tileStep = 46;
        const shiftY = (scrollDist * 1.8) % tileStep;
        for (let y = -diag / 2 - tileStep; y < diag / 2 + tileStep; y += tileStep) {
          for (let x = -diag * 0.1; x < diag / 2; x += tileStep) {
            const ridge = Math.sin((x + y) * 0.05) * 12;
            ctx.fillStyle = mountainColor;
            ctx.beginPath();
            ctx.moveTo(x, y + shiftY);
            ctx.lineTo(x + 22, y + shiftY - 18 - ridge);
            ctx.lineTo(x + 44, y + shiftY);
            ctx.closePath();
            ctx.fill();

            if (!isNorth) {
              ctx.fillStyle = snowColor;
              ctx.beginPath();
              ctx.moveTo(x + 15, y + shiftY - 12 - ridge * 0.7);
              ctx.lineTo(x + 22, y + shiftY - 18 - ridge);
              ctx.lineTo(x + 29, y + shiftY - 12 - ridge * 0.7);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.2)' : 'rgba(56,189,248,0.25)';
        ctx.lineWidth = 1;
        for (let g = -diag / 2; g < diag / 2; g += 38) {
          ctx.beginPath();
          ctx.moveTo(g, -diag / 2);
          ctx.lineTo(g, diag / 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-diag / 2, g + shiftY);
          ctx.lineTo(diag / 2, g + shiftY);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // VISTAS EN PERSPECTIVA CON GIRO ESFÉRICO 360°
        let viewRoll = -roll;
        const viewPitchOffset = pitch * (compact ? 1.6 : 3.2);
        if (camId === 'CAM5_ALA_IZQ') viewRoll = (pitch * Math.PI) / 180 - 0.18;
        if (camId === 'CAM6_ALA_DER') viewRoll = (-pitch * Math.PI) / 180 + 0.18;
        if (camId === 'CAM7_VTAIL') viewRoll = roll * 0.85;

        ctx.save();
        ctx.translate(w / 2, h / 2 + viewPitchOffset);
        ctx.rotate(viewRoll);

        const big = Math.hypot(w, h) * 1.9;

        const skyGrad = ctx.createLinearGradient(0, -big / 2, 0, 0);
        skyGrad.addColorStop(0, skyTop);
        skyGrad.addColorStop(1, skyHorizon);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(-big / 2, -big / 2, big, big / 2);

        const groundGrad = ctx.createLinearGradient(0, 0, 0, big / 2);
        groundGrad.addColorStop(0, groundFar);
        groundGrad.addColorStop(1, groundNear);
        ctx.fillStyle = groundGrad;
        ctx.fillRect(-big / 2, 0, big, big / 2);

        // Océano Pacífico desplazándose con el giro 360°
        const normalizedAzimuth = ((baseHeading % 360) + 360) % 360;
        if (normalizedAzimuth > 160 && normalizedAzimuth < 350) {
          ctx.fillStyle = isFlir ? '#18181b' : '#0284c7';
          ctx.fillRect(-big / 2, 0, big * 0.55, big * 0.11);
        }

        // Cordillera de los Andes con panorámica 360°
        const peakCount = 18;
        const peakStep = big / peakCount;
        const panPixels = ((normalizedAzimuth * 4) % peakStep);
        for (let i = -2; i < peakCount + 2; i++) {
          const px = -big / 2 + i * peakStep - panPixels;
          const peakH = (compact ? 16 : 34) + Math.sin((i + Math.floor(normalizedAzimuth / 20)) * 1.7) * (compact ? 7 : 15);
          ctx.fillStyle = mountainColor;
          ctx.beginPath();
          ctx.moveTo(px - peakStep * 0.65, 0);
          ctx.lineTo(px, -peakH);
          ctx.lineTo(px + peakStep * 0.65, 0);
          ctx.closePath();
          ctx.fill();

          if (!isNorth || peakH > 26) {
            ctx.fillStyle = snowColor;
            ctx.beginPath();
            ctx.moveTo(px - peakStep * 0.24, -peakH * 0.55);
            ctx.lineTo(px, -peakH);
            ctx.lineTo(px + peakStep * 0.24, -peakH * 0.55);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Pista de Arica en tierra (altitud < 150m)
        if ((data?.alt ?? 0) < 150 && (camId === 'CAM1_PROA' || camId === 'CAM2_GIMBAL')) {
          ctx.fillStyle = '#09090b';
          ctx.beginPath();
          ctx.moveTo(-18, 2);
          ctx.lineTo(18, 2);
          ctx.lineTo(105, big / 2);
          ctx.lineTo(-105, big / 2);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#facc15';
          ctx.setLineDash([12, 10]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 6);
          ctx.lineTo(0, big / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.13)';
          ctx.lineWidth = 1;
          for (let r = 1; r <= 6; r++) {
            const yPos = Math.pow(((r * 35 + scrollDist * 2.4) % 210) / 210, 1.8) * (big * 0.42);
            ctx.beginPath();
            ctx.moveTo(-big / 2, yPos);
            ctx.lineTo(big / 2, yPos);
            ctx.stroke();
          }
        }

        ctx.strokeStyle = isFlir ? '#ffffff' : '#34d399';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-big / 2, 0);
        ctx.lineTo(big / 2, 0);
        ctx.stroke();

        ctx.restore();
      }

      // ESTRUCTURAS ANCLADAS AL FUSELAJE SEGÚN EL MODELO DE AVIÓN SELECCIONADO
      const strokeAccent = aircraft.accentColor;
      if (camId === 'CAM1_PROA') {
        // Cúpula / nariz del avión anclada en la parte inferior
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(w / 2, h + 14, w * 0.22, 26, 0, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
      } else if (camId === 'CAM5_ALA_IZQ') {
        // Anclada en el encastre izquierdo mirando hacia la punta del ala
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(w * 0.86, h * 0.34);
        ctx.lineTo(w * 0.93, h * 0.42);
        ctx.lineTo(w * 0.25, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Wingtip / Misil / Pod según modelo
        if (aircraft.id === 'F_35' || aircraft.id === 'F_22') {
          ctx.strokeStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(w * 0.82, h * 0.36);
          ctx.lineTo(w * 0.96, h * 0.28);
          ctx.stroke();
        }
      } else if (camId === 'CAM6_ALA_DER') {
        // Anclada en el encastre derecho mirando hacia la punta del ala
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w, h);
        ctx.lineTo(w * 0.14, h * 0.34);
        ctx.lineTo(w * 0.07, h * 0.42);
        ctx.lineTo(w * 0.75, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (aircraft.id === 'F_35' || aircraft.id === 'F_22') {
          ctx.strokeStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(w * 0.18, h * 0.36);
          ctx.lineTo(w * 0.04, h * 0.28);
          ctx.stroke();
        }
      } else if (camId === 'CAM7_VTAIL') {
        // Anclada en el lomo dorsal mirando hacia atrás entre las derivas dobles
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.5;
        const cantOut = aircraft.id === 'SR_71' ? -12 : 18; // SR-71 tiene derivas inclinadas hacia adentro
        // Deriva izquierda
        ctx.beginPath();
        ctx.moveTo(w * 0.43, h);
        ctx.lineTo(w * 0.32 - cantOut, h * 0.25);
        ctx.lineTo(w * 0.39 - cantOut, h * 0.25);
        ctx.lineTo(w * 0.49, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Deriva derecha
        ctx.beginPath();
        ctx.moveTo(w * 0.57, h);
        ctx.lineTo(w * 0.68 + cantOut, h * 0.25);
        ctx.lineTo(w * 0.61 + cantOut, h * 0.25);
        ctx.lineTo(w * 0.51, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Postquemadores / Toberas en aviones supersónicos
        if (aircraft.id !== 'H2_VALKYRIE' && effSpeed > 300) {
          ctx.fillStyle = aircraft.id === 'SR_71' ? 'rgba(245, 158, 11, 0.7)' : 'rgba(56, 189, 248, 0.75)';
          ctx.beginPath();
          ctx.arc(w * 0.44, h * 0.88, compact ? 5 : 9, 0, Math.PI * 2);
          ctx.arc(w * 0.56, h * 0.88, compact ? 5 : 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // BRÚJULA AZIMUTAL SUPERIOR 360°
      if (!compact) {
        const az = Math.round(((baseHeading % 360) + 360) % 360);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(w * 0.28, 6, w * 0.44, 18);
        ctx.strokeStyle = '#3f3f46';
        ctx.strokeRect(w * 0.28, 6, w * 0.44, 18);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`360° GIMBAL // AZ: ${az}° | TILT: ${Math.round(tiltOffset)}°`, w / 2, 18);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [camId, aircraft, data, gearDown, panOffset, tiltOffset, compact]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}

export default function App() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeCam, setActiveCam] = useState<CameraId>('CAM1_PROA');
  const [recording, setRecording] = useState(false);

  // Selector de modelo de aeronave y capa de mapa de alta resolución
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftId>('H2_VALKYRIE');
  const [mapLayerId, setMapLayerId] = useState<MapLayerId>('SATELLITE');

  // Rotación esférica 360° interactiva de las cámaras
  const [camPan, setCamPan] = useState(0);
  const [camTilt, setCamTilt] = useState(0);
  const isDraggingCam = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Botonera de procedimiento de despegue y tren de aterrizaje
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

      // Flechas para girar la cámara 360°
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

  // Inicializar mapa HD
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

  // Cambiar capa del mapa HD en caliente
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    const nextLayer = MAP_LAYERS[mapLayerId];
    tileLayerRef.current.setUrl(nextLayer.url);
  }, [mapLayerId]);

  // Actualizar icono del modelo de avión seleccionado en el mapa
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
        <TerrainCanvas
          camId={camId}
          aircraft={aircraft}
          data={data}
          gearDown={gearDown}
          panOffset={compact ? camMeta.basePan : camPan}
          tiltOffset={compact ? 0 : camTilt}
          compact={compact}
        />

        {/* Retícula central */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {camId === 'CAM2_GIMBAL' || camId === 'CAM4_FLIR' ? (
            <div className={`${compact ? 'w-12 h-12' : 'w-28 h-28'} border border-cyan-400/70 relative flex items-center justify-center`}>
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <div className="absolute -top-2 left-1/2 w-0.5 h-2 bg-cyan-400" />
              <div className="absolute -bottom-2 left-1/2 w-0.5 h-2 bg-cyan-400" />
              <div className="absolute -left-2 top-1/2 w-2 h-0.5 bg-cyan-400" />
              <div className="absolute -right-2 top-1/2 w-2 h-0.5 bg-cyan-400" />
            </div>
          ) : (
            <div className={`${compact ? 'w-12 h-12' : 'w-28 h-28'} border border-emerald-400/45 rounded-full flex items-center justify-center`}>
              <div className="w-2.5 h-2.5 border-2 border-amber-400 rounded-full" />
            </div>
          )}
        </div>

        {/* Telemetría superpuesta */}
        {!compact ? (
          <>
            <div className="absolute top-7 left-3 text-[11px] font-mono text-emerald-400 space-y-0.5 bg-black/80 border border-zinc-800 px-2 py-1 rounded">
              <div>SPD: {effSpeed} KM/H (M {machVal})</div>
              <div>ALT: {effAlt} M</div>
              <div>V/S: {Math.round((data?.vspeed ?? 0) * aircraft.altMultiplier)} M/S</div>
            </div>
            <div className="absolute top-7 right-3 text-[11px] font-mono text-emerald-400 text-right space-y-0.5 bg-black/80 border border-zinc-800 px-2 py-1 rounded">
              <div>HDG: {data?.heading ?? 0}°</div>
              <div>PIT: {data?.pitch ?? 0}° | ROL: {data?.roll ?? 0}°</div>
              <div>GEAR: <span className={gearDown ? 'text-amber-400' : 'text-emerald-400'}>{gearDown ? 'DOWN' : 'UP'}</span></div>
            </div>
            <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] font-mono text-zinc-200 bg-black/85 border border-zinc-800 px-2 py-1 rounded">
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
        {/* COLUMNA IZQUIERDA: SIMULADOR 7 CÁMARAS 360° + BOTONERA DE DESPEGUE Y TREN */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-black border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Camera className="w-4 h-4" /> SIMULADOR ÓPTICO 360° (7 CÁMARAS)
              </div>
              <div className="flex items-center gap-1">
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

            <div className="relative h-64 bg-black">
              {activeCam === 'MULTI_7' ? (
                <div className="w-full h-full grid grid-cols-3 grid-rows-3 gap-1 p-1 bg-black">
                  {CAMERAS.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCamera(c.id)}
                      className="cursor-pointer border border-zinc-800 hover:border-cyan-400 rounded overflow-hidden"
                    >
                      {renderCameraViewport(c.id, true)}
                    </div>
                  ))}
                  <div className="col-span-2 bg-zinc-950 border border-zinc-800 rounded p-2 flex flex-col justify-center text-[10px] font-mono text-zinc-300">
                    <div className="text-cyan-400 font-bold">{aircraft.name} // {aircraft.cruiseMach}</div>
                    <div>TECHO: {aircraft.ceilingM}m | MAX: {aircraft.maxSpeedKmh}km/h</div>
                    <div className="text-zinc-500">Clic en cámara o teclas 1–7 (Flechas = 360°)</div>
                  </div>
                </div>
              ) : (
                renderCameraViewport(activeCam, false)
              )}
            </div>

            {/* BOTONERA COMPLETA DE PROCESO DE DESPEGUE, PRE-FLIGHT CHECK Y TREN DE ATERRIZAJE */}
            <div className="p-3 bg-black border-t border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-400 tracking-wide">PROCEDIMIENTO DE DESPEGUE Y TREN</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  gearDown ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                }`}>
                  TREN: {gearDown ? 'EXTENDIDO (DOWN)' : 'RETRAÍDO (UP)'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1 text-[9px] font-mono text-center">
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

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  onClick={() => setPreflightChecked(true)}
                  className={`py-2 px-2.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 border cursor-pointer transition ${
                    preflightChecked
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  1. Check Pre-Vuelo
                </button>

                <button
                  disabled={!preflightChecked}
                  onClick={() => setH2CellIgnited(true)}
                  className={`py-2 px-2.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 border cursor-pointer transition disabled:opacity-40 ${
                    h2CellIgnited
                      ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <Power className="w-4 h-4 text-cyan-400" />
                  2. Ignición Planta
                </button>

                <button
                  disabled={!preflightChecked || !h2CellIgnited}
                  onClick={() => sendCmd({ action: 'START_MISSION' })}
                  className="py-2 px-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border disabled:border-zinc-800 text-white cursor-pointer transition"
                >
                  <Play className="w-4 h-4" />
                  3. Iniciar Despegue
                </button>

                <button
                  onClick={() => setGearDown(!gearDown)}
                  className={`py-2 px-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 border cursor-pointer transition ${
                    gearDown
                      ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {gearDown ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                  {gearDown ? '4. Subir Tren (G)' : '4. Bajar Tren (G)'}
                </button>
              </div>
            </div>

            {/* Controles de vuelo manual */}
            <div className="p-3 bg-zinc-950 border-t border-zinc-800">
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
          </div>

          {/* SISTEMA DE PROPULSIÓN ADAPTADO AL MODELO DE AVIÓN */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold flex items-center gap-1.5" style={{ color: aircraft.accentColor }}>
                <Flame className="w-4 h-4" /> {aircraft.propulsionLabel}
              </h2>
              <span className="text-[11px] font-mono text-emerald-400">
                {selectedAircraft === 'H2_VALKYRIE' ? `${data?.fuel_cell_kw ?? 0} kW` : aircraft.cruiseMach}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">{aircraft.fuelLabel}</div>
                <div className="text-base font-bold font-mono text-cyan-300">
                  {selectedAircraft === 'H2_VALKYRIE'
                    ? `${data?.h2_pressure_bar ?? 700} bar`
                    : `${Math.round(((data?.h2_pressure_bar ?? 700) / 700) * 100)} %`}
                </div>
                <div className="text-[10px] text-zinc-500">Techo: {aircraft.ceilingM} m</div>
              </div>
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">TEMP. PLANTA / TOBERAS</div>
                <div className={`text-base font-bold font-mono ${(data?.fuel_cell_temp ?? 0) > 80 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {selectedAircraft === 'H2_VALKYRIE'
                    ? `${data?.fuel_cell_temp ?? 28} °C`
                    : `${Math.round((data?.fuel_cell_temp ?? 28) * 11.5)} °C`}
                </div>
                <div className="text-[10px] text-zinc-500">Vel. Máx: {aircraft.maxSpeedKmh} km/h</div>
              </div>
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">BUS ELÉCTRICO / APU</div>
                <div className="text-base font-bold font-mono text-amber-300">{data?.battery_soc ?? 100}%</div>
                <div className="text-[10px] text-zinc-500">{data?.battery_voltage ?? 50.4} V</div>
              </div>
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">ENLACE & SATÉLITES</div>
                <div className="text-base font-bold font-mono text-emerald-400">{data?.gps_sats ?? 18} SAT</div>
                <div className="text-[10px] text-zinc-500">DATALINK / SATCOM OK</div>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA CENTRAL: MAPA TÁCTICO HD CON SELECTOR DE CAPAS */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col flex-1 min-h-[420px]">
            <div className="px-3 py-2 bg-black border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Navigation className="w-4 h-4" /> MAPA HD
              </div>

              {/* Selector de capas HD: Satélite / Topográfico / Táctico */}
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
                <Layers className="w-3.5 h-3.5 text-zinc-400 ml-1" />
                {(Object.keys(MAP_LAYERS) as MapLayerId[]).map((lid) => (
                  <button
                    key={lid}
                    onClick={() => setMapLayerId(lid)}
                    className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${
                      mapLayerId === lid ? 'bg-cyan-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {MAP_LAYERS[lid].label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => sendCmd({ action: 'TOGGLE_PAUSE' })}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                >
                  {data?.mission_paused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
                  {data?.mission_paused ? 'Reanudar' : 'Órbita'}
                </button>
                <select
                  value={data?.sim_speed || 25}
                  onChange={(e) => sendCmd({ action: 'SET_SIM_SPEED', speed: Number(e.target.value) })}
                  className="bg-zinc-900 text-xs px-1.5 py-1 rounded border border-zinc-800"
                >
                  <option value={1}>1x</option>
                  <option value={25}>25x</option>
                  <option value={100}>100x</option>
                </select>
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full flex-1 min-h-[340px] z-10" />

            <div className="p-2.5 bg-black border-t border-zinc-800 max-h-44 overflow-y-auto">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase mb-1.5">Plan de Vuelo Activo ({aircraft.name} • Clic en mapa = Añadir Waypoint)</div>
              <div className="space-y-1">
                {data?.waypoints.map((wp, idx) => (
                  <div
                    key={wp.id}
                    className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                      idx === data.current_wp_idx ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-200' : 'bg-zinc-950 text-zinc-400 border border-zinc-900'
                    }`}
                  >
                    <span className="truncate font-medium">{wp.name}</span>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span>{Math.round(wp.alt * aircraft.altMultiplier)}m</span>
                      <span>{Math.round(wp.speed * aircraft.speedMultiplier)}km/h</span>
                      <button
                        onClick={() => sendCmd({ action: 'UPDATE_WAYPOINT', idx, alt: wp.alt + 500, speed: wp.speed })}
                        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-1.5 rounded text-cyan-400 cursor-pointer"
                      >
                        +500m
                      </button>
                    </div>
                  </div>
                ))}
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
              {data?.ai_recommendation || `Perfil aerodinámico activo: ${aircraft.name} (${aircraft.cruiseMach}). Cobertura esférica 360° operativa sobre cordillera.`}
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