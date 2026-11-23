import { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert, Flame, Navigation,
  Play, Pause, RotateCcw, AlertTriangle, Camera, Download, Cpu,
  Hand, Plane, Sliders
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

export default function App() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [camMode, setCamMode] = useState<'FRONT' | 'DOWN' | 'SPLIT'>('FRONT');
  const [recording, setRecording] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Referencias del mapa Leaflet
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

  // Conexión WebSocket con reconexión automática
  useEffect(() => {
    let timer: any;
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

  // Controles de teclado en Modo Manual / Asistido
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
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

  // Inicializar Mapa Táctico de Chile
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-35.5, -71.0],
      zoom: 4,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);

    // Geofence nacional visual
    L.rectangle([[-56.0, -76.0], [-17.5, -66.5]], {
      color: '#ef4444',
      weight: 1,
      dashArray: '6, 6',
      fillOpacity: 0.02,
    }).addTo(map);

    // Clic en el mapa para añadir Waypoint en vuelo
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
    routeLineRef.current = L.polyline([], { color: '#38bdf8', weight: 2, dashArray: '5,5' }).addTo(map);
    trailLineRef.current = L.polyline([], { color: '#10b981', weight: 3 }).addTo(map);
    mapRef.current = map;
  }, []);

  // Actualizar posición del UAV y rutas en el mapa
  useEffect(() => {
    if (!data || !mapRef.current) return;

    const planeIcon = L.divIcon({
      className: 'custom-uav-icon',
      html: `<div style="transform: rotate(${data.heading}deg); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="#38bdf8" stroke="#0f172a" stroke-width="1.5">
          <path d="M12 2L15 10L22 14L14 15L13 21L12 19L11 21L10 15L2 14L9 10L12 2Z"/>
        </svg>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
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
        radius: isCurrent ? 7 : 4,
        color: isCurrent ? '#f59e0b' : '#38bdf8',
        fillColor: isCurrent ? '#f59e0b' : '#0284c7',
        fillOpacity: 0.9,
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

  const isHumanControl = data?.authority === 'HUMAN_OPERATOR';

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-200 flex flex-col">
      {/* BARRA SUPERIOR DE AUTORIDAD Y CONTROL CRÍTICO */}
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

        {/* INDICADOR DE AUTORIDAD EN TIEMPO REAL */}
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

        {/* BOTÓN PROMINENTE DE INTERVENCIÓN HUMANA (MANUAL <-> AUTÓNOMO) */}
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

      {/* CUERPO PRINCIPAL DE LA ESTACIÓN DE CONTROL */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3">
        
        {/* COLUMNA IZQUIERDA (4 cols): CÁMARA CON HUD + HORIZONTE ARTIFICIAL + CONTROLES */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* SISTEMA MULTICÁMARA CON OSD SUPERPUESTO */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Camera className="w-4 h-4" /> VISOR ELECTRO-ÓPTICO / HUD
              </div>
              <div className="flex items-center gap-1">
                {(['FRONT', 'DOWN', 'SPLIT'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setCamMode(m)}
                    className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${camMode === m ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    {m === 'FRONT' ? 'FRONTAL' : m === 'DOWN' ? 'INFERIOR' : 'DIVIDIDA'}
                  </button>
                ))}
                <button
                  onClick={() => setRecording(!recording)}
                  className={`text-[10px] px-2 py-0.5 rounded ml-1 cursor-pointer ${recording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}
                >
                  {recording ? '● REC' : 'REC'}
                </button>
              </div>
            </div>

            {/* VENTANA DE CÁMARA + HORIZONTE ARTIFICIAL */}
            <div className="relative h-64 bg-gradient-to-b from-sky-950 via-slate-900 to-amber-950/60 overflow-hidden select-none">
              {/* Horizonte Artificial Dinámico */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-150"
                style={{
                  transform: `rotate(${-(data?.roll || 0)}deg) translateY(${(data?.pitch || 0) * 3}px)`,
                }}
              >
                <div className="w-[150%] h-0.5 bg-emerald-400/70 shadow-[0_0_8px_#34d399]" />
              </div>

              {/* Retícula Central Aeronáutica */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-28 h-28 border border-emerald-500/30 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 border-2 border-amber-400 rounded-full" />
                </div>
              </div>

              {/* Superposición OSD (On-Screen Display) */}
              <div className="absolute top-2 left-3 text-[11px] font-mono text-emerald-400 space-y-0.5">
                <div>SPD: {data?.speed ?? 0} KM/H</div>
                <div>ALT: {data?.alt ?? 0} M</div>
                <div>V/S: {data?.vspeed ?? 0} M/S</div>
              </div>
              <div className="absolute top-2 right-3 text-[11px] font-mono text-emerald-400 text-right space-y-0.5">
                <div>HDG: {data?.heading ?? 0}°</div>
                <div>PIT: {data?.pitch ?? 0}° | ROL: {data?.roll ?? 0}°</div>
                <div>THR: {data?.throttle ?? 0}%</div>
              </div>
              <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] font-mono text-slate-300 bg-slate-950/60 px-2 py-1 rounded">
                <span>CAM: {camMode}</span>
                <span>LAT {data?.lat} / LON {data?.lon}</span>
              </div>
            </div>

            {/* PANEL DE PILOTAGE MANUAL (ACTIVO EN MODO MANUAL/ASISTIDO) */}
            <div className="p-3 bg-slate-950/70 border-t border-slate-800">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-semibold text-slate-400">CONTROLES DE VUELO (Teclas W/A/S/D + Q/E)</span>
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

          {/* TELEMETRÍA PROPULSIÓN HIDRÓGENO (CELDA PEM + BATERÍA HÍBRIDA) */}
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

        {/* COLUMNA CENTRAL (5 cols): MAPA TÁCTICO EN TIEMPO REAL + PLAN DE VUELO */}
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

            {/* LISTA DE WAYPOINTS MODIFICABLE EN VUELO */}
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

        {/* COLUMNA DERECHA (3 cols): ASISTENTE IA + INYECTOR DE FALLOS + CAJA NEGRA */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* MÓDULO DE INTELIGENCIA ARTIFICIAL (SUPERVISADO) */}
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

          {/* SIMULADOR DE ESCENARIOS Y FALLOS CRÍTICOS */}
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

          {/* ALERTAS Y CAJA NEGRA (REGISTRO DE AUDITORÍA) */}
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