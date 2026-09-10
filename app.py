from __future__ import annotations

import asyncio
import random
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
BASE_HTML = (ROOT / "index.html").read_text(encoding="utf-8")

PATCH_CSS = r"""
/* v0.2 gameplay control patch */
#gameScreen,
#gameScreen * {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
}
#gameCanvas {
  pointer-events: none;
}
.game-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 14px 10px calc(10px + env(safe-area-inset-bottom));
}
#jumpBtn {
  width: min(460px, 92vw);
  min-height: 72px;
  border-radius: 22px;
  font-size: clamp(22px, 5vw, 34px);
  letter-spacing: .05em;
  background: linear-gradient(180deg, #92f7ae, #54da8d);
  color: #082216;
  box-shadow: 0 10px 28px rgba(83,216,141,.28), inset 0 -4px 0 rgba(0,0,0,.14);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
#jumpBtn:active {
  transform: translateY(2px) scale(.985);
  box-shadow: 0 5px 16px rgba(83,216,141,.22), inset 0 -2px 0 rgba(0,0,0,.14);
}
@media (max-width:700px) {
  .game-controls { padding-top: 12px; }
  #jumpBtn { min-height: 76px; }
}
"""

PATCH_SCRIPT = r"""
<script>
(() => {
  // Prevent long-press selection/callouts only while interacting with the game area.
  const gameScreen = document.getElementById('gameScreen');
  if (!gameScreen) return;
  gameScreen.addEventListener('contextmenu', e => e.preventDefault());
  gameScreen.addEventListener('dragstart', e => e.preventDefault());
  gameScreen.addEventListener('selectstart', e => e.preventDefault());

  // Put a large jump button in the free space below the play field.
  if (!document.getElementById('jumpBtn')) {
    const controls = document.createElement('div');
    controls.className = 'game-controls';
    controls.innerHTML = '<button id="jumpBtn" type="button" aria-label="ジャンプ">JUMP！</button>';
    gameScreen.appendChild(controls);

    const jumpBtn = document.getElementById('jumpBtn');
    const pressJump = e => {
      e.preventDefault();
      e.stopPropagation();
      if (game.mode === 'solo' && !game.alive) {
        document.querySelector('#outOverlay b').textContent = 'OUT!';
        document.getElementById('tapHint').textContent = 'SPACE / 下のJUMPボタン';
        resetRun();
        game.running = true;
        return;
      }
      jump();
    };
    jumpBtn.addEventListener('pointerdown', pressJump, {passive:false});
  }

  // Canvas is display-only now; keyboard or the button below controls jumping.
  const hint = document.getElementById('tapHint');
  if (hint) hint.textContent = 'SPACE / 下のJUMPボタン';

  // The original handler restarted the round whenever game.running was false.
  // During countdown and after falling into a pit that flag is intentionally false,
  // so it caused endless resets. Initialize only once per (round, seed).
  handleState = function(s) {
    net.state = s;
    if (s.stage === 'lobby') {
      game._multiRoundKey = '';
      renderLobby(s);
      show('lobbyScreen');
      return;
    }

    if (s.stage === 'countdown' || s.stage === 'playing') {
      const roundKey = `${s.round_no}:${s.seed}`;
      if (game.mode !== 'multi' || game._multiRoundKey !== roundKey) {
        game._multiRoundKey = roundKey;
        startMultiRound(s);
        const h = document.getElementById('tapHint');
        if (h) h.textContent = 'SPACE / 下のJUMPボタン';
      }

      if (s.stage === 'countdown') {
        const cd = document.getElementById('countdown');
        cd.classList.remove('hidden');
        // Server countdown starts at 3.2s; never display a confusing "4".
        cd.textContent = Math.max(1, Math.min(3, Math.ceil(s.countdown)));
        game.running = false;
      } else {
        document.getElementById('countdown').classList.add('hidden');
        game.running = game.alive;
      }

      updateRemote(s);
      renderRanks(s);
      show('gameScreen');
      return;
    }

    if (s.stage === 'round_result' || s.stage === 'final_result') {
      game.running = false;
      renderResult(s);
      show('resultScreen');
    }
  };
})();
</script>
"""

