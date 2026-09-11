from __future__ import annotations

import asyncio
import random
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
BASE_HTML = (ROOT / "index.html").read_text(encoding="utf-8")
HOTFIX_CSS = (ROOT / "poko_hotfix.css").read_text(encoding="utf-8")
HOTFIX_JS = (ROOT / "poko_hotfix.js").read_text(encoding="utf-8")
HTML = BASE_HTML.replace("</style>", HOTFIX_CSS + "\n</style>", 1)
HTML = HTML.replace("</head>", f"<script>\n{HOTFIX_JS}\n</script>\n</head>", 1)

app = FastAPI(title="POKO SMASH")

MAX_PLAYERS = 4
GAME_SECONDS = 30.0
COUNTDOWN_SECONDS = 3.0


@dataclass
class Player:
    id: str
    token: str
    name: str
    connected: bool = True
    joined_at: float = field(default_factory=time.time)


@dataclass
class Score:
    score: int = 0
    hits: int = 0
    misses: int = 0
    best_combo: int = 0


@dataclass
class Match:
    id: str
    label: str
    players: List[str]
    seed: int


@dataclass
class Room:
    code: str
    host_token: str
    host_id: str
    players: Dict[str, Player] = field(default_factory=dict)
    stage: str = "lobby"
    tournament: bool = False
    round_kind: str = ""
    matches: List[Match] = field(default_factory=list)
    scores: Dict[str, Score] = field(default_factory=dict)
    semi_winners: List[str] = field(default_factory=list)
    champion_id: Optional[str] = None
    countdown_until: float = 0.0
    play_until: float = 0.0
    last_active: float = field(default_factory=time.time)


rooms: Dict[str, Room] = {}
clients: Dict[str, list[dict]] = {}


class CreateRoom(BaseModel):
    name: str


class JoinRoom(BaseModel):
    name: str


def clean_name(value: str) -> str:
    name = " ".join((value or "").strip().split())
    if not name:
        raise HTTPException(400, "名前を入力してね")
    return name[:14]


def new_code() -> str:
    for _ in range(1200):
        code = f"{random.randint(0, 9999):04d}"
        if code not in rooms:
            return code
    raise HTTPException(503, "部屋を作れませんでした")


def public_player(room: Room, p: Player) -> dict:
    s = room.scores.get(p.id, Score())
    return {
        "id": p.id,
        "name": p.name,
        "connected": p.connected,
        "is_host": p.id == room.host_id,
        "score": s.score,
        "hits": s.hits,
        "misses": s.misses,
        "best_combo": s.best_combo,
    }


def score_key(room: Room, pid: str):
    s = room.scores.get(pid, Score())
    # Score first, then fewer misses, then combo, then hits.
    return (s.score, -s.misses, s.best_combo, s.hits)


def winner_of(room: Room, ids: List[str]) -> str:
    return max(ids, key=lambda pid: score_key(room, pid))


def reset_scores(room: Room, ids: List[str]):
    room.scores = {pid: Score() for pid in ids}


def make_match(label: str, ids: List[str]) -> Match:
    return Match(
        id=secrets.token_hex(5),
        label=label,
        players=list(ids),
        seed=secrets.randbits(31),
    )


def prepare_countdown(room: Room):
    room.stage = "countdown"
    room.countdown_until = time.time() + COUNTDOWN_SECONDS
    room.play_until = room.countdown_until + GAME_SECONDS


def begin_game(room: Room):
    ids = list(room.players.keys())
    if len(ids) < 2:
        raise HTTPException(409, "2人以上で開始してね")
    room.tournament = len(ids) == 4
    room.semi_winners = []
    room.champion_id = None

    if len(ids) == 4:
        room.round_kind = "semifinal"
        room.matches = [
            make_match("準決勝 A", [ids[0], ids[1]]),
            make_match("準決勝 B", [ids[2], ids[3]]),
        ]
        reset_scores(room, ids)
    else:
        room.round_kind = "final"
        room.matches = [make_match("FINAL", ids)]
        reset_scores(room, ids)
    prepare_countdown(room)


def begin_final(room: Room):
    if not room.tournament or len(room.semi_winners) != 2:
        raise HTTPException(409, "決勝には進めません")
    room.round_kind = "final"
    room.matches = [make_match("GRAND FINAL", list(room.semi_winners))]
    reset_scores(room, list(room.semi_winners))
    prepare_countdown(room)


def finish_round(room: Room):
    if room.stage not in ("playing", "countdown"):
        return
    if room.round_kind == "semifinal":
        room.semi_winners = [winner_of(room, m.players) for m in room.matches]
        room.stage = "round_result"
    else:
        finalists = room.matches[0].players if room.matches else list(room.players.keys())
        room.champion_id = winner_of(room, finalists)
        room.stage = "final_result"


def match_payload(room: Room, match: Match) -> dict:
    return {
        "id": match.id,
        "label": match.label,
        "seed": match.seed,
        "players": [public_player(room, room.players[pid]) for pid in match.players if pid in room.players],
    }


