import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Flame, Navigation,
  Play, Pause, RotateCcw, AlertTriangle, Camera, Download, Cpu,
  Hand, Plane, Sliders, Grid, CheckCircle2, Power, ArrowUpCircle, ArrowDownCircle
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

type CameraId = 'CAM1_PROA' | 'CAM2_GIMBAL' | 'CAM3_NADIR' | 'CAM4_FLIR' | 'CAM5_ALA_IZQ' | 'CAM6_ALA_DER' | 'CAM7_VTAIL' | 'MULTI_7';

const CAMERAS: { id: CameraId; short: string; label: string; sensor: string }[] = [
  { id: 'CAM1_PROA', short: '1. PROA', label: 'CAM 01 // PROA FPV (HUD)', sensor: '4K WIDE 120°' },
  { id: 'CAM2_GIMBAL', short: '2. GIMBAL', label: 'CAM 02 // GIMBAL EO ESTABILIZADO', sensor: '30X OPTICAL' },
  { id: 'CAM3_NADIR', short: '3. NADIR', label: 'CAM 03 // CENITAL / NADIR (-90°)', sensor: 'ORTOFOTO LIVE' },
  { id: 'CAM4_FLIR', short: '4. FLIR', label: 'CAM 04 // TÉRMICA INFRARROJA (LWIR)', sensor: 'FLIR 640x512' },
  { id: 'CAM5_ALA_IZQ', short: '5. ALA IZQ', label: 'CAM 05 // ALA INVERTIDA BABOR', sensor: 'ESTRUCTURAL IZQ' },
  { id: 'CAM6_ALA_DER', short: '6. ALA DER', label: 'CAM 06 // ALA INVERTIDA ESTRIBOR', sensor: 'ESTRUCTURAL DER' },
  { id: 'CAM7_VTAIL', short: '7. V-TAIL', label: 'CAM 07 // DOBLE COLA EN V (POPA)', sensor: 'EMPENAGE / H2' },
];

