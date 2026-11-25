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

// Motor de renderizado fotorrealista 2.5D con atmósfera volumétrica, cordillera multi-capa y HUD aeronáutico
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
    let wavePhase = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const clientW = canvas.clientWidth || 480;
      const clientH = canvas.clientHeight || 320;
      if (canvas.width !== Math.floor(clientW * dpr) || canvas.height !== Math.floor(clientH * dpr)) {
        canvas.width = Math.floor(clientW * dpr);
        canvas.height = Math.floor(clientH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = clientW;
      const h = clientH;

      const lat = data?.lat ?? -18.35;
      const effAlt = Math.round((data?.alt ?? 0) * aircraft.altMultiplier);
      const effSpeed = Math.round((data?.speed ?? 0) * aircraft.speedMultiplier);
      const roll = ((data?.roll ?? 0) * Math.PI) / 180;
      const rawPitch = data?.pitch ?? 0;
      const pitch = rawPitch + tiltOffset * 0.5;
      const baseHeading = (data?.heading ?? 180) + panOffset;
      const headingRad = (baseHeading * Math.PI) / 180;

      scrollDist += Math.max(0.4, effSpeed / 75);
      wavePhase += 0.04;

      const isNorth = lat > -29;
      const isSouth = lat < -41;
      const isFlir = camId === 'CAM4_FLIR';
      const isHighAlt = effAlt > 15500;

      // Paleta atmosférica y geográfica realista
      let skyZenith = '#020817';
      let skyMid = '#0c2d57';
      let skyHorizon = '#f59e0b';
      let hazeColor = 'rgba(253, 224, 71, 0.25)';
      let groundBase = '#78350f';
      let groundHighlight = '#b45309';
      let groundShadow = '#3b1706';
      let ridgeFar = '#475569';
      let ridgeLit = '#854d0e';
      let ridgeDark = '#291509';
      let snowCap = '#f8fafc';

      if (isFlir) {
        skyZenith = '#040405';
        skyMid = '#121215';
        skyHorizon = '#27272a';
        hazeColor = 'rgba(255,255,255,0.08)';
        groundBase = '#27272a';
        groundHighlight = '#52525b';
        groundShadow = '#09090b';
        ridgeFar = '#3f3f46';
        ridgeLit = '#d4d4d8';
        ridgeDark = '#18181b';
        snowCap = '#ffffff';
      } else if (isNorth) {
        skyZenith = isHighAlt ? '#000105' : '#041229';
        skyMid = isHighAlt ? '#072448' : '#1d4ed8';
        skyHorizon = '#fbbf24';
        hazeColor = 'rgba(251, 191, 36, 0.24)';
        groundBase = '#7c2d12';
        groundHighlight = '#c2410c';
        groundShadow = '#431407';
        ridgeFar = '#64748b';
        ridgeLit = '#9a3412';
        ridgeDark = '#3b0f05';
        snowCap = '#fef3c7';
      } else if (isSouth) {
        skyZenith = isHighAlt ? '#000105' : '#071324';
        skyMid = '#1e3a5f';
        skyHorizon = '#94a3b8';
        hazeColor = 'rgba(148, 163, 184, 0.22)';
        groundBase = '#064e3b';
        groundHighlight = '#047857';
        groundShadow = '#022c22';
        ridgeFar = '#334155';
        ridgeLit = '#1e293b';
        ridgeDark = '#0f172a';
        snowCap = '#ffffff';
      } else {
        skyZenith = isHighAlt ? '#000105' : '#061836';
        skyMid = '#0369a1';
        skyHorizon = '#fcd34d';
        hazeColor = 'rgba(252, 211, 77, 0.2)';
        groundBase = '#14532d';
        groundHighlight = '#15803d';
        groundShadow = '#052e16';
        ridgeFar = '#475569';
        ridgeLit = '#3f6212';
        ridgeDark = '#1a2e05';
        snowCap = '#f8fafc';
      }

      ctx.clearRect(0, 0, w, h);

      // 1. VISTA CENITAL / NADIR (-90° Ortofoto con relieve y costa)
      if (camId === 'CAM3_NADIR') {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-headingRad);

        const diag = Math.hypot(w, h) * 1.55;
        const groundGrad = ctx.createLinearGradient(-diag / 2, 0, diag / 2, 0);
        groundGrad.addColorStop(0, isFlir ? '#18181b' : '#0c4a6e');
        groundGrad.addColorStop(0.32, isFlir ? '#27272a' : '#0284c7');
        groundGrad.addColorStop(0.35, isFlir ? '#52525b' : '#d97706');
        groundGrad.addColorStop(0.45, groundBase);
        groundGrad.addColorStop(1, ridgeDark);
        ctx.fillStyle = groundGrad;
        ctx.fillRect(-diag / 2, -diag / 2, diag, diag);

        // Cadenas montañosas vistas desde arriba con sombra direccional
        const step = 52;
        const shiftY = (scrollDist * 1.7) % step;
        for (let y = -diag / 2 - step; y < diag / 2 + step; y += step) {
          for (let x = -diag * 0.08; x < diag / 2; x += step) {
            const hPeak = 18 + Math.sin((x + y) * 0.04) * 10;
            // Cara iluminada (oeste)
            ctx.fillStyle = ridgeLit;
            ctx.beginPath();
            ctx.moveTo(x, y + shiftY);
            ctx.lineTo(x + 24, y + shiftY - hPeak);
            ctx.lineTo(x + 24, y + shiftY + 8);
            ctx.closePath();
            ctx.fill();

            // Cara sombreada (este)
            ctx.fillStyle = ridgeDark;
            ctx.beginPath();
            ctx.moveTo(x + 24, y + shiftY - hPeak);
            ctx.lineTo(x + 48, y + shiftY);
            ctx.lineTo(x + 24, y + shiftY + 8);
            ctx.closePath();
            ctx.fill();

            if (!isNorth) {
              ctx.fillStyle = snowCap;
              ctx.beginPath();
              ctx.moveTo(x + 17, y + shiftY - hPeak * 0.65);
              ctx.lineTo(x + 24, y + shiftY - hPeak);
              ctx.lineTo(x + 31, y + shiftY - hPeak * 0.65);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        // Malla geodésica
        ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.16)' : 'rgba(56,189,248,0.22)';
        ctx.lineWidth = 1;
        for (let g = -diag / 2; g < diag / 2; g += 44) {
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
        // 2. VISTAS EN PERSPECTIVA 2.5D CON PARALAJE Y ATMÓSFERA
        let viewRoll = -roll;
        const viewPitchOffset = pitch * (compact ? 1.8 : 3.8);
        if (camId === 'CAM5_ALA_IZQ') viewRoll = (rawPitch * Math.PI) / 180 - 0.14;
        if (camId === 'CAM6_ALA_DER') viewRoll = (-rawPitch * Math.PI) / 180 + 0.14;
        if (camId === 'CAM7_VTAIL') viewRoll = roll * 0.85;

        ctx.save();
        ctx.translate(w / 2, h / 2 + viewPitchOffset);
        ctx.rotate(viewRoll);

        const big = Math.hypot(w, h) * 2.0;
        const normalizedAzimuth = ((baseHeading % 360) + 360) % 360;

        // Cielo atmosférico en 3 etapas
        const skyGrad = ctx.createLinearGradient(0, -big / 2, 0, 0);
        skyGrad.addColorStop(0, skyZenith);
        skyGrad.addColorStop(0.65, skyMid);
        skyGrad.addColorStop(1, skyHorizon);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(-big / 2, -big / 2, big, big / 2);

        // Disco solar / resplandor en el horizonte oeste
        if (!isFlir && normalizedAzimuth > 170 && normalizedAzimuth < 340) {
          const sunX = ((normalizedAzimuth - 255) / 85) * (w * 0.45);
          const sunGlow = ctx.createRadialGradient(sunX, -8, 2, sunX, -8, compact ? 45 : 95);
          sunGlow.addColorStop(0, 'rgba(255, 251, 235, 0.95)');
          sunGlow.addColorStop(0.25, 'rgba(253, 224, 71, 0.45)');
          sunGlow.addColorStop(1, 'rgba(251, 146, 60, 0)');
          ctx.fillStyle = sunGlow;
          ctx.fillRect(-big / 2, -big / 2, big, big / 2);
        }

        // Nubes estratificadas suaves
        if (!isHighAlt) {
          ctx.fillStyle = isFlir ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)';
          const cloudShift = (normalizedAzimuth * 2.5) % 240;
          for (let c = -3; c <= 3; c++) {
            const cx = c * 240 - cloudShift;
            const cy = -(compact ? 24 : 52) - (Math.abs(c) % 2) * 18;
            ctx.beginPath();
            ctx.ellipse(cx, cy, compact ? 45 : 95, compact ? 5 : 11, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Capa 1 de Cordillera (Lejana - Bruma atmosférica)
        const farCount = 16;
        const farStep = big / farCount;
        const farPan = (normalizedAzimuth * 2.2) % farStep;
        for (let i = -2; i < farCount + 2; i++) {
          const px = -big / 2 + i * farStep - farPan;
          const ph = (compact ? 20 : 44) + Math.sin(i * 1.3) * (compact ? 8 : 18);
          ctx.fillStyle = ridgeFar;
          ctx.beginPath();
          ctx.moveTo(px - farStep * 0.75, 0);
          ctx.lineTo(px, -ph);
          ctx.lineTo(px + farStep * 0.75, 0);
          ctx.closePath();
          ctx.fill();
        }

        // Capa 2 de Cordillera (Principal con sombreado 3D en dos caras y nieve)
        const nearCount = 14;
        const nearStep = big / nearCount;
        const nearPan = (normalizedAzimuth * 4.2) % nearStep;
        for (let i = -2; i < nearCount + 2; i++) {
          const px = -big / 2 + i * nearStep - nearPan;
          const ph = (compact ? 15 : 34) + Math.cos(i * 1.9) * (compact ? 6 : 14);

          // Ladera iluminada (izquierda)
          ctx.fillStyle = ridgeLit;
          ctx.beginPath();
          ctx.moveTo(px - nearStep * 0.65, 0);
          ctx.lineTo(px, -ph);
          ctx.lineTo(px + nearStep * 0.12, 0);
          ctx.closePath();
          ctx.fill();

          // Ladera en sombra (derecha)
          ctx.fillStyle = ridgeDark;
          ctx.beginPath();
          ctx.moveTo(px, -ph);
          ctx.lineTo(px + nearStep * 0.65, 0);
          ctx.lineTo(px + nearStep * 0.12, 0);
          ctx.closePath();
          ctx.fill();

          // Casquete de nieve andina
          if (!isNorth || ph > 26) {
            ctx.fillStyle = snowCap;
            ctx.beginPath();
            ctx.moveTo(px - nearStep * 0.22, -ph * 0.58);
            ctx.lineTo(px, -ph);
            ctx.lineTo(px + nearStep * 0.24, -ph * 0.54);
            ctx.lineTo(px + nearStep * 0.04, -ph * 0.62);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Bruma en la línea del horizonte
        const hGlow = ctx.createLinearGradient(0, -14, 0, 14);
        hGlow.addColorStop(0, 'rgba(0,0,0,0)');
        hGlow.addColorStop(0.5, hazeColor);
        hGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hGlow;
        ctx.fillRect(-big / 2, -14, big, 28);

        // Terreno en perspectiva con textura de profundidad
        const groundGrad = ctx.createLinearGradient(0, 0, 0, big / 2);
        groundGrad.addColorStop(0, groundHighlight);
        groundGrad.addColorStop(0.35, groundBase);
        groundGrad.addColorStop(1, groundShadow);
        ctx.fillStyle = groundGrad;
        ctx.fillRect(-big / 2, 0, big, big / 2);

        // Océano Pacífico con reflejo solar y oleaje
        if (normalizedAzimuth > 155 && normalizedAzimuth < 355) {
          const seaGrad = ctx.createLinearGradient(0, 0, 0, big * 0.15);
          seaGrad.addColorStop(0, isFlir ? '#18181b' : '#0369a1');
          seaGrad.addColorStop(1, isFlir ? '#27272a' : '#0c4a6e');
          ctx.fillStyle = seaGrad;
          ctx.fillRect(-big / 2, 0, big * 0.58, big * 0.14);

          // Destellos de olas en el mar
          ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.12)' : 'rgba(186, 230, 253, 0.35)';
          ctx.lineWidth = 1;
          for (let wv = 1; wv <= 5; wv++) {
            const wy = wv * (compact ? 3 : 6);
            const wxOffset = Math.sin(wavePhase + wv) * 14;
            ctx.beginPath();
            ctx.moveTo(-big * 0.4 + wxOffset, wy);
            ctx.lineTo(-big * 0.05 + wxOffset, wy);
            ctx.stroke();
          }
        }

        // Pista de Arica iluminada en despegue/aterrizaje (altitud < 160m)
        if ((data?.alt ?? 0) < 160 && (camId === 'CAM1_PROA' || camId === 'CAM2_GIMBAL')) {
          ctx.fillStyle = '#09090b';
          ctx.beginPath();
          ctx.moveTo(-22, 2);
          ctx.lineTo(22, 2);
          ctx.lineTo(125, big / 2);
          ctx.lineTo(-125, big / 2);
          ctx.closePath();
          ctx.fill();

          // Luces de borde de pista
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-20, 2);
          ctx.lineTo(-118, big / 2);
          ctx.moveTo(20, 2);
          ctx.lineTo(118, big / 2);
          ctx.stroke();

          // Eje central luminoso
          ctx.strokeStyle = '#facc15';
          ctx.setLineDash([14, 10]);
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(0, 6);
          ctx.lineTo(0, big / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Líneas dinámicas de flujo de terreno según velocidad
          ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.09)';
          ctx.lineWidth = 1;
          for (let r = 1; r <= 7; r++) {
            const yPos = Math.pow(((r * 30 + scrollDist * 2.5) % 210) / 210, 1.9) * (big * 0.45);
            ctx.beginPath();
            ctx.moveTo(-big / 2, yPos);
            ctx.lineTo(big / 2, yPos);
            ctx.stroke();
          }
        }

        // Escalera de cabeceo (Pitch Ladder) en modo completo
        if (!compact && (camId === 'CAM1_PROA' || camId === 'CAM2_GIMBAL')) {
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
          ctx.fillStyle = 'rgba(52, 211, 153, 0.8)';
          ctx.font = '9px monospace';
          ctx.lineWidth = 1;
          [-10, -5, 5, 10].forEach((deg) => {
            const py = -deg * 4.5;
            ctx.beginPath();
            ctx.moveTo(-45, py);
            ctx.lineTo(-18, py);
            ctx.moveTo(18, py);
            ctx.lineTo(45, py);
            ctx.stroke();
            ctx.fillText(`${deg}`, 49, py + 3);
          });
        }

        // Línea de horizonte artificial
        ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.85)' : 'rgba(52, 211, 153, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-big / 2, 0);
        ctx.lineTo(big / 2, 0);
        ctx.stroke();

        ctx.restore();
      }

      // 3. ESTRUCTURAS COMPUESTAS ANCLADAS AL FUSELAJE CON SOMBREADO METÁLICO 3D
      const strokeAccent = aircraft.accentColor;
      const aileronDeflection = (data?.roll ?? 0) * 0.45;

      if (camId === 'CAM1_PROA') {
        const noseGrad = ctx.createLinearGradient(0, h - 22, 0, h + 14);
        noseGrad.addColorStop(0, '#27272a');
        noseGrad.addColorStop(1, '#09090b');
        ctx.fillStyle = noseGrad;
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(w / 2, h + 14, w * 0.2, 25, 0, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
      } else if (camId === 'CAM5_ALA_IZQ') {
        const wingGrad = ctx.createLinearGradient(0, h, w * 0.9, h * 0.35);
        wingGrad.addColorStop(0, '#09090b');
        wingGrad.addColorStop(0.5, '#27272a');
        wingGrad.addColorStop(1, '#18181b');
        ctx.fillStyle = wingGrad;
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(w * 0.87, h * 0.33);
        ctx.lineTo(w * 0.94, h * 0.41);
        ctx.lineTo(w * 0.26, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Alerón móvil articulado
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(w * 0.42, h * 0.84);
        ctx.lineTo(w * 0.82, h * 0.47 + aileronDeflection);
        ctx.stroke();

        // Luz de navegación babor (Roja)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(w * 0.9, h * 0.36, compact ? 2.5 : 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (camId === 'CAM6_ALA_DER') {
        const wingGrad = ctx.createLinearGradient(w, h, w * 0.1, h * 0.35);
        wingGrad.addColorStop(0, '#09090b');
        wingGrad.addColorStop(0.5, '#27272a');
        wingGrad.addColorStop(1, '#18181b');
        ctx.fillStyle = wingGrad;
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w, h);
        ctx.lineTo(w * 0.13, h * 0.33);
        ctx.lineTo(w * 0.06, h * 0.41);
        ctx.lineTo(w * 0.74, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Alerón móvil articulado
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(w * 0.58, h * 0.84);
        ctx.lineTo(w * 0.18, h * 0.47 - aileronDeflection);
        ctx.stroke();

        // Luz de navegación estribor (Verde)
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(w * 0.1, h * 0.36, compact ? 2.5 : 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (camId === 'CAM7_VTAIL') {
        const tailGrad = ctx.createLinearGradient(w * 0.5, h, w * 0.5, h * 0.25);
        tailGrad.addColorStop(0, '#09090b');
        tailGrad.addColorStop(1, '#27272a');
        ctx.fillStyle = tailGrad;
        ctx.strokeStyle = strokeAccent;
        ctx.lineWidth = 1.5;
        const cantOut = aircraft.id === 'SR_71' ? -12 : 20;

        // Deriva izquierda anclada al lomo
        ctx.beginPath();
        ctx.moveTo(w * 0.43, h);
        ctx.lineTo(w * 0.31 - cantOut, h * 0.24);
        ctx.lineTo(w * 0.38 - cantOut, h * 0.24);
        ctx.lineTo(w * 0.49, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Deriva derecha anclada al lomo
        ctx.beginPath();
        ctx.moveTo(w * 0.57, h);
        ctx.lineTo(w * 0.69 + cantOut, h * 0.24);
        ctx.lineTo(w * 0.62 + cantOut, h * 0.24);
        ctx.lineTo(w * 0.51, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Lomo dorsal central
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h, w * 0.12, 22, 0, Math.PI, 0);
        ctx.fill();
        ctx.stroke();

        // Postquemadores supersónicos
        if (aircraft.id !== 'H2_VALKYRIE' && effSpeed > 300) {
          const flameGlow = ctx.createRadialGradient(w * 0.5, h * 0.9, 2, w * 0.5, h * 0.9, compact ? 18 : 34);
          flameGlow.addColorStop(0, aircraft.id === 'SR_71' ? 'rgba(251, 191, 36, 0.9)' : 'rgba(56, 189, 248, 0.9)');
          flameGlow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = flameGlow;
          ctx.fillRect(w * 0.35, h * 0.78, w * 0.3, h * 0.22);
        }
      }

      // 4. CINTA GRADUADA DE RUMBO AZIMUTAL 360° SUPERIOR
      if (!compact) {
        const az = Math.round(((baseHeading % 360) + 360) % 360);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(w * 0.24, 6, w * 0.52, 22);
        ctx.strokeStyle = '#27272a';
        ctx.strokeRect(w * 0.24, 6, w * 0.52, 22);

        // Marcas graduadas dinámicas
        ctx.strokeStyle = '#71717a';
        ctx.beginPath();
        for (let tick = -60; tick <= 60; tick += 15) {
          const tx = w / 2 + tick * 1.4;
          if (tx > w * 0.26 && tx < w * 0.74) {
            ctx.moveTo(tx, 6);
            ctx.lineTo(tx, tick % 30 === 0 ? 12 : 9);
          }
        }
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`360° GIMBAL // AZ: ${az}° | TILT: ${Math.round(tiltOffset)}°`, w / 2, 23);
      }

      ctx.restore();
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
        <TerrainCanvas
          camId={camId}
          aircraft={aircraft}
          data={data}
          gearDown={gearDown}
          panOffset={compact ? camMeta.basePan : camPan}
          tiltOffset={compact ? 0 : camTilt}
          compact={compact}
        />

        {/* Retícula táctica central */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {camId === 'CAM2_GIMBAL' || camId === 'CAM4_FLIR' ? (
            <div className={`${compact ? 'w-12 h-12' : 'w-32 h-32'} border border-cyan-400/75 relative flex items-center justify-center`}>
              <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]" />
              <div className="absolute -top-2.5 left-1/2 w-0.5 h-2.5 bg-cyan-400" />
              <div className="absolute -bottom-2.5 left-1/2 w-0.5 h-2.5 bg-cyan-400" />
              <div className="absolute -left-2.5 top-1/2 w-2.5 h-0.5 bg-cyan-400" />
              <div className="absolute -right-2.5 top-1/2 w-2.5 h-0.5 bg-cyan-400" />
            </div>
          ) : (
            <div className={`${compact ? 'w-12 h-12' : 'w-32 h-32'} border border-emerald-400/50 rounded-full flex items-center justify-center`}>
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
        {/* COLUMNA IZQUIERDA (ANTES POSICIÓN DE CÁMARAS): MAPA TÁCTICO HD + CONTROLES + PROPULSIÓN */}
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

            {/* Plan de Vuelo compacto */}
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

          {/* CONTROLES MANUALES DE VUELO */}
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

          {/* PROPULSIÓN */}
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

        {/* COLUMNA CENTRAL (EN EL MEDIO DE LA PÁGINA): SIMULADOR ÓPTICO 360° DE 7 CÁMARAS + BOTONERA DE DESPEGUE */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col flex-1">
            <div className="px-3 py-2 bg-black border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Camera className="w-4 h-4" /> SIMULADOR ÓPTICO 360° (7 CÁMARAS ONBOARD)
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

            {/* Selector rápido de las 7 cámaras */}
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

            {/* Visor Óptico Central Ampliado */}
            <div className="relative flex-1 min-h-[340px] bg-black">
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

            {/* BOTONERA COMPLETA DE PROCESO DE DESPEGUE, PRE-FLIGHT CHECK Y TREN DE ATERRIZAJE */}
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