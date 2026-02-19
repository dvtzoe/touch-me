#!/usr/bin/env python3
import asyncio
import json
import threading
from contextlib import asynccontextmanager
from typing import NoReturn

import serial
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

SERIAL_PORT = "/dev/ttyUSB0"
BAUD_RATE = 9600

# Registry of active WebSocket connections
_clients: set[WebSocket] = set()
_clients_lock = asyncio.Lock()


async def broadcast(data: dict) -> None:
    msg = json.dumps(data)
    async with _clients_lock:
        dead: set[WebSocket] = set()
        for ws in _clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        _clients.difference_update(dead)


def _serial_reader(loop: asyncio.AbstractEventLoop) -> NoReturn:
    """Blocking serial read loop; runs in a daemon thread."""
    while True:
        try:
            ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
            print(f"[serial] Connected to {SERIAL_PORT}")
            while True:
                raw = ser.readline().decode("utf-8", errors="ignore").strip()
                if not raw:
                    continue
                parts = raw.split(",")
                if len(parts) != 2:
                    continue
                try:
                    touch_value = int(parts[0])
                    adc_raw = int(parts[1])
                    # ESP32 ADC 11 dB attenuation: 0–4095 → 0–3.3 V
                    voltage = round(adc_raw / 4095 * 3.3, 3)
                    asyncio.run_coroutine_threadsafe(
                        broadcast({"touch_value": touch_value, "voltage": voltage}),
                        loop,
                    )
                except ValueError:
                    pass
        except serial.SerialException as e:
            print(f"[serial] Error: {e}. Retrying in 2 s…")
            import time

            time.sleep(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    threading.Thread(target=_serial_reader, args=(loop,), daemon=True).start()
    yield


app = FastAPI(title="Touch Sensor Monitor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4321"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    async with _clients_lock:
        _clients.add(ws)
    try:
        while True:
            # Keep connection alive; client messages are ignored
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        async with _clients_lock:
            _clients.discard(ws)