def state(room: Room, viewer_id: Optional[str], is_host: bool) -> dict:
    now = time.time()
    my_match = None
    for m in room.matches:
        if viewer_id in m.players:
            my_match = match_payload(room, m)
            break

    return {
        "type": "state",
        "code": room.code,
        "stage": room.stage,
        "round_kind": room.round_kind,
        "tournament": room.tournament,
        "player_id": viewer_id,
        "host_player_id": room.host_id,
        "is_host": is_host,
        "max_players": MAX_PLAYERS,
        "game_seconds": GAME_SECONDS,
        "countdown": max(0.0, room.countdown_until - now) if room.stage == "countdown" else 0.0,
        "remaining": max(0.0, room.play_until - now) if room.stage in ("countdown", "playing") else 0.0,
        "players": [public_player(room, p) for p in room.players.values()],
        "matches": [match_payload(room, m) for m in room.matches],
        "my_match": my_match,
        "semi_winners": list(room.semi_winners),
        "champion_id": room.champion_id,
    }


async def broadcast(code: str):
    room = rooms.get(code)
    if not room:
        return
    bad = []
    for client in list(clients.get(code, [])):
        try:
            await client["ws"].send_json(state(room, client["player_id"], client["is_host"]))
        except Exception:
            bad.append(client)
    if bad:
        clients[code] = [c for c in clients.get(code, []) if c not in bad]


async def ticker():
    while True:
        now = time.time()
        for code, room in list(rooms.items()):
            if room.stage == "countdown" and now >= room.countdown_until:
                room.stage = "playing"
                await broadcast(code)
            elif room.stage == "playing" and now >= room.play_until:
                finish_round(room)
                await broadcast(code)

            if now - room.last_active > 60 * 60 * 4:
                rooms.pop(code, None)
                clients.pop(code, None)
        await asyncio.sleep(0.12)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(ticker())


@app.get("/", response_class=HTMLResponse)
@app.get("/host/{code}", response_class=HTMLResponse)
@app.get("/join/{code}", response_class=HTMLResponse)
async def page(code: Optional[str] = None):
    return HTMLResponse(HTML)


@app.get("/health")
async def health():
    return {"ok": True, "rooms": len(rooms)}


@app.post("/api/rooms")
async def create_room(data: CreateRoom, req: Request):
    name = clean_name(data.name)
    code = new_code()
    pid = secrets.token_hex(8)
    token = secrets.token_urlsafe(22)
    host_token = secrets.token_urlsafe(24)
    player = Player(pid, token, name)
    room = Room(code=code, host_token=host_token, host_id=pid, players={pid: player})
    rooms[code] = room
    clients[code] = []

    proto = req.headers.get("x-forwarded-proto") or req.url.scheme
    host = req.headers.get("x-forwarded-host") or req.headers.get("host") or req.url.netloc
    origin = f"{proto}://{host}".rstrip("/")
    return {
        "code": code,
        "player_id": pid,
        "player_token": token,
        "host_token": host_token,
        "host_url": f"{origin}/host/{code}#host={host_token}&player={token}",
        "join_url": f"{origin}/join/{code}",
    }


@app.post("/api/rooms/{code}/join")
async def join_room(code: str, data: JoinRoom):
    room = rooms.get(code)
    if not room:
        raise HTTPException(404, "部屋が見つかりません")
    if room.stage != "lobby":
        raise HTTPException(409, "ゲームはすでに始まっています")
    if len(room.players) >= MAX_PLAYERS:
        raise HTTPException(409, "この部屋は満員です")

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
        raise HTTPException(409, "開始できません")
    begin_game(room)
    room.last_active = time.time()
    await broadcast(code)
    return {"ok": True}


@app.post("/api/rooms/{code}/next")
async def next_round(code: str, request: Request):
    room = rooms.get(code)
    if not room:
        raise HTTPException(404, "部屋が見つかりません")
    if request.headers.get("x-host-token", "") != room.host_token:
        raise HTTPException(403, "ホストだけが進められます")
    if room.stage != "round_result":
        raise HTTPException(409, "まだ決勝には進めません")
    begin_final(room)
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
    begin_game(room)
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
    await ws.send_json(state(room, player, is_host))
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

            if msg.get("type") == "score" and room.stage == "playing":
                active_ids = {pid for m in room.matches for pid in m.players}
                if player not in active_ids:
                    continue
                try:
                    sc = int(msg.get("score", 0))
                    hits = int(msg.get("hits", 0))
                    misses = int(msg.get("misses", 0))
                    combo = int(msg.get("best_combo", 0))
                except Exception:
                    continue
                room.scores[player] = Score(
                    score=max(-99, min(999, sc)),
                    hits=max(0, min(999, hits)),
                    misses=max(0, min(999, misses)),
                    best_combo=max(0, min(999, combo)),
                )
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
