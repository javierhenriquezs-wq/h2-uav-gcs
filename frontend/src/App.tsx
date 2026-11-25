import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Flame, Navigation,
  Play, Pause, RotateCcw, AlertTriangle, Camera, Download, Cpu,
  Hand, Plane, Sliders, Grid
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
  { id: 'CAM3_NADIR', short: '3. NADIR', label: 'CAM 03 // CENITAL / NADIR (-90°)', sensor: 'CARTOGRÁFICA' },
  { id: 'CAM4_FLIR', short: '4. FLIR', label: 'CAM 04 // TÉRMICA INFRARROJA (LWIR)', sensor: 'FLIR 640x512' },
  { id: 'CAM5_ALA_IZQ', short: '5. ALA IZQ', label: 'CAM 05 // ALA INVERTIDA BABOR', sensor: 'ESTRUCTURAL IZQ' },
  { id: 'CAM6_ALA_DER', short: '6. ALA DER', label: 'CAM 06 // ALA INVERTIDA ESTRIBOR', sensor: 'ESTRUCTURAL DER' },
  { id: 'CAM7_VTAIL', short: '7. V-TAIL', label: 'CAM 07 // DOBLE COLA EN V (POPA)', sensor: 'EMPENAGE / H2' },
];

export default function App() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeCam, setActiveCam] = useState<CameraId>('CAM1_PROA');
  const [recording, setRecording] = useState(false);
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
      // Teclas 1 a 7 cambian rápidamente de cámara durante el vuelo
      if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (CAMERAS[idx]) setActiveCam(CAMERAS[idx].id);
      }
      if (e.key === '0') setActiveCam('MULTI_7');

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
    trailLineRef.current = L.polyline([], { color: '#059669', weight: 4 }).addTo(map);
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (!data || !mapRef.current) return;

    const planeIcon = L.divIcon({
      className: 'custom-uav-icon',
      html: `<div style="transform: rotate(${data.heading}deg); width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="#0ea5e9" stroke="#0f172a" stroke-width="1.8">
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
        color: isCurrent ? '#d97706' : '#0369a1',
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

  const renderCameraViewport = (camId: CameraId, compact = false) => {
    const roll = data?.roll || 0;
    const pitch = data?.pitch || 0;
    const camMeta = CAMERAS.find((c) => c.id === camId) || CAMERAS[0];

    const bgStyle =
      camId === 'CAM4_FLIR'
        ? 'bg-gradient-to-b from-zinc-950 via-neutral-800 to-zinc-200/80'
        : camId === 'CAM3_NADIR'
        ? 'bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_70%,#020617_100%)]'
        : 'bg-gradient-to-b from-sky-950 via-slate-900 to-amber-950/70';

    return (
      <div className={`relative w-full h-full ${bgStyle} overflow-hidden select-none`}>
        {/* Horizonte / Terreno dinámico según cámara */}
        {camId === 'CAM3_NADIR' ? (
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                'linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)',
              backgroundSize: compact ? '20px 20px' : '36px 36px',
              transform: `rotate(${-(data?.heading || 0)}deg) scale(1.4)`,
            }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-150"
            style={{
              transform: `rotate(${
                camId === 'CAM5_ALA_IZQ' ? pitch - 90 : camId === 'CAM6_ALA_DER' ? -pitch + 90 : camId === 'CAM7_VTAIL' ? roll : -roll
              }deg) translateY(${pitch * (compact ? 1.5 : 3)}px)`,
            }}
          >
            <div
              className={`w-[160%] h-0.5 ${
                camId === 'CAM4_FLIR' ? 'bg-white shadow-[0_0_8px_#ffffff]' : 'bg-emerald-400/80 shadow-[0_0_8px_#34d399]'
              }`}
            />
          </div>
        )}

        {/* Siluetas estructurales del UAV para cámaras de inspección */}
        {camId === 'CAM5_ALA_IZQ' && (
          <svg viewBox="0 0 200 100" className="absolute bottom-0 left-0 w-3/4 h-2/3 opacity-75 pointer-events-none">
            <polygon points="0,100 175,35 190,45 45,100" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
            <line x1="60" y1="92" x2="165" y2="48" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,3" />
          </svg>
        )}

        {camId === 'CAM6_ALA_DER' && (
          <svg viewBox="0 0 200 100" className="absolute bottom-0 right-0 w-3/4 h-2/3 opacity-75 pointer-events-none">
            <polygon points="200,100 25,35 10,45 155,100" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
            <line x1="140" y1="92" x2="35" y2="48" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,3" />
          </svg>
        )}

        {camId === 'CAM7_VTAIL' && (
          <svg viewBox="0 0 200 100" className="absolute bottom-0 inset-x-0 w-full h-2/3 opacity-80 pointer-events-none">
            <polygon points="90,100 45,25 58,25 100,100" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
            <polygon points="110,100 155,25 142,25 100,100" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
            <circle cx="100" cy="88" r="10" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
          </svg>
        )}

        {/* Retícula central */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {camId === 'CAM2_GIMBAL' || camId === 'CAM4_FLIR' ? (
            <div className={`${compact ? 'w-12 h-12' : 'w-28 h-28'} border border-cyan-400/60 relative flex items-center justify-center`}>
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <div className="absolute -top-2 left-1/2 w-0.5 h-2 bg-cyan-400" />
              <div className="absolute -bottom-2 left-1/2 w-0.5 h-2 bg-cyan-400" />
              <div className="absolute -left-2 top-1/2 w-2 h-0.5 bg-cyan-400" />
              <div className="absolute -right-2 top-1/2 w-2 h-0.5 bg-cyan-400" />
            </div>
          ) : (
            <div className={`${compact ? 'w-12 h-12' : 'w-28 h-28'} border border-emerald-500/35 rounded-full flex items-center justify-center`}>
              <div className="w-2.5 h-2.5 border-2 border-amber-400 rounded-full" />
            </div>
          )}
        </div>

        {/* Telemetría superpuesta */}
        {!compact ? (
          <>
            <div className="absolute top-2 left-3 text-[11px] font-mono text-emerald-400 space-y-0.5 bg-slate-950/50 px-1.5 py-1 rounded">
              <div>SPD: {data?.speed ?? 0} KM/H</div>
              <div>ALT: {data?.alt ?? 0} M</div>
              <div>V/S: {data?.vspeed ?? 0} M/S</div>
            </div>
            <div className="absolute top-2 right-3 text-[11px] font-mono text-emerald-400 text-right space-y-0.5 bg-slate-950/50 px-1.5 py-1 rounded">
              <div>HDG: {data?.heading ?? 0}°</div>
              <div>PIT: {data?.pitch ?? 0}° | ROL: {data?.roll ?? 0}°</div>
              <div>THR: {data?.throttle ?? 0}%</div>
            </div>
            <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] font-mono text-slate-200 bg-slate-950/75 px-2 py-1 rounded">
              <span className="text-cyan-300 font-bold">{camMeta.label} [{camMeta.sensor}]</span>
              <span>LAT {data?.lat} / LON {data?.lon}</span>
            </div>
          </>
        ) : (
          <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between text-[9px] font-mono text-cyan-300 bg-slate-950/80 px-1.5 py-0.5 rounded">
            <span>{camMeta.short}</span>
            <span>{camMeta.sensor}</span>
          </div>
        )}
      </div>
    );
  };

  const isHumanControl = data?.authority === 'HUMAN_OPERATOR';

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-200 flex flex-col">
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center">
            <Plane className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold tracking-wider text-sm text-white">GCS // H2-VALKYRIE</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {connected ? 'ENLACE ACTIVO' : 'CONECTANDO...'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Misión Transcontinental: Arica → Punta Arenas (~4,200 km)</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase">Autoridad:</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            data?.authority === 'HUMAN_OPERATOR' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
            data?.authority === 'SAFETY_OVERRIDE' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
            'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
          }`}>
            {data?.authority || 'INIT'} ({data?.mode || 'STANDBY'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {data?.mode === 'STANDBY' ? (
            <button
              onClick={() => sendCmd({ action: 'START_MISSION' })}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-900/40 cursor-pointer"
            >
              <Play className="w-4 h-4" /> INICIAR DESPEGUE AUTÓNOMO
            </button>
          ) : (
            <>
              <button
                onClick={() => sendCmd({ action: 'SET_MODE', mode: isHumanControl ? 'AUTONOMOUS' : 'ASSISTED' })}
                className={`font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer shadow-lg ${
                  isHumanControl
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/40'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-900/40'
                }`}
              >
                <Hand className="w-4 h-4" />
                {isHumanControl ? 'DEVOLVER A MODO AUTÓNOMO' : 'TOMAR CONTROL (INTERVENCIÓN)'}
              </button>

              {isHumanControl && (
                <button
                  onClick={() => sendCmd({ action: 'SET_MODE', mode: data?.mode === 'MANUAL' ? 'ASSISTED' : 'MANUAL' })}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs px-3 py-2 rounded-lg cursor-pointer"
                >
                  Modo: {data?.mode}
                </button>
              )}
            </>
          )}

          <button
            onClick={() => sendCmd({ action: 'SET_MODE', mode: 'FAILSAFE' })}
            className="bg-red-600/90 hover:bg-red-500 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
            title="Ejecutar protocolo de emergencia inmediata"
          >
            <ShieldAlert className="w-4 h-4" /> FAILSAFE
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3">
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* PANEL DE 7 CÁMARAS */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Camera className="w-4 h-4" /> SISTEMA ÓPTICO (7 CÁMARAS)
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveCam('MULTI_7')}
                  className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer ${
                    activeCam === 'MULTI_7' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="Ver las 7 cámaras simultáneamente (Tecla 0)"
                >
                  <Grid className="w-3 h-3" /> 7-CAM
                </button>
                <button
                  onClick={() => setRecording(!recording)}
                  className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${recording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}
                >
                  {recording ? '● REC' : 'REC'}
                </button>
              </div>
            </div>

            {/* Selector rápido de las 7 cámaras (Teclas 1-7) */}
            <div className="px-2 py-1.5 bg-slate-950/90 border-b border-slate-800 grid grid-cols-4 gap-1">
              {CAMERAS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCam(c.id)}
                  className={`text-[10px] py-1 px-1.5 rounded font-mono truncate cursor-pointer transition ${
                    activeCam === c.id
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {c.short}
                </button>
              ))}
              <button
                onClick={() => setActiveCam('MULTI_7')}
                className={`text-[10px] py-1 px-1.5 rounded font-mono truncate cursor-pointer transition ${
                  activeCam === 'MULTI_7'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800/90 text-amber-300 hover:bg-slate-700'
                }`}
              >
                0. TODAS
              </button>
            </div>

            {/* Visor Principal o Mosaico de 7 Cámaras */}
            <div className="relative h-64 bg-slate-950">
              {activeCam === 'MULTI_7' ? (
                <div className="w-full h-full grid grid-cols-3 grid-rows-3 gap-1 p-1">
                  {CAMERAS.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setActiveCam(c.id)}
                      className="cursor-pointer border border-slate-800 hover:border-cyan-400 rounded overflow-hidden"
                      title={`Clic para ampliar ${c.label}`}
                    >
                      {renderCameraViewport(c.id, true)}
                    </div>
                  ))}
                  <div className="col-span-2 bg-slate-900/90 border border-slate-800 rounded p-2 flex flex-col justify-center text-[10px] font-mono text-slate-300">
                    <div className="text-cyan-400 font-bold">TELEMETRÍA MULTICÁMARA</div>
                    <div>HDG {data?.heading ?? 0}° | ALT {data?.alt ?? 0}m | SPD {data?.speed ?? 0}km/h</div>
                    <div className="text-slate-400">Clic en cualquier cámara o teclas 1–7 para ampliar</div>
                  </div>
                </div>
              ) : (
                renderCameraViewport(activeCam, false)
              )}
            </div>

            {/* Controles de vuelo manual */}
            <div className="p-3 bg-slate-950/70 border-t border-slate-800">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-semibold text-slate-400">CONTROLES DE VUELO (W/A/S/D + Q/E | Cámaras 1-7)</span>
                <span className={`text-[10px] px-2 py-0.5 rounded ${isHumanControl ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
                  {isHumanControl ? 'ACTIVO' : 'BLOQUEADO EN AUTO'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dthrottle: 5 })} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-1.5 rounded cursor-pointer">+ POTENCIA (E)</button>
                <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dpitch: 2 })} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-1.5 rounded cursor-pointer">CABECEAR + (W)</button>
                <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dthrottle: -5 })} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-1.5 rounded cursor-pointer">- POTENCIA (Q)</button>
                <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', droll: -4 })} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-1.5 rounded cursor-pointer">ALABEO IZQ (A)</button>
                <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', dpitch: -2 })} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-1.5 rounded cursor-pointer">PICAR - (S)</button>
                <button disabled={!isHumanControl} onClick={() => sendCmd({ action: 'MANUAL_INPUT', droll: 4 })} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-1.5 rounded cursor-pointer">ALABEO DER (D)</button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Flame className="w-4 h-4" /> SISTEMA DE PROPULSIÓN HIDRÓGENO (H2)
              </h2>
              <span className="text-[11px] font-mono text-emerald-400">{data?.fuel_cell_kw ?? 0} kW</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">PRESIÓN TANQUE H2</div>
                <div className="text-base font-bold font-mono text-cyan-300">{data?.h2_pressure_bar ?? 700} bar</div>
                <div className="text-[10px] text-slate-500">Masa: {data?.h2_mass_kg ?? 6.5} kg</div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">TEMP. CELDA PEM</div>
                <div className={`text-base font-bold font-mono ${(data?.fuel_cell_temp ?? 0) > 80 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {data?.fuel_cell_temp ?? 28} °C
                </div>
                <div className="text-[10px] text-slate-500">Límite: 85.0 °C</div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">BATERÍA HÍBRIDA (SoC)</div>
                <div className="text-base font-bold font-mono text-amber-300">{data?.battery_soc ?? 100}%</div>
                <div className="text-[10px] text-slate-500">{data?.battery_voltage ?? 50.4} V</div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">ENLACE & SATÉLITES</div>
                <div className="text-base font-bold font-mono text-emerald-400">{data?.gps_sats ?? 18} SAT</div>
                <div className="text-[10px] text-slate-500">RF/Satcom OK</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col flex-1 min-h-[420px]">
            <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Navigation className="w-4 h-4" /> MAPA TÁCTICO (Clic en mapa = Añadir Waypoint)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => sendCmd({ action: 'TOGGLE_PAUSE' })}
                  className="bg-slate-800 hover:bg-slate-700 text-xs px-2.5 py-1 rounded flex items-center gap-1 cursor-pointer"
                >
                  {data?.mission_paused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
                  {data?.mission_paused ? 'Reanudar' : 'Pausar (Órbita)'}
                </button>
                <select
                  value={data?.sim_speed || 25}
                  onChange={(e) => sendCmd({ action: 'SET_SIM_SPEED', speed: Number(e.target.value) })}
                  className="bg-slate-800 text-xs px-2 py-1 rounded border border-slate-700"
                  title="Velocidad de simulación"
                >
                  <option value={1}>Sim 1x (Real)</option>
                  <option value={25}>Sim 25x</option>
                  <option value={100}>Sim 100x (Cruce rápido)</option>
                </select>
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full flex-1 min-h-[340px] z-10" />

            <div className="p-2.5 bg-slate-950 border-t border-slate-800 max-h-40 overflow-y-auto">
              <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5">Plan de Vuelo Activo (Validado por Safety Guardian)</div>
              <div className="space-y-1">
                {data?.waypoints.map((wp, idx) => (
                  <div
                    key={wp.id}
                    className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                      idx === data.current_wp_idx ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-200' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    <span className="truncate font-medium">{wp.name}</span>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span>{wp.alt}m</span>
                      <span>{wp.speed}km/h</span>
                      <button
                        onClick={() => sendCmd({ action: 'UPDATE_WAYPOINT', idx, alt: wp.alt + 500, speed: wp.speed })}
                        className="bg-slate-800 hover:bg-slate-700 px-1.5 rounded text-cyan-400 cursor-pointer"
                        title="Subir altitud +500m"
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

        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" /> COPILOTO IA (MODO ASESOR)
              </h2>
              <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">SIN AUTORIDAD DIRECTA</span>
            </div>
            <p className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              {data?.ai_recommendation || 'Análisis continuo: Eficiencia de pila de combustible óptima. Perfil aerodinámico estable sobre cordillera.'}
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
            <h2 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" /> PRUEBAS DE SEGURIDAD Y FALLOS
            </h2>
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <button
                onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'COMMS_LOSS' })}
                className="bg-slate-800 hover:bg-red-950/60 border border-slate-700 hover:border-red-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
              >
                1. Simular Pérdida de Comunicaciones
              </button>
              <button
                onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'H2_LEAK' })}
                className="bg-slate-800 hover:bg-red-950/60 border border-slate-700 hover:border-red-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
              >
                2. Simular Caída Presión Hidrógeno
              </button>
              <button
                onClick={() => sendCmd({ action: 'INJECT_FAULT', fault: 'THERMAL_SPIKE' })}
                className="bg-slate-800 hover:bg-amber-950/60 border border-slate-700 hover:border-amber-500/50 text-left px-3 py-1.5 rounded cursor-pointer"
              >
                3. Simular Sobretemperatura Celda H2
              </button>
              <button
                onClick={() => sendCmd({ action: 'RESET_SIM' })}
                className="bg-slate-800 hover:bg-slate-700 text-cyan-300 flex items-center justify-center gap-1.5 py-1.5 rounded mt-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reiniciar Simulación en Arica
              </button>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> BITÁCORA Y CAJA NEGRA
              </h2>
              <button
                onClick={downloadBlackbox}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-400 px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" /> Exportar JSON
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-56 pr-1">
              {data?.alerts.length === 0 && (
                <div className="text-xs text-slate-500 italic">Sin alertas activas. Listo para despegue.</div>
              )}
              {data?.alerts.map((al, i) => (
                <div
                  key={i}
                  className={`text-[11px] p-2 rounded border ${
                    al.level === 'CRIT'
                      ? 'bg-red-950/50 border-red-500/40 text-red-200'
                      : al.level === 'WARN'
                      ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
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