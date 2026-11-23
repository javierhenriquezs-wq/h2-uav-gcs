from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import json
import math
import time

app = FastAPI(title="H2-Valkyrie GCS Core v2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Límites físicos y envolvente de seguridad del H2-Valkyrie
SAFETY_LIMITS = {
    "min_alt": 150.0,       # metros AGL
    "max_alt": 12000.0,     # metros (techo de servicio)
    "min_speed": 65.0,      # km/h (velocidad de pérdida / stall)
    "max_speed": 320.0,     # km/h (VNE)
    "min_h2_bar": 35.0,     # bar (reserva crítica para RTH/aterrizaje)
    "max_fc_temp": 85.0,    # °C (límite térmico celda PEM)
    "geofence": {
        "lat_min": -56.0,   # Cabo de Hornos
        "lat_max": -17.5,   # Frontera Norte Arica
        "lon_min": -76.0,   # Pacífico
        "lon_max": -66.5    # Cordillera de los Andes
    }
}

# Ruta transcontinental por defecto: Arica -> Punta Arenas (~4,200 km)
DEFAULT_WAYPOINTS = [
    {"id": 1, "name": "WP1 - ARICA (Despegue)", "lat": -18.4783, "lon": -70.3126, "alt": 1500, "speed": 180},
    {"id": 2, "name": "WP2 - IQUIQUE", "lat": -20.2133, "lon": -70.1503, "alt": 3500, "speed": 220},
    {"id": 3, "name": "WP3 - ANTOFAGASTA", "lat": -23.6509, "lon": -70.3975, "alt": 4500, "speed": 240},
    {"id": 4, "name": "WP4 - COPIAPÓ", "lat": -27.3668, "lon": -70.3322, "alt": 5000, "speed": 250},
    {"id": 5, "name": "WP5 - LA SERENA", "lat": -29.9027, "lon": -71.2519, "alt": 4800, "speed": 245},
    {"id": 6, "name": "WP6 - SANTIAGO", "lat": -33.4489, "lon": -70.6693, "alt": 5500, "speed": 250},
    {"id": 7, "name": "WP7 - CONCEPCIÓN", "lat": -36.8201, "lon": -73.0444, "alt": 4200, "speed": 235},
    {"id": 8, "name": "WP8 - PUERTO MONTT", "lat": -41.4693, "lon": -72.9424, "alt": 3800, "speed": 230},
    {"id": 9, "name": "WP9 - COYHAIQUE", "lat": -45.5752, "lon": -72.0662, "alt": 4500, "speed": 240},
    {"id": 10, "name": "WP10 - PUNTA ARENAS (Aterrizaje)", "lat": -53.1638, "lon": -70.9171, "alt": 800, "speed": 140}
]

class FlightEngine:
    def __init__(self):
        self.reset()

    def reset(self):
        self.mode = "STANDBY"          # STANDBY, PREFLIGHT, TAKEOFF, AUTONOMOUS, MANUAL, ASSISTED, FAILSAFE, LANDING
        self.authority = "AUTOPILOT"   # AUTOPILOT, HUMAN_OPERATOR, SAFETY_OVERRIDE
        self.mission_paused = False
        self.sim_speed_multiplier = 25.0  # Aceleración temporal para probar el cruce del país en minutos
        self.waypoints = [wp.copy() for wp in DEFAULT_WAYPOINTS]
        self.current_wp_idx = 0
        
        # Posición y actitud inicial (Arica)
        self.lat = self.waypoints[0]["lat"]
        self.lon = self.waypoints[0]["lon"]
        self.alt = 0.0
        self.speed = 0.0
        self.vspeed = 0.0
        self.heading = 180.0
        self.pitch = 0.0
        self.roll = 0.0
        self.throttle = 0.0
        
        # Sistema de propulsión de Hidrógeno (Celda PEM + Batería Tampón)
        self.h2_pressure_bar = 700.0   # Tanque compuesto Tipo IV a 700 bar
        self.h2_mass_kg = 6.5          # 6.5 kg de H2 (~216 kWh químicos)
        self.fuel_cell_kw = 0.0
        self.fuel_cell_temp = 28.0
        self.battery_soc = 100.0
        self.battery_voltage = 50.4
        self.battery_current = 2.1
        
        # Enlace y sensores
        self.comms_ok = True
        self.gps_sats = 18
        self.pitot_ok = True
        self.alerts = []
        self.ai_recommendation = None
        self.trail = [[self.lat, self.lon]]
        self.blackbox_logs = []

    def log_event(self, level: str, msg: str):
        entry = {"ts": round(time.time(), 2), "level": level, "msg": msg, "mode": self.mode}
        self.alerts.insert(0, entry)
        self.alerts = self.alerts[:25]
        self.blackbox_logs.append(entry)

    def validate_waypoint(self, wp: dict) -> tuple[bool, str]:
        gf = SAFETY_LIMITS["geofence"]
        if not (gf["lat_min"] <= wp["lat"] <= gf["lat_max"] and gf["lon_min"] <= wp["lon"] <= gf["lon_max"]):
            return False, "BLOQUEO SAFETY GUARDIAN: Coordenadas fuera del Geofence nacional."
        if not (SAFETY_LIMITS["min_alt"] <= wp["alt"] <= SAFETY_LIMITS["max_alt"]):
            return False, f"BLOQUEO SAFETY GUARDIAN: Altitud debe estar entre {SAFETY_LIMITS['min_alt']}m y {SAFETY_LIMITS['max_alt']}m."
        if not (SAFETY_LIMITS["min_speed"] <= wp["speed"] <= SAFETY_LIMITS["max_speed"]):
            return False, f"BLOQUEO SAFETY GUARDIAN: Velocidad debe estar entre {SAFETY_LIMITS['min_speed']} y {SAFETY_LIMITS['max_speed']} km/h."
        return True, "OK"

    def set_mode(self, new_mode: str):
        if new_mode == self.mode:
            return
        old_mode = self.mode
        self.mode = new_mode
        if new_mode in ["MANUAL", "ASSISTED"]:
            self.authority = "HUMAN_OPERATOR"
            self.log_event("WARN", f"INTERVENCIÓN OPERADOR: Control transferido a modo {new_mode} (Trimado estabilizado).")
        elif new_mode == "AUTONOMOUS":
            self.authority = "AUTOPILOT"
            # Al volver de manual, calcular intercepción suave sin saltos bruscos
            self.roll = 0.0
            self.pitch = 2.0
            self.log_event("INFO", f"AUTONOMÍA REANUDADA desde {old_mode}: Calculando trayectoria de intercepción al WP{self.current_wp_idx + 1}.")
        elif new_mode == "FAILSAFE":
            self.authority = "SAFETY_OVERRIDE"
            self.log_event("CRIT", "MODO FAILSAFE ACTIVADO: Ejecutando protocolo de órbita segura / descenso controlado.")

    def step(self, dt: float):
        eff_dt = dt * self.sim_speed_multiplier

        # 1. Verificación independiente del Safety Guardian
        if self.mode not in ["STANDBY", "FAILSAFE"]:
            if not self.comms_ok:
                self.log_event("CRIT", "PÉRDIDA DE ENLACE RF/SATCOM: Activando Failsafe autónomo.")
                self.set_mode("FAILSAFE")
            elif self.h2_pressure_bar < SAFETY_LIMITS["min_h2_bar"]:
                self.log_event("CRIT", f"PRESIÓN H2 CRÍTICA ({self.h2_pressure_bar:.1f} bar): Iniciando aterrizaje de emergencia.")
                self.set_mode("FAILSAFE")
            elif self.fuel_cell_temp > SAFETY_LIMITS["max_fc_temp"]:
                self.ai_recommendation = "IA ALERTA TÉRMICA: Reducir potencia de pila H2 al 60% y descender 800m para enfriamiento."

        # 2. Física según estado
        if self.mode == "STANDBY":
            self.speed = 0.0
            self.vspeed = 0.0
            self.fuel_cell_kw = 0.4
            self.fuel_cell_temp = max(25.0, self.fuel_cell_temp - 0.1 * dt)

        elif self.mode == "TAKEOFF":
            self.throttle = 95.0
            self.pitch = 12.0
            self.roll = 0.0
            self.speed = min(180.0, self.speed + 18.0 * dt)
            if self.speed > 95.0:
                self.vspeed = 12.0
                self.alt += self.vspeed * dt * 5.0
            if self.alt >= self.waypoints[0]["alt"]:
                self.log_event("INFO", "Altitud de crucero inicial alcanzada. Transicionando a navegación autónoma.")
                self.set_mode("AUTONOMOUS")

        elif self.mode == "AUTONOMOUS":
            if self.mission_paused:
                # Patrón de espera circular (Loiter) para aeronave de ala fija
                self.roll = 22.0
                self.heading = (self.heading + 4.5 * dt) % 360
                self.vspeed = 0.0
            else:
                target = self.waypoints[self.current_wp_idx]
                dlat = target["lat"] - self.lat
                dlon = target["lon"] - self.lon
                dist_deg = math.hypot(dlat, dlon)
                dist_km = dist_deg * 111.0

                # Rumbo deseado hacia el waypoint
                desired_hdg = (math.degrees(math.atan2(dlon, dlat)) + 360) % 360
                hdg_diff = (desired_hdg - self.heading + 540) % 360 - 180
                self.roll = max(-28.0, min(28.0, hdg_diff * 0.8))
                self.heading = (self.heading + hdg_diff * min(1.0, 2.5 * dt)) % 360

                # Control de altitud y velocidad
                alt_diff = target["alt"] - self.alt
                self.vspeed = max(-15.0, min(15.0, alt_diff * 0.15))
                self.alt += self.vspeed * eff_dt * 0.2
                self.pitch = max(-12.0, min(15.0, self.vspeed * 0.6))
                self.speed += (target["speed"] - self.speed) * min(1.0, 1.5 * dt)
                self.throttle = 68.0

                # Verificar llegada a Waypoint
                if dist_km < 18.0:
                    if self.current_wp_idx < len(self.waypoints) - 1:
                        self.log_event("INFO", f"Waypoint alcanzado: {target['name']}. Procediendo a {self.waypoints[self.current_wp_idx+1]['name']}.")
                        self.current_wp_idx += 1
                    else:
                        self.log_event("INFO", "Destino final Punta Arenas alcanzado. Iniciando aproximación y aterrizaje autónomo.")
                        self.set_mode("LANDING")

        elif self.mode in ["MANUAL", "ASSISTED"]:
            # En modo asistido el sistema limita alabeo/cabeceo extremos y protege contra pérdida
            if self.mode == "ASSISTED":
                self.roll = max(-35.0, min(35.0, self.roll))
                self.pitch = max(-18.0, min(20.0, self.pitch))
                if self.speed < SAFETY_LIMITS["min_speed"] + 10:
                    self.throttle = max(self.throttle, 75.0)
                    self.pitch = min(self.pitch, 2.0)
            self.heading = (self.heading + (self.roll * 0.45) * dt) % 360
            target_speed = 65.0 + (self.throttle / 100.0) * 245.0
            self.speed += (target_speed - self.speed) * dt
            self.vspeed = math.sin(math.radians(self.pitch)) * (self.speed / 3.6)
            self.alt = max(SAFETY_LIMITS["min_alt"] if self.mode == "ASSISTED" else 0.0, self.alt + self.vspeed * eff_dt * 0.2)

        elif self.mode in ["FAILSAFE", "LANDING"]:
            self.roll = 18.0 if self.mode == "FAILSAFE" else 0.0
            if self.mode == "FAILSAFE":
                self.heading = (self.heading + 3.0 * dt) % 360
            self.pitch = -4.5
            self.vspeed = -6.0
            self.alt = max(0.0, self.alt + self.vspeed * eff_dt * 0.3)
            self.speed = max(110.0, self.speed - 2.0 * dt)
            if self.alt <= 1.0:
                self.alt = 0.0
                self.speed = 0.0
                self.throttle = 0.0
                self.mode = "STANDBY"
                self.authority = "AUTOPILOT"
                self.log_event("INFO", "Aeronave en tierra. Celda de combustible de hidrógeno purgada y segura.")

        # 3. Cinemática de posición geográfica y consumo de Hidrógeno
        if self.speed > 5.0:
            dist_km_step = (self.speed / 3600.0) * eff_dt
            rad = math.radians(self.heading)
            self.lat += (math.cos(rad) * dist_km_step) / 111.0
            self.lon += (math.sin(rad) * dist_km_step) / (111.0 * max(0.2, math.cos(math.radians(self.lat))))

            # Guardar traza cada cierta distancia
            if math.hypot(self.lat - self.trail[-1][0], self.lon - self.trail[-1][1]) > 0.08:
                self.trail.append([round(self.lat, 5), round(self.lon, 5)])
                if len(self.trail) > 600:
                    self.trail.pop(0)

            # Consumo de hidrógeno y balance híbrido
            power_demand_kw = 4.5 + (self.throttle / 100.0) * 14.0 + max(0, self.vspeed * 0.4)
            self.fuel_cell_kw = round(power_demand_kw, 2)
            # Eficiencia celda PEM (~55%): ~0.055 kg H2 por kWh
            h2_consumed_kg = (power_demand_kw * (eff_dt / 3600.0)) * 0.055
            self.h2_mass_kg = max(0.0, self.h2_mass_kg - h2_consumed_kg)
            self.h2_pressure_bar = round((self.h2_mass_kg / 6.5) * 700.0, 1)
            self.fuel_cell_temp += ((48.0 + power_demand_kw * 1.4) - self.fuel_cell_temp) * 0.05 * dt

            if self.throttle > 85.0:
                self.battery_soc = max(15.0, self.battery_soc - 0.02 * eff_dt)
            else:
                self.battery_soc = min(100.0, self.battery_soc + 0.01 * eff_dt)

    def to_dict(self):
        return {
            "mode": self.mode,
            "authority": self.authority,
            "mission_paused": self.mission_paused,
            "sim_speed": self.sim_speed_multiplier,
            "lat": round(self.lat, 5),
            "lon": round(self.lon, 5),
            "alt": round(self.alt, 1),
            "speed": round(self.speed, 1),
            "vspeed": round(self.vspeed, 1),
            "heading": round(self.heading, 1),
            "pitch": round(self.pitch, 1),
            "roll": round(self.roll, 1),
            "throttle": round(self.throttle, 0),
            "h2_pressure_bar": self.h2_pressure_bar,
            "h2_mass_kg": round(self.h2_mass_kg, 3),
            "fuel_cell_kw": self.fuel_cell_kw,
            "fuel_cell_temp": round(self.fuel_cell_temp, 1),
            "battery_soc": round(self.battery_soc, 1),
            "battery_voltage": round(44.0 + (self.battery_soc / 100.0) * 6.4, 1),
            "comms_ok": self.comms_ok,
            "pitot_ok": self.pitot_ok,
            "gps_sats": self.gps_sats,
            "current_wp_idx": self.current_wp_idx,
            "waypoints": self.waypoints,
            "trail": self.trail,
            "alerts": self.alerts,
            "ai_recommendation": self.ai_recommendation,
            "limits": SAFETY_LIMITS
        }

engine = FlightEngine()

@app.get("/")
def root():
    return {"status": "ONLINE", "aircraft": "H2-Valkyrie", "route": "Arica -> Punta Arenas"}

@app.get("/api/blackbox")
def export_blackbox():
    return {"aircraft": "H2-Valkyrie", "total_records": len(engine.blackbox_logs), "logs": engine.blackbox_logs}

@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket):
    await websocket.accept()
    last_time = time.time()
    try:
        while True:
            now = time.time()
            dt = min(0.5, now - last_time)
            last_time = now
            engine.step(dt)
            await websocket.send_text(json.dumps(engine.to_dict()))

            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=0.15)
                cmd = json.loads(raw)
                act = cmd.get("action")

                if act == "START_MISSION":
                    engine.log_event("INFO", "Pre-Flight Check OK (Sensores, Celda H2 700 bar, Enlace Satcom). Iniciando despegue autónomo.")
                    engine.set_mode("TAKEOFF")
                elif act == "SET_MODE":
                    engine.set_mode(cmd["mode"])
                elif act == "TOGGLE_PAUSE":
                    engine.mission_paused = not engine.mission_paused
                    engine.log_event("INFO", "Misión PAUSADA (Órbita de espera activa)." if engine.mission_paused else "Misión REANUDADA.")
                elif act == "MANUAL_INPUT":
                    if engine.mode in ["MANUAL", "ASSISTED"]:
                        engine.pitch = max(-25.0, min(25.0, engine.pitch + cmd.get("dpitch", 0)))
                        engine.roll = max(-45.0, min(45.0, engine.roll + cmd.get("droll", 0)))
                        engine.throttle = max(0.0, min(100.0, engine.throttle + cmd.get("dthrottle", 0)))
                elif act == "ADD_WAYPOINT":
                    new_wp = {
                        "id": len(engine.waypoints) + 1,
                        "name": cmd.get("name", f"WP{len(engine.waypoints)+1} - CUSTOM"),
                        "lat": float(cmd["lat"]),
                        "lon": float(cmd["lon"]),
                        "alt": float(cmd.get("alt", 4000)),
                        "speed": float(cmd.get("speed", 230))
                    }
                    valid, reason = engine.validate_waypoint(new_wp)
                    if valid:
                        engine.waypoints.insert(engine.current_wp_idx + 1, new_wp)
                        engine.log_event("INFO", f"Waypoint añadido y validado: {new_wp['name']} ({new_wp['alt']}m).")
                    else:
                        engine.log_event("WARN", reason)
                elif act == "UPDATE_WAYPOINT":
                    idx = int(cmd["idx"])
                    if 0 <= idx < len(engine.waypoints):
                        candidate = {**engine.waypoints[idx], "alt": float(cmd["alt"]), "speed": float(cmd["speed"])}
                        valid, reason = engine.validate_waypoint(candidate)
                        if valid:
                            engine.waypoints[idx] = candidate
                            engine.log_event("INFO", f"Parámetros de {candidate['name']} actualizados en vuelo.")
                        else:
                            engine.log_event("WARN", reason)
                elif act == "SET_SIM_SPEED":
                    engine.sim_speed_multiplier = float(cmd["speed"])
                elif act == "INJECT_FAULT":
                    fault = cmd.get("fault")
                    if fault == "COMMS_LOSS":
                        engine.comms_ok = False
                    elif fault == "H2_LEAK":
                        engine.h2_mass_kg = 0.25
                        engine.h2_pressure_bar = 26.0
                        engine.log_event("CRIT", "SIMULACIÓN FALLO: Caída súbita de presión en tanque H2.")
                    elif fault == "THERMAL_SPIKE":
                        engine.fuel_cell_temp = 88.5
                        engine.log_event("WARN", "SIMULACIÓN FALLO: Sobretemperatura en pila de combustible PEM.")
                elif act == "RESET_SIM":
                    engine.reset()
                    engine.log_event("INFO", "Simulación reiniciada en Arica.")
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        pass