// Motor de renderizado de paisaje geográfico dinámico en tiempo real según latitud de Chile
function TerrainCanvas({
  camId,
  data,
  gearDown,
  compact = false,
}: {
  camId: CameraId;
  data: Telemetry | null;
  gearDown: boolean;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    let offset = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = (canvas.width = canvas.clientWidth || 320);
      const h = (canvas.height = canvas.clientHeight || 200);

      const lat = data?.lat ?? -18.35; // -18 Arica -> -53 Punta Arenas
      const alt = data?.alt ?? 0;
      const speed = data?.speed ?? 0;
      const roll = ((data?.roll ?? 0) * Math.PI) / 180;
      const pitch = data?.pitch ?? 0;
      const heading = ((data?.heading ?? 180) * Math.PI) / 180;

      offset += Math.max(0.4, speed / 45);

      // Bioma dinámico según latitud chilena
      // Norte (-18 a -29): Desierto de Atacama | Centro (-29 a -41): Valles y Cordillera | Sur (-41 a -55): Fiordos y Glaciares
      const isNorth = lat > -29;
      const isSouth = lat < -41;
      const isFlir = camId === 'CAM4_FLIR';

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
        skyTop = '#03132b';
        skyHorizon = '#38bdf8';
        groundNear = '#92400e';
        groundFar = '#d97706';
        mountainColor = '#7c2d12';
        snowColor = '#fef3c7';
      } else if (isSouth) {
        skyTop = '#090d16';
        skyHorizon = '#64748b';
        groundNear = '#064e3b';
        groundFar = '#0f766e';
        mountainColor = '#1e293b';
        snowColor = '#f8fafc';
      } else {
        skyTop = '#041736';
        skyHorizon = '#0284c7';
        groundNear = '#14532d';
        groundFar = '#3f6212';
        mountainColor = '#334155';
        snowColor = '#f1f5f9';
      }

      ctx.clearRect(0, 0, w, h);

      // VISTA CENITAL / NADIR (-90° mirando directamente al suelo)
      if (camId === 'CAM3_NADIR') {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-heading);

        const diag = Math.hypot(w, h) * 1.4;
        ctx.fillStyle = groundNear;
        ctx.fillRect(-diag / 2, -diag / 2, diag, diag);

        // Franja costera del Pacífico al oeste y Cordillera al este
        ctx.fillStyle = isFlir ? '#18181b' : '#0369a1';
        ctx.fillRect(-diag / 2, -diag / 2, diag * 0.36, diag);

        // Relieve montañoso desplazándose con la velocidad
        const tileStep = 48;
        const shiftY = (offset * 1.6) % tileStep;
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

        // Cuadrícula cartográfica
        ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.18)' : 'rgba(56,189,248,0.22)';
        ctx.lineWidth = 1;
        for (let g = -diag / 2; g < diag / 2; g += 40) {
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
        // VISTAS EN PERSPECTIVA (PROA, GIMBAL, FLIR, ALAS, V-TAIL)
        let viewRoll = -roll;
        let viewPitchOffset = pitch * (compact ? 1.8 : 3.5);
        if (camId === 'CAM5_ALA_IZQ') viewRoll = (pitch * Math.PI) / 180 - 0.25;
        if (camId === 'CAM6_ALA_DER') viewRoll = (-pitch * Math.PI) / 180 + 0.25;
        if (camId === 'CAM7_VTAIL') viewRoll = roll * 0.85;

        ctx.save();
        ctx.translate(w / 2, h / 2 + viewPitchOffset);
        ctx.rotate(viewRoll);

        const big = Math.hypot(w, h) * 1.8;

        // Cielo
        const skyGrad = ctx.createLinearGradient(0, -big / 2, 0, 0);
        skyGrad.addColorStop(0, skyTop);
        skyGrad.addColorStop(1, skyHorizon);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(-big / 2, -big / 2, big, big / 2);

        // Suelo en perspectiva
        const groundGrad = ctx.createLinearGradient(0, 0, 0, big / 2);
        groundGrad.addColorStop(0, groundFar);
        groundGrad.addColorStop(1, groundNear);
        ctx.fillStyle = groundGrad;
        ctx.fillRect(-big / 2, 0, big, big / 2);

        // Océano Pacífico en el horizonte lateral
        ctx.fillStyle = isFlir ? '#18181b' : '#0284c7';
        if (camId === 'CAM6_ALA_DER') {
          ctx.fillRect(-big / 2, 0, big, big * 0.14);
        } else if (camId !== 'CAM5_ALA_IZQ') {
          ctx.fillRect(-big / 2, 0, big * 0.42, big * 0.08);
        }

        // Cordillera de los Andes en el horizonte
        const peakCount = 16;
        const peakStep = big / peakCount;
        const pan = ((data?.heading ?? 180) * 3) % peakStep;
        for (let i = -2; i < peakCount + 2; i++) {
          const px = -big / 2 + i * peakStep - pan;
          const peakH = (compact ? 16 : 32) + Math.sin(i * 1.7) * (compact ? 7 : 14);
          ctx.fillStyle = mountainColor;
          ctx.beginPath();
          ctx.moveTo(px - peakStep * 0.6, 0);
          ctx.lineTo(px, -peakH);
          ctx.lineTo(px + peakStep * 0.6, 0);
          ctx.closePath();
          ctx.fill();

          if (!isNorth || peakH > 26) {
            ctx.fillStyle = snowColor;
            ctx.beginPath();
            ctx.moveTo(px - peakStep * 0.22, -peakH * 0.55);
            ctx.lineTo(px, -peakH);
            ctx.lineTo(px + peakStep * 0.22, -peakH * 0.55);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Pista de aterrizaje en Arica cuando altitud < 120m
        if (alt < 120 && (camId === 'CAM1_PROA' || camId === 'CAM2_GIMBAL')) {
          ctx.fillStyle = '#18181b';
          ctx.beginPath();
          ctx.moveTo(-16, 2);
          ctx.lineTo(16, 2);
          ctx.lineTo(95, big / 2);
          ctx.lineTo(-95, big / 2);
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
          // Líneas de velocidad terrestre avanzando hacia el avión
          ctx.strokeStyle = isFlir ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          for (let r = 1; r <= 6; r++) {
            const yPos = Math.pow(((r * 35 + offset * 2.2) % 210) / 210, 1.8) * (big * 0.42);
            ctx.beginPath();
            ctx.moveTo(-big / 2, yPos);
            ctx.lineTo(big / 2, yPos);
            ctx.stroke();
          }
        }

        // Línea de horizonte artificial
        ctx.strokeStyle = isFlir ? '#ffffff' : '#34d399';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-big / 2, 0);
        ctx.lineTo(big / 2, 0);
        ctx.stroke();

        ctx.restore();
      }

      // ESTRUCTURA DEL AVIÓN EN CÁMARAS DE INSPECCIÓN
      if (camId === 'CAM5_ALA_IZQ') {
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(w * 0.85, h * 0.36);
        ctx.lineTo(w * 0.92, h * 0.45);
        ctx.lineTo(w * 0.22, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (camId === 'CAM6_ALA_DER') {
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w, h);
        ctx.lineTo(w * 0.15, h * 0.36);
        ctx.lineTo(w * 0.08, h * 0.45);
        ctx.lineTo(w * 0.78, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (camId === 'CAM7_VTAIL') {
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        // Deriva izquierda V
        ctx.beginPath();
        ctx.moveTo(w * 0.45, h);
        ctx.lineTo(w * 0.24, h * 0.26);
        ctx.lineTo(w * 0.31, h * 0.26);
        ctx.lineTo(w * 0.5, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Deriva derecha V
        ctx.beginPath();
        ctx.moveTo(w * 0.55, h);
        ctx.lineTo(w * 0.76, h * 0.26);
        ctx.lineTo(w * 0.69, h * 0.26);
        ctx.lineTo(w * 0.5, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Indicador visual de tren de aterrizaje debajo del fuselaje si está extendido
        if (gearDown) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(w * 0.42, h * 0.85);
          ctx.lineTo(w * 0.42, h * 0.98);
          ctx.moveTo(w * 0.58, h * 0.85);
          ctx.lineTo(w * 0.58, h * 0.98);
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [camId, data, gearDown, compact]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}

export default function App() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeCam, setActiveCam] = useState<CameraId>('CAM1_PROA');
  const [recording, setRecording] = useState(false);

  // Estados de la botonera de procedimiento de despegue y tren de aterrizaje
  const [preflightChecked, setPreflightChecked] = useState(false);
  const [h2CellIgnited, setH2CellIgnited] = useState(false);
  const [gearDown, setGearDown] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const planeMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const trailLineRef = useRef<L.Polyline | null>(null);
  const wpLayerRef = useRef<L.LayerGroup | null>(null);

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
        if (CAMERAS[idx]) setActiveCam(CAMERAS[idx].id);
      }
      if (e.key === '0') setActiveCam('MULTI_7');
      if (e.key === 'g' || e.key === 'G') setGearDown((prev) => !prev);

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
  }, [data?.mode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-35.5, -71.0],
      zoom: 4,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    L.rectangle([[-56.0, -76.0], [-17.5, -66.5]], {
      color: '#ef4444',
      weight: 2,
      dashArray: '6, 6',
      fillOpacity: 0.03,
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
    routeLineRef.current = L.polyline([], { color: '#0284c7', weight: 3, dashArray: '6,6' }).addTo(map);
    trailLineRef.current = L.polyline([], { color: '#10b981', weight: 4 }).addTo(map);
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (!data || !mapRef.current) return;

    const planeIcon = L.divIcon({
      className: 'custom-uav-icon',
      html: `<div style="transform: rotate(${data.heading}deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="#0ea5e9" stroke="#000000" stroke-width="1.8">
          <path d="M12 2L15 10L22 14L14 15L13 21L12 19L11 21L10 15L2 14L9 10L12 2Z"/>
        </svg>
      </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
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
        color: isCurrent ? '#f59e0b' : '#0284c7',
        fillColor: isCurrent ? '#f59e0b' : '#0284c7',
        fillOpacity: 0.95,
      })
        .bindTooltip(`${wp.name} (${wp.alt}m)`, { direction: 'right' })
        .addTo(wpLayerRef.current!);
    });
  }, [data]);

  const downloadBlackbox = async () => {
    const res = await fetch(`${API_URL}/api/blackbox`);
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `H2-Valkyrie-Blackbox-${Date.now()}.json`;
    a.click();
  };

  const handleResetSimulation = () => {
    sendCmd({ action: 'RESET_SIM' });
    setPreflightChecked(false);
    setH2CellIgnited(false);
    setGearDown(true);
  };

  const renderCameraViewport = (camId: CameraId, compact = false) => {
    const camMeta = CAMERAS.find((c) => c.id === camId) || CAMERAS[0];

    return (
      <div className="relative w-full h-full bg-black overflow-hidden select-none">
        <TerrainCanvas camId={camId} data={data} gearDown={gearDown} compact={compact} />

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
            <div className="absolute top-2 left-3 text-[11px] font-mono text-emerald-400 space-y-0.5 bg-black/75 border border-zinc-800 px-2 py-1 rounded">
              <div>SPD: {data?.speed ?? 0} KM/H</div>
              <div>ALT: {data?.alt ?? 0} M</div>
              <div>V/S: {data?.vspeed ?? 0} M/S</div>
            </div>
            <div className="absolute top-2 right-3 text-[11px] font-mono text-emerald-400 text-right space-y-0.5 bg-black/75 border border-zinc-800 px-2 py-1 rounded">
              <div>HDG: {data?.heading ?? 0}°</div>
              <div>PIT: {data?.pitch ?? 0}° | ROL: {data?.roll ?? 0}°</div>
              <div>GEAR: <span className={gearDown ? 'text-amber-400' : 'text-emerald-400'}>{gearDown ? 'DOWN' : 'UP'}</span></div>
            </div>
            <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] font-mono text-zinc-200 bg-black/85 border border-zinc-800 px-2 py-1 rounded">
              <span className="text-cyan-400 font-bold">{camMeta.label}</span>
              <span>LAT {data?.lat} / LON {data?.lon}</span>
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
      {/* BARRA SUPERIOR NEGRO PURO */}
      <header className="bg-black border-b border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-950 border border-cyan-500/40 flex items-center justify-center">
            <Plane className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold tracking-wider text-sm text-white">GCS // H2-VALKYRIE</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                {connected ? 'ENLACE ACTIVO' : 'CONECTANDO...'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">Sector: <span className="text-cyan-400 font-mono">{regionName}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
          <span className="text-[11px] text-zinc-400 uppercase">Autoridad:</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            data?.authority === 'HUMAN_OPERATOR' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
            data?.authority === 'SAFETY_OVERRIDE' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
            'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
          }`}>
            {data?.authority || 'INIT'} ({data?.mode || 'STANDBY'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {data?.mode !== 'STANDBY' && (
            <>
              <button
                onClick={() => sendCmd({ action: 'SET_MODE', mode: isHumanControl ? 'AUTONOMOUS' : 'ASSISTED' })}
                className={`font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
                  isHumanControl
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-black'
                }`}
              >
                <Hand className="w-4 h-4" />
                {isHumanControl ? 'DEVOLVER A MODO AUTÓNOMO' : 'TOMAR CONTROL (INTERVENCIÓN)'}
              </button>

              {isHumanControl && (
                <button
                  onClick={() => sendCmd({ action: 'SET_MODE', mode: data?.mode === 'MANUAL' ? 'ASSISTED' : 'MANUAL' })}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs px-3 py-2 rounded-lg cursor-pointer"
                >
                  Modo: {data?.mode}
                </button>
              )}
            </>
          )}

          <button
            onClick={() => sendCmd({ action: 'SET_MODE', mode: 'FAILSAFE' })}
            className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
            title="Ejecutar protocolo de emergencia inmediata"
          >
            <ShieldAlert className="w-4 h-4" /> FAILSAFE
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 bg-black">
        {/* COLUMNA IZQUIERDA: SIMULADOR 7 CÁMARAS + BOTONERA DE DESPEGUE Y TREN DE ATERRIZAJE */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* PANEL DE 7 CÁMARAS CON SIMULADOR DE PAISAJE */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-black border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Camera className="w-4 h-4" /> SIMULADOR ÓPTICO (7 CÁMARAS)
              </div>
              <div className="flex items-center gap-1">
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
                  onClick={() => setActiveCam(c.id)}
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
                      onClick={() => setActiveCam(c.id)}
                      className="cursor-pointer border border-zinc-800 hover:border-cyan-400 rounded overflow-hidden"
                    >
                      {renderCameraViewport(c.id, true)}
                    </div>
                  ))}
                  <div className="col-span-2 bg-zinc-950 border border-zinc-800 rounded p-2 flex flex-col justify-center text-[10px] font-mono text-zinc-300">
                    <div className="text-cyan-400 font-bold">PAISAJE EN TIEMPO REAL</div>
                    <div>HDG {data?.heading ?? 0}° | ALT {data?.alt ?? 0}m | SPD {data?.speed ?? 0}km/h</div>
                    <div className="text-zinc-500">Teclas 1–7 para ampliar cámara</div>
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

              {/* Checklist visual rápido */}
              <div className="grid grid-cols-4 gap-1 text-[9px] font-mono text-center">
                <div className={`py-1 rounded border ${preflightChecked ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  H2 700 BAR: {preflightChecked ? 'OK' : 'PEND'}
                </div>
                <div className={`py-1 rounded border ${preflightChecked ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  ALAS/V-TAIL: {preflightChecked ? 'OK' : 'PEND'}
                </div>
                <div className={`py-1 rounded border ${preflightChecked ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  SATCOM/GPS: {preflightChecked ? 'OK' : 'PEND'}
                </div>
                <div className={`py-1 rounded border ${h2CellIgnited ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
                  CELDA PEM: {h2CellIgnited ? 'ON' : 'OFF'}
                </div>
              </div>

              {/* Botonera secuencial de despegue */}
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
                  2. Ignición Celda H2
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
                  title="Subir o bajar el tren de aterrizaje (Tecla G)"
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

          {/* SISTEMA DE PROPULSIÓN HIDRÓGENO */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Flame className="w-4 h-4" /> PROPULSIÓN HIDRÓGENO (H2)
              </h2>
              <span className="text-[11px] font-mono text-emerald-400">{data?.fuel_cell_kw ?? 0} kW</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">PRESIÓN TANQUE H2</div>
                <div className="text-base font-bold font-mono text-cyan-300">{data?.h2_pressure_bar ?? 700} bar</div>
                <div className="text-[10px] text-zinc-500">Masa: {data?.h2_mass_kg ?? 6.5} kg</div>
              </div>
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">TEMP. CELDA PEM</div>
                <div className={`text-base font-bold font-mono ${(data?.fuel_cell_temp ?? 0) > 80 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {data?.fuel_cell_temp ?? 28} °C
                </div>
                <div className="text-[10px] text-zinc-500">Límite: 85.0 °C</div>
              </div>
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">BATERÍA HÍBRIDA (SoC)</div>
                <div className="text-base font-bold font-mono text-amber-300">{data?.battery_soc ?? 100}%</div>
                <div className="text-[10px] text-zinc-500">{data?.battery_voltage ?? 50.4} V</div>
              </div>
              <div className="bg-black p-2.5 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 text-[10px]">ENLACE & SATÉLITES</div>
                <div className="text-base font-bold font-mono text-emerald-400">{data?.gps_sats ?? 18} SAT</div>
                <div className="text-[10px] text-zinc-500">RF/Satcom OK</div>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA CENTRAL: MAPA TÁCTICO Y WAYPOINTS */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col flex-1 min-h-[420px]">
            <div className="px-3 py-2 bg-black border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Navigation className="w-4 h-4" /> MAPA TÁCTICO (Clic en mapa = Añadir Waypoint)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => sendCmd({ action: 'TOGGLE_PAUSE' })}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs px-2.5 py-1 rounded flex items-center gap-1 cursor-pointer"
                >
                  {data?.mission_paused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
                  {data?.mission_paused ? 'Reanudar' : 'Pausar (Órbita)'}
                </button>
                <select
                  value={data?.sim_speed || 25}
                  onChange={(e) => sendCmd({ action: 'SET_SIM_SPEED', speed: Number(e.target.value) })}
                  className="bg-zinc-900 text-xs px-2 py-1 rounded border border-zinc-800"
                >
                  <option value={1}>Sim 1x (Real)</option>
                  <option value={25}>Sim 25x</option>
                  <option value={100}>Sim 100x (Cruce rápido)</option>
                </select>
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full flex-1 min-h-[340px] z-10" />

            <div className="p-2.5 bg-black border-t border-zinc-800 max-h-44 overflow-y-auto">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase mb-1.5">Plan de Vuelo Activo (Validado por Safety Guardian)</div>
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
                      <span>{wp.alt}m</span>
                      <span>{wp.speed}km/h</span>
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
              <span className="text-[9px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded">SIN AUTORIDAD DIRECTA</span>
            </div>
            <p className="text-xs text-zinc-300 bg-black p-2.5 rounded-lg border border-zinc-800">
              {data?.ai_recommendation || 'Análisis continuo: Eficiencia de pila de combustible óptima. Perfil aerodinámico estable sobre cordillera.'}
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
                2. Simular Caída Presión Hidrógeno
              </button>
              <button
                onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'THERMAL_SPIKE' })}
                className="bg-black hover:bg-amber-950/50 border border-zinc-800 hover:border-amber-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
              >
                3. Simular Sobretemperatura Celda H2
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
                <div className="text-xs text-zinc-500 italic">Sin alertas activas. Ejecuta Check Pre-Vuelo para iniciar.</div>
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