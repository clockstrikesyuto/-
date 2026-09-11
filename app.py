from __future__ import annotations

import asyncio
import io
import random
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import qrcode
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
HTML = (ROOT / "index.html").read_text(encoding="utf-8")

app = FastAPI(title="ROUTE RUSH")


@dataclass
class Player:
    id: str
    token: str
    name: str
    connected: bool = True
    score: int = 0
    progress: float = 0.0


@dataclass
class Room:
    code: str
    host_token: str
    host_id: str
    rounds_total: int
    players: Dict[str, Player] = field(default_factory=dict)
    stage: str = "lobby"
    round_no: int = 0
    seed: int = 0
    winner_id: Optional[str] = None
    countdown_until: float = 0.0
    next_round_at: float = 0.0
    last_active: float = field(default_factory=time.time)


rooms: Dict[str, Room] = {}
clients: Dict[str, list[dict]] = {}


class CreateRoom(BaseModel):
    name: str
    rounds: int = 3


class JoinRoom(BaseModel):
    name: str


def clean_name(name: str) -> str:
    value = " ".join((name or "").strip().split())
    if not value:
        raise HTTPException(400, "名前を入力してね")
    return value[:12]


def new_code() -> str:
    for _ in range(1000):
        code = f"{random.randint(0, 9999):04d}"
        if code not in rooms:
            return code
    raise HTTPException(503, "部屋を作れませんでした")


def public_state(room: Room, viewer_id: Optional[str], is_host: bool) -> dict:
    return {
        "type": "state",
        "code": room.code,
        "stage": room.stage,
        "round_no": room.round_no,
        "rounds_total": room.rounds_total,
        "seed": room.seed,
        "winner_id": room.winner_id,
        "countdown_ms": max(0, int((room.countdown_until - time.time()) * 1000)),
        "next_round_ms": max(0, int((room.next_round_at - time.time()) * 1000)),
        "player_id": viewer_id,
        "host_player_id": room.host_id,
        "is_host": is_host,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "connected": p.connected,
                "score": p.score,
                "progress": round(p.progress, 1),
            }
            for p in room.players.values()
        ],
    }


async def broadcast(code: str):
    room = rooms.get(code)
    if not room:
        return
    dead = []
    for client in list(clients.get(code, [])):
        try:
            await client["ws"].send_json(public_state(room, client["player_id"], client["is_host"]))
        except Exception:
            dead.append(client)
    if dead:
        clients[code] = [c for c in clients.get(code, []) if c not in dead]


def prepare_round(room: Room):
    room.round_no += 1
    room.seed = secrets.randbits(31)
    room.winner_id = None
    for p in room.players.values():
        p.progress = 0.0
    room.stage = "countdown"
    room.countdown_until = time.time() + 3.0
    room.next_round_at = 0.0


def begin_match(room: Room):
    room.round_no = 0
    room.winner_id = None
    for p in room.players.values():
        p.score = 0
        p.progress = 0.0
    prepare_round(room)


async def ticker():
    while True:
        now = time.time()
        for code, room in list(rooms.items()):
            if room.stage == "countdown" and now >= room.countdown_until:
                room.stage = "playing"
                await broadcast(code)
            elif room.stage == "round_result" and room.next_round_at and now >= room.next_round_at:
                prepare_round(room)
                await broadcast(code)
            if now - room.last_active > 60 * 60 * 4:
                rooms.pop(code, None)
                clients.pop(code, None)
        await asyncio.sleep(0.1)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(ticker())


@app.get("/", response_class=HTMLResponse)
@app.get("/host/{code}", response_class=HTMLResponse)
@app.get("/join/{code}", response_class=HTMLResponse)
async def page(code: Optional[str] = None):
    return HTMLResponse(HTML)


@app.get("/qr")
async def qr(url: str):
    image = qrcode.make(url)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")