HTML = BASE_HTML.replace("</style>", PATCH_CSS + "\n</style>", 1)
HTML = HTML.replace("</body>", PATCH_SCRIPT + "\n</body>", 1)
app = FastAPI(title="DINO DASH RACE")

MAX_PLAYERS = 4
DINO_COLORS = ["#56d7ff", "#ff6f91", "#ffd65a", "#76e58c"]


@dataclass
class Player:
    id: str
    token: str
    name: str
    dino: int
    color: str
    connected: bool = True
    distance: float = 0.0
    y: float = 0.0
    alive: bool = True


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
    countdown_until: float = 0.0
    round_results: Dict[int, Dict[str, float]] = field(default_factory=dict)
    totals: Dict[str, float] = field(default_factory=dict)
    last_active: float = field(default_factory=time.time)


rooms: Dict[str, Room] = {}
clients: Dict[str, list[dict]] = {}


class CreateRoom(BaseModel):
    name: str
    rounds: int = 3


class JoinRoom(BaseModel):
    name: str


def clean_name(name: str) -> str:
    name = " ".join((name or "").strip().split())
    if not name:
        raise HTTPException(400, "名前を入力してね")
    return name[:14]


def new_code() -> str:
    for _ in range(1000):
        code = f"{random.randint(0, 9999):04d}"
        if code not in rooms:
            return code
    raise HTTPException(503, "部屋を作れませんでした")


def public_player(room: Room, p: Player) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "dino": p.dino,
        "color": p.color,
        "distance": round(p.distance, 1),
        "y": round(p.y, 1),
        "alive": p.alive,
        "connected": p.connected,
        "total": round(room.totals.get(p.id, 0.0), 1),
    }


def standings(room: Room) -> list[dict]:
    rows = []
    for p in room.players.values():
        total = room.totals.get(p.id, 0.0)
        if room.stage in ("playing", "countdown"):
            total += p.distance
        rows.append({
            "id": p.id,
            "name": p.name,
            "dino": p.dino,
            "color": p.color,
            "distance": round(p.distance, 1),
            "total": round(total, 1),
            "alive": p.alive,
        })
    rows.sort(key=lambda x: (x["total"], x["distance"]), reverse=True)
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


def state(room: Room, viewer_id: Optional[str], is_host: bool) -> dict:
    now = time.time()
    rows = standings(room)
    hide_totals = (
        room.stage == "round_result"
        and room.rounds_total > 1
        and room.round_no == room.rounds_total - 1
    )
    result_rows = []
    current_result = room.round_results.get(room.round_no, {})
    if room.stage in ("round_result", "final_result"):
        result_rows = []
        for r in rows:
            item = dict(r)
            item["round_distance"] = round(current_result.get(r["id"], 0.0), 1)
            item["actual_total"] = round(room.totals.get(r["id"], 0.0), 1)
            item["display_total"] = None if hide_totals else item["actual_total"]
            result_rows.append(item)
        result_rows.sort(key=lambda x: x["actual_total"], reverse=True)
        for i, r in enumerate(result_rows, 1):
            r["rank"] = i

    return {
        "type": "state",
        "code": room.code,
        "stage": room.stage,
        "round_no": room.round_no,
        "rounds_total": room.rounds_total,
        "seed": room.seed,
        "countdown": max(0.0, room.countdown_until - now) if room.stage == "countdown" else 0.0,
        "player_id": viewer_id,
        "host_player_id": room.host_id,
        "is_host": is_host,
        "players": [public_player(room, p) for p in room.players.values()],
        "standings": rows,
        "result_rows": result_rows,
        "hide_totals": hide_totals,
        "max_players": MAX_PLAYERS,
    }


async def broadcast(code: str):
    room = rooms.get(code)
    if not room:
        return
    bad = []
    for c in list(clients.get(code, [])):
        try:
            await c["ws"].send_json(state(room, c["player_id"], c["is_host"]))
        except Exception:
            bad.append(c)
    if bad:
        clients[code] = [c for c in clients.get(code, []) if c not in bad]


