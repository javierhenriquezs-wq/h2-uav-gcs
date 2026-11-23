from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import math

app = FastAPI(title="H2-Valkyrie GCS Core")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uav_state = {
    "mode": "AUTONOMOUS",
    "authority": "AUTOPILOT",
    "lat": -18.4783,
    "lon": -70.3126,
    "alt": 2500.0,
    "speed": 145.0,
    "heading": 175.0,
    "pitch": 1.2,
    "roll": 0.0,
    "h2_pressure_bar": 348.5,
    "h2_remaining_kg": 4.2,
    "battery_soc": 98.0,
    "fuel_cell_temp": 64.5,
    "alerts": []
}

@app.get("/")
def health_check():
    return {"status": "ONLINE", "aircraft": "H2-Valkyrie", "protocol": "MAVLink-Ready"}

@app.websocket("/ws/telemetry")
async def telemetry_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            if uav_state["mode"] == "AUTONOMOUS":
                rad = math.radians(uav_state["heading"])
                uav_state["lat"] += math.cos(rad) * 0.0005
                uav_state["lon"] += math.sin(rad) * 0.0005
                uav_state["h2_pressure_bar"] = max(0, uav_state["h2_pressure_bar"] - 0.002)

            await websocket.send_text(json.dumps(uav_state))

            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.2)
                cmd = json.loads(data)
                if cmd.get("action") == "SET_MODE":
                    uav_state["mode"] = cmd["mode"]
                    uav_state["authority"] = "HUMAN_OPERATOR" if cmd["mode"] == "MANUAL" else "AUTOPILOT"
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        print("Operador desconectado")