@app.post("/api/rooms")
async def create_room(data: CreateRoom, req: Request):
    name = clean_name(data.name)
    rounds = data.rounds if data.rounds in (3, 5) else 3
    code = new_code()
    pid = secrets.token_hex(8)
    player_token = secrets.token_urlsafe(22)
    host_token = secrets.token_urlsafe(24)
    player = Player(pid, player_token, name)
    room = Room(code=code, host_token=host_token, host_id=pid, rounds_total=rounds, players={pid: player})
    rooms[code] = room
    clients[code] = []

    proto = req.headers.get("x-forwarded-proto") or req.url.scheme
    host = req.headers.get("x-forwarded-host") or req.headers.get("host") or req.url.netloc
    origin = f"{proto}://{host}".rstrip("/")
    return {
        "code": code,
        "player_id": pid,
        "player_token": player_token,
        "host_token": host_token,
        "host_url": f"{origin}/host/{code}#host={host_token}&player={player_token}",
        "join_url": f"{origin}/join/{code}",
    }


@app.post("/api/rooms/{code}/join")
async def join_room(code: str, data: JoinRoom):
    room = rooms.get(code)
    if not room:
        raise HTTPException(404, "部屋が見つかりません")
    if room.stage != "lobby":
        raise HTTPException(409, "このゲームはもう始まっています")
    if len(room.players) >= 2:
        raise HTTPException(409, "この部屋は2人で満員です")

    name = clean_name(data.name)
    pid = secrets.token_hex(8)
    token = secrets.token_urlsafe(22)
    room.players[pid] = Player(pid, token, name)
    room.last_active = time.time()
    await broadcast(code)
    return {"player_id": pid, "player_token": token}


@app.post("/api/rooms/{code}/start")
async def start_game(code: str, request: Request):
    room = rooms.get(code)
    if not room:
        raise HTTPException(404, "部屋が見つかりません")
    if request.headers.get("x-host-token", "") != room.host_token:
        raise HTTPException(403, "ホストだけが開始できます")
    if room.stage != "lobby":
        raise HTTPException(409, "今は開始できません")
    if len(room.players) != 2:
        raise HTTPException(409, "2人そろってから開始してね")
    begin_match(room)
    room.last_active = time.time()
    await broadcast(code)
    return {"ok": True}


@app.post("/api/rooms/{code}/rematch")
async def rematch(code: str, request: Request):
    room = rooms.get(code)
    if not room:
        raise HTTPException(404, "部屋が見つかりません")
    if request.headers.get("x-host-token", "") != room.host_token:
        raise HTTPException(403, "ホストだけが再戦できます")
    if room.stage != "final_result":
        raise HTTPException(409, "まだ再戦できません")
    begin_match(room)
    room.last_active = time.time()
    await broadcast(code)
    return {"ok": True}


@app.websocket("/ws/{code}")
async def ws_room(ws: WebSocket, code: str, player: str, token: str, host: str = ""):
    room = rooms.get(code)
    if not room or player not in room.players or room.players[player].token != token:
        await ws.close(code=4403)
        return

    is_host = bool(host and host == room.host_token and player == room.host_id)
    await ws.accept()
    room.players[player].connected = True
    entry = {"ws": ws, "player_id": player, "is_host": is_host}
    clients.setdefault(code, []).append(entry)
    room.last_active = time.time()
    await broadcast(code)

    try:
        while True:
            msg = await ws.receive_json()
            room = rooms.get(code)
            if not room:
                break
            room.last_active = time.time()
            p = room.players.get(player)
            if not p:
                continue

            if msg.get("type") == "progress" and room.stage == "playing":
                try:
                    value = float(msg.get("value", 0))
                except Exception:
                    continue
                p.progress = max(0.0, min(99.5, value))
                await broadcast(code)

            elif msg.get("type") == "finish" and room.stage == "playing":
                p.progress = 100.0
                room.winner_id = player
                p.score += 1
                if room.round_no >= room.rounds_total:
                    room.stage = "final_result"
                else:
                    room.stage = "round_result"
                    room.next_round_at = time.time() + 3.6
                await broadcast(code)

    except WebSocketDisconnect:
        pass
    finally:
        if code in clients:
            clients[code] = [c for c in clients[code] if c is not entry]
        room = rooms.get(code)
        if room and player in room.players:
            room.players[player].connected = False
            await broadcast(code)