def reset_round(room: Room):
    room.seed = secrets.randbits(31)
    for p in room.players.values():
        p.distance = 0.0
        p.y = 0.0
        p.alive = True


def start_round(room: Room):
    room.round_no += 1
    reset_round(room)
    room.stage = "countdown"
    room.countdown_until = time.time() + 3.2


def begin_game(room: Room):
    room.round_results.clear()
    room.totals = {pid: 0.0 for pid in room.players}
    room.round_no = 0
    start_round(room)


def finish_round(room: Room):
    if room.stage != "playing":
        return
    results = {pid: max(0.0, p.distance) for pid, p in room.players.items()}
    room.round_results[room.round_no] = results
    for pid, dist in results.items():
        room.totals[pid] = room.totals.get(pid, 0.0) + dist
    room.stage = "final_result" if room.round_no >= room.rounds_total else "round_result"


def active_players(room: Room):
    return [p for p in room.players.values() if p.connected]


async def ticker():
    while True:
        now = time.time()
        for code, room in list(rooms.items()):
            if room.stage == "countdown" and now >= room.countdown_until:
                room.stage = "playing"
                await broadcast(code)
            if room.stage == "playing":
                connected = active_players(room)
                if connected and all(not p.alive for p in connected):
                    finish_round(room)
                    await broadcast(code)
            if now - room.last_active > 60 * 60 * 4:
                rooms.pop(code, None)
                clients.pop(code, None)
        await asyncio.sleep(0.15)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(ticker())


@app.get("/", response_class=HTMLResponse)
@app.get("/host/{code}", response_class=HTMLResponse)
@app.get("/join/{code}", response_class=HTMLResponse)
async def page(code: Optional[str] = None):
    return HTMLResponse(HTML)


@app.post("/api/rooms")
async def create_room(data: CreateRoom, req: Request):
    name = clean_name(data.name)
    rounds = data.rounds if data.rounds in (1, 2, 3, 4, 5) else 3
    code = new_code()
    pid = secrets.token_hex(8)
    token = secrets.token_urlsafe(22)
    host_token = secrets.token_urlsafe(24)
    p = Player(pid, token, name, 0, DINO_COLORS[0])
    room = Room(code, host_token, pid, rounds, {pid: p})
    room.totals[pid] = 0.0
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
    used = {p.dino for p in room.players.values()}
    dino = next((i for i in range(MAX_PLAYERS) if i not in used), len(room.players) % MAX_PLAYERS)
    p = Player(pid, token, name, dino, DINO_COLORS[dino])
    room.players[pid] = p
    room.totals[pid] = 0.0
    room.last_active = time.time()
    await broadcast(code)
    return {"player_id": pid, "player_token": token}


@app.post("/api/rooms/{code}/start")
async def start_game(code: str, request: Request):
    room = rooms.get(code)
    if not room:
        raise HTTPException(404, "部屋が見つかりません")
    host_token = request.headers.get("x-host-token", "")
    if host_token != room.host_token:
        raise HTTPException(403, "ホストだけが開始できます")
    if room.stage != "lobby":
        raise HTTPException(409, "開始できません")
    if len(room.players) < 2:
        raise HTTPException(409, "2人以上で開始してね")
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
        raise HTTPException(409, "次のレースには進めません")
    start_round(room)
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
            if msg.get("type") == "run" and room.stage == "playing":
                try:
                    dist = float(msg.get("distance", 0.0))
                    y = float(msg.get("y", 0.0))
                except Exception:
                    continue
                if dist >= p.distance - 3:
                    p.distance = max(0.0, min(dist, p.distance + 35.0))
                p.y = max(-500.0, min(1000.0, y))
                if msg.get("alive") is False:
                    p.alive = False
                await broadcast(code)
    except WebSocketDisconnect:
        pass
    finally:
        if code in clients:
            clients[code] = [c for c in clients[code] if c is not entry]
        room = rooms.get(code)
        if room and player in room.players:
            room.players[player].connected = False
            if room.stage == "playing":
                room.players[player].alive = False
            await broadcast(code)
