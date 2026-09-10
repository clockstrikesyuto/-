(() => {
  const gameScreen = document.getElementById('gameScreen');
  const shell = gameScreen && gameScreen.querySelector('.game-shell');
  if (!gameScreen || !shell) return;

  const SPECIES = ['T-REX','TRICERATOPS','STEGOSAURUS','RAPTOR'];
  const PALETTES = [
    {body:'#35c9f0',dark:'#125d78',light:'#a8f2ff'},
    {body:'#ff6685',dark:'#8c3147',light:'#ffc0cc'},
    {body:'#f0c744',dark:'#826517',light:'#fff09a'},
    {body:'#70df78',dark:'#2f7037',light:'#c1f5b7'}
  ];

  gameScreen.addEventListener('contextmenu', e => e.preventDefault());
  gameScreen.addEventListener('dragstart', e => e.preventDefault());
  gameScreen.addEventListener('selectstart', e => e.preventDefault());

  let controls = gameScreen.querySelector('.game-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'game-controls';
    gameScreen.appendChild(controls);
  }
  controls.innerHTML = `
    <button id="jumpBtn" type="button" aria-label="ジャンプ">JUMP！</button>
    <div id="spectatorControls" class="spectator-controls hidden">
      <button id="specPrev" type="button" aria-label="前のプレイヤー">◀</button>
      <div id="specLabel" class="spectator-label">観戦中<small>生存プレイヤーを追跡</small></div>
      <button id="specNext" type="button" aria-label="次のプレイヤー">▶</button>
    </div>`;

  let spectatorBanner = document.getElementById('spectatorBanner');
  if (!spectatorBanner) {
    spectatorBanner = document.createElement('div');
    spectatorBanner.id = 'spectatorBanner';
    spectatorBanner.className = 'spectator-banner hidden';
    shell.appendChild(spectatorBanner);
  }

  const jumpBtn = document.getElementById('jumpBtn');
  const spectatorControls = document.getElementById('spectatorControls');
  const specLabel = document.getElementById('specLabel');
  const oldStartSolo = startSolo;

  game._multiRoundKey = game._multiRoundKey || '';
  game._spectating = false;
  game._spectatorId = null;
  game._spectateWorldX = 0;
  game._deathAnimUntil = 0;
  game._deathWorldX = 0;
  game._deathY = 0;

  function resetSpectator() {
    game._spectating = false;
    game._spectatorId = null;
    game._spectateWorldX = 0;
    game._deathAnimUntil = 0;
    spectatorBanner.classList.add('hidden');
    spectatorControls.classList.add('hidden');
    jumpBtn.classList.remove('hidden');
    jumpBtn.disabled = false;
    jumpBtn.textContent = 'JUMP！';
  }

  function livingOpponents() {
    if (!net.state) return [];
    return net.state.players
      .filter(p => p.id !== net.playerId && p.alive && p.connected !== false)
      .sort((a,b) => b.distance - a.distance);
  }

  function pickSpectator(preferredId) {
    const live = livingOpponents();
    if (!live.length) {
      game._spectatorId = null;
      return null;
    }
    const preferred = live.find(p => p.id === preferredId);
    const p = preferred || live[0];
    game._spectatorId = p.id;
    if (!game._spectateWorldX) game._spectateWorldX = p.distance * PX_PER_M;
    return p;
  }

  function cycleSpectator(dir) {
    const live = livingOpponents();
    if (!live.length) return;
    let i = live.findIndex(p => p.id === game._spectatorId);
    if (i < 0) i = 0;
    i = (i + dir + live.length) % live.length;
    game._spectatorId = live[i].id;
    game._spectateWorldX = live[i].distance * PX_PER_M;
    updateSpectatorUI();
  }

  function updateSpectatorUI() {
    const active = game.mode === 'multi' && !game.alive && net.state && net.state.stage === 'playing';
    game._spectating = !!active;
    if (!active) {
      spectatorBanner.classList.add('hidden');
      spectatorControls.classList.add('hidden');
      jumpBtn.classList.remove('hidden');
      jumpBtn.disabled = net.state && net.state.stage === 'countdown';
      return;
    }

    const p = pickSpectator(game._spectatorId);
    jumpBtn.classList.add('hidden');
    spectatorControls.classList.remove('hidden');
    spectatorBanner.classList.remove('hidden');
    if (p) {
      const mine = Math.floor(game.distance);
      const theirs = Math.floor(p.distance);
      spectatorBanner.textContent = `👀 観戦中：${p.name}  ${theirs}m　｜　自分 ${mine}mでOUT`;
      specLabel.innerHTML = `${esc(p.name)} ${theirs}m<small>◀ ▶ で観戦相手を切替</small>`;
    } else {
      spectatorBanner.textContent = `👀 自分 ${Math.floor(game.distance)}mでOUT　結果集計中…`;
      specLabel.innerHTML = `全員OUT<small>結果を待っています…</small>`;
    }
  }

  document.getElementById('specPrev').addEventListener('pointerdown', e => { e.preventDefault(); cycleSpectator(-1); }, {passive:false});
  document.getElementById('specNext').addEventListener('pointerdown', e => { e.preventDefault(); cycleSpectator(1); }, {passive:false});

  jumpBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    if (game.mode === 'multi' && !game.alive) return;
    if (game.mode === 'solo' && !game.alive) {
      document.querySelector('#outOverlay b').textContent = 'OUT!';
      document.getElementById('tapHint').textContent = 'SPACE / 下のJUMPボタン';
      resetRun();
      game.running = true;
      jumpBtn.textContent = 'JUMP！';
      return;
    }
    jump();
  }, {passive:false});

  startSolo = function() {
    resetSpectator();
    oldStartSolo();
    document.getElementById('tapHint').textContent = 'SPACE / 下のJUMPボタン';
  };

  const oldResetRun = resetRun;
  resetRun = function() {
    oldResetRun();
    game._deathAnimUntil = 0;
    if (game.mode !== 'multi') resetSpectator();
    document.getElementById('tapHint').textContent = 'SPACE / 下のJUMPボタン';
  };

  die = function() {
    if (!game.alive) return;
    game.alive = false;
    game.running = false;
    game._deathWorldX = game.worldX;
    game._deathY = game.y;
    game._deathAnimUntil = performance.now() + 650;
    const overlay = document.getElementById('outOverlay');
    overlay.classList.remove('hidden');
    document.getElementById('outDistance').textContent = `${Math.floor(game.distance)}m`;

    if (game.mode === 'solo') {
      if (game.distance > game.best) {
        game.best = game.distance;
        localStorage.setItem('dinoBest', String(game.best));
        overlay.querySelector('b').textContent = 'NEW BEST!';
      } else overlay.querySelector('b').textContent = 'OUT!';
      document.getElementById('roundHud').textContent = `BEST ${Math.floor(game.best)}m`;
      jumpBtn.textContent = 'RETRY';
      setTimeout(() => overlay.classList.add('hidden'), 650);
      return;
    }

    overlay.querySelector('b').textContent = 'OUT!';
    sendRun(false);
    game._spectating = true;
    pickSpectator();
    updateSpectatorUI();
    setTimeout(() => {
      if (game.mode === 'multi' && !game.alive) overlay.classList.add('hidden');
    }, 650);
  };

  handleState = function(s) {
    net.state = s;
    if (s.stage === 'lobby') {
      game._multiRoundKey = '';
      resetSpectator();
      renderLobby(s);
      show('lobbyScreen');
      return;
    }

    if (s.stage === 'countdown' || s.stage === 'playing') {
      const roundKey = `${s.round_no}:${s.seed}`;
      if (game.mode !== 'multi' || game._multiRoundKey !== roundKey) {
        game._multiRoundKey = roundKey;
        resetSpectator();
        startMultiRound(s);
        document.getElementById('tapHint').textContent = 'SPACE / 下のJUMPボタン';
      }

      const self = s.players.find(p => p.id === net.playerId);
      updateRemote(s);
      renderRanks(s);

      if (s.stage === 'countdown') {
        const cd = document.getElementById('countdown');
        cd.classList.remove('hidden');
        cd.textContent = Math.max(1, Math.min(3, Math.ceil(s.countdown)));
        game.running = false;
        jumpBtn.disabled = true;
      } else {
        document.getElementById('countdown').classList.add('hidden');
        if (self && !self.alive) {
          if (game.alive) {
            game.alive = false;
            game.running = false;
            game._deathWorldX = game.worldX;
            game._deathY = game.y;
          }
          game.running = false;
          game._spectating = true;
          pickSpectator(game._spectatorId);
        } else {
          game.alive = true;
          game.running = true;
          jumpBtn.disabled = false;
        }
      }

      updateSpectatorUI();
      show('gameScreen');
      return;
    }

    if (s.stage === 'round_result' || s.stage === 'final_result') {
      game.running = false;
      resetSpectator();
      renderResult(s);
      show('resultScreen');
    }
  };

  renderRanks = function(s) {
    const list = [...s.players].sort((a,b) => b.distance - a.distance);
    document.getElementById('rankList').innerHTML = list.map((r,i) =>
      `<div class="rank-pill ${r.id===net.playerId?'me':''}">${i+1} ${esc(r.name)} ${Math.floor(r.distance)}m${!r.alive?' OUT':''}</div>`
    ).join('');
  };

  renderLobby = function(s) {
    document.getElementById('roomCode').textContent = s.code;
    document.getElementById('roomRule').textContent = `${s.rounds_total}レース・総距離`;
    document.getElementById('shareUrl').value = `${location.origin}/join/${s.code}`;
    const host = s.host_player_id;
    let html = '';
    for (let i=0;i<4;i++) {
      const p = s.players[i];
      if (p) {
        html += `<div class="player-card"><div class="dino-chip"><canvas class="pixel-dino-card" width="84" height="54" data-dino="${p.dino}"></canvas></div><div class="player-name">${esc(p.name)}</div><div class="dino-species">${SPECIES[p.dino] || 'DINO'}</div>${p.id===host?'<span class="host-badge">HOST</span>':''}</div>`;
      } else {
        html += '<div class="player-card empty"><div class="dino-chip"><span class="dino-mini">＋</span></div><div class="player-name">募集中</div></div>';
      }
    }
    document.getElementById('players').innerHTML = html;
    gameScreen.ownerDocument.querySelectorAll('.pixel-dino-card').forEach(c => {
      const cc = c.getContext('2d'); cc.imageSmoothingEnabled=false;
      paintDino(cc, 42, 3, +c.dataset.dino, 0, 'idle', 3);
    });
    const isHost = s.is_host;
    document.getElementById('startBtn').classList.toggle('hidden', !isHost);
    document.getElementById('startBtn').disabled = s.players.length < 2;
    document.getElementById('lobbyStatus').textContent = isHost ? (s.players.length<2?'あと1人来たらスタートできる！':`${s.players.length}人参加中。準備できたらスタート！`) : 'ホストがゲームを開始するまで待ってね';
  };

  function R(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}

  function paintDino(c,x,y,index,frame,state,scale=4) {
    const p = PALETTES[index%4], air = state==='air', dead = state==='dead';
    c.save();
    c.translate(Math.round(x),Math.round(y));
    if (dead) { c.translate(0,42); c.rotate(Math.PI/2); c.translate(0,-42); }
    c.scale(scale,scale);
    const rr=(a,b,w,h,col)=>R(c,a,b,w,h,col);
    const leg=(x0,phase)=>{
      if(air){rr(x0,9,2,2,p.dark);rr(x0+(phase?1:-1),10,3,1,p.body);return;}
      if(frame^phase){rr(x0,8,2,4,p.dark);rr(x0-1,11,3,2,p.body);}else{rr(x0,8,2,3,p.dark);rr(x0+1,10,3,2,p.body);}
    };

    if(index%4===0){
      rr(-8,5,4,2,p.dark);rr(-7,4,5,3,p.body);rr(-4,3,8,6,p.dark);rr(-3,4,7,4,p.body);
      rr(1,2,4,5,p.body);rr(3,0,6,5,p.dark);rr(4,0,6,4,p.body);rr(8,2,3,2,p.body);
      rr(7,4,3,1,p.dark);rr(8,4,1,1,'#fff7d6');rr(5,1,1,1,'#fff');rr(6,1,1,1,'#17202b');
      rr(2,5,2,1,p.dark);rr(3,6,1,2,p.body); leg(-2,0);leg(2,1);
    } else if(index%4===1){
      rr(-8,5,4,2,p.dark);rr(-6,4,10,6,p.dark);rr(-5,4,9,5,p.body);
      rr(2,1,4,7,p.dark);rr(3,2,4,6,p.light);rr(5,3,5,4,p.dark);rr(6,3,4,3,p.body);
      rr(7,1,1,2,'#fff1cf');rr(9,0,1,3,'#fff1cf');rr(10,4,2,1,'#fff1cf');rr(8,4,1,1,'#17202b');
      leg(-3,0);leg(1,1);leg(4,0);
    } else if(index%4===2){
      rr(-9,6,5,2,p.dark);rr(-6,4,11,6,p.dark);rr(-5,5,10,4,p.body);rr(4,6,4,3,p.dark);rr(5,6,3,2,p.body);rr(7,6,1,1,'#17202b');
      rr(-4,2,2,3,p.light);rr(-2,1,2,3,p.light);rr(0,0,2,4,p.light);rr(2,1,2,3,p.light);rr(4,3,2,3,p.light);
      leg(-3,0);leg(1,1);leg(4,0);
    } else {
      rr(-10,6,6,1,p.dark);rr(-8,5,7,2,p.body);rr(-3,4,7,5,p.dark);rr(-2,4,6,4,p.body);
      rr(2,2,2,4,p.body);rr(3,1,2,3,p.body);rr(4,0,5,3,p.dark);rr(5,0,5,2,p.body);rr(9,1,2,1,p.body);rr(7,0,1,1,'#17202b');
      rr(2,5,3,1,p.dark);rr(4,6,1,2,p.body);
      if(air){rr(-1,8,2,2,p.dark);rr(0,9,3,1,p.body);rr(2,8,2,2,p.dark);rr(3,9,3,1,p.body);}else if(frame){rr(-1,8,2,4,p.dark);rr(-2,11,4,1,p.body);rr(2,8,2,3,p.dark);rr(3,10,3,1,p.body);}else{rr(-1,8,2,3,p.dark);rr(0,10,3,1,p.body);rr(2,8,2,4,p.dark);rr(1,11,4,1,p.body);}
    }
    c.restore();
  }

  function drawNameTag(x,y,index,me,name) {
    ctx.save();
    ctx.font='900 12px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.textAlign='center';
    const label=me?`YOU · ${name}`:name;const tw=ctx.measureText(label).width;
    ctx.fillStyle='rgba(7,17,29,.88)';ctx.fillRect(Math.round(x-tw/2-7),Math.round(y-27),Math.round(tw+14),18);
    ctx.fillStyle=PALETTES[index%4].light;ctx.fillText(label,Math.round(x),Math.round(y-14));ctx.restore();
  }

  drawDino = function(x,y,index,me,name,stateOverride) {
    const now=performance.now(), frame=Math.floor(now/115)%2;
    const state=stateOverride || ((y < GROUND-53)?'air':'run');
    drawNameTag(x,y,index,me,name);
    paintDino(ctx,x,y,index,frame,state,4);
  };

  function objectsNear(worldX){
    const cam=worldX-PLAYER_X,first=Math.floor((cam-220)/620),last=Math.floor((cam+W+320)/620),out=[];
    for(let s=Math.max(0,first);s<=last;s++)out.push(...segmentObjects(s));
    return out;
  }

  function drawPixelMountain(x,base,w,h,color){
    ctx.fillStyle=color;const step=18;for(let yy=0;yy<h;yy+=step){const ratio=yy/h;const ww=w*ratio;ctx.fillRect(Math.round(x+w/2-ww/2),Math.round(base-yy),Math.round(ww),step+1)}
  }

  function drawPixelTree(x,y,s=1){
    ctx.fillStyle='#426b55';ctx.fillRect(Math.round(x),Math.round(y),Math.round(10*s),Math.round(54*s));
    ctx.fillStyle='#3f9163';ctx.fillRect(Math.round(x-26*s),Math.round(y-8*s),Math.round(62*s),Math.round(24*s));ctx.fillRect(Math.round(x-18*s),Math.round(y-27*s),Math.round(46*s),Math.round(23*s));ctx.fillRect(Math.round(x-6*s),Math.round(y-43*s),Math.round(24*s),Math.round(20*s));
  }

  function drawPixelRock(x,y,w,h,variant){
    const unit=Math.max(5,Math.round(Math.min(w,h)/8));
    if(variant===1){
      ctx.fillStyle='#d8c58f';ctx.fillRect(Math.round(x+w*.18),Math.round(y+h*.34),Math.round(w*.62),unit);ctx.fillRect(Math.round(x+w*.35),Math.round(y+h*.12),unit,Math.round(h*.72));ctx.fillRect(Math.round(x+w*.57),Math.round(y+h*.2),unit,Math.round(h*.62));ctx.fillRect(Math.round(x+w*.12),Math.round(y+h*.25),unit*2,unit*2);ctx.fillRect(Math.round(x+w*.72),Math.round(y+h*.2),unit*2,unit*2);
      return;
    }
    ctx.fillStyle='#3e4650';ctx.fillRect(Math.round(x+w*.12),Math.round(y+h*.25),Math.round(w*.76),Math.round(h*.75));ctx.fillRect(Math.round(x+w*.25),Math.round(y+h*.1),Math.round(w*.48),Math.round(h*.9));ctx.fillStyle='#737b7d';ctx.fillRect(Math.round(x+w*.34),Math.round(y+h*.18),Math.round(w*.2),Math.round(h*.25));
  }

  function drawPit(x,w){
    ctx.fillStyle='#07101a';ctx.fillRect(Math.round(x),GROUND-12,Math.round(w),H-GROUND+20);
    ctx.fillStyle='#2a1b17';const tooth=16;for(let xx=x;xx<x+w;xx+=tooth){ctx.fillRect(Math.round(xx),GROUND-12,Math.min(9,Math.round(x+w-xx)),13)}
    ctx.fillStyle='#9a6840';ctx.fillRect(Math.round(x-7),GROUND-12,7,12);ctx.fillRect(Math.round(x+w),GROUND-12,7,12);
  }

  function drawWorld(cam,focusWorldX){
    ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#78cee8';ctx.fillRect(0,0,W,H);ctx.fillStyle='#b9e8e2';ctx.fillRect(0,260,W,GROUND-260);
    for(let i=-1;i<5;i++){const x=i*320-(cam*.07)%320;drawPixelMountain(x,GROUND,300,230,'#729db0')}
    ctx.fillStyle='#91b9a2';ctx.fillRect(0,365,W,80);
    for(let i=-1;i<9;i++){const x=i*145-(cam*.16)%145;drawPixelTree(x+45,365,.72+(i%2)*.14)}
    ctx.fillStyle='#5a3824';ctx.fillRect(0,GROUND,W,H-GROUND);ctx.fillStyle='#2f7b48';ctx.fillRect(0,GROUND-14,W,14);ctx.fillStyle='#6aa451';ctx.fillRect(0,GROUND-14,W,5);ctx.fillStyle='#3a261b';ctx.fillRect(0,GROUND+32,W,7);ctx.fillRect(0,GROUND+79,W,7);
    for(const o of objectsNear(focusWorldX)){const sx=o.x-cam;if(o.type==='pit')drawPit(sx,o.w);else drawPixelRock(sx,GROUND-o.h,o.w,o.h,Math.abs(Math.floor(o.x/13))%4===0?1:0)}
  }

  function drawOffscreenFocus(p,left,focusDist){
    const y=116+(p.dino*36);ctx.save();ctx.fillStyle='rgba(7,15,25,.84)';ctx.fillRect(left?4:W-128,y-15,124,30);ctx.fillStyle=PALETTES[p.dino%4].light;ctx.font='900 11px ui-monospace,monospace';ctx.textAlign=left?'left':'right';const diff=Math.round(p.distance-focusDist);ctx.fillText(`${left?'◀':'▶'} ${p.name} ${diff>0?'+':''}${diff}m`,left?11:W-11,y+4);ctx.restore();
  }

  draw = function(){
    let focusWorldX=game.worldX, focusDist=game.distance;
    const now=performance.now();
    if(game.mode==='multi'&&!game.alive&&game._spectating&&now>=game._deathAnimUntil){
      const p=pickSpectator(game._spectatorId);
      if(p){const target=p.distance*PX_PER_M;if(!game._spectateWorldX)game._spectateWorldX=target;game._spectateWorldX+=(target-game._spectateWorldX)*.18;focusWorldX=game._spectateWorldX;focusDist=focusWorldX/PX_PER_M;}
      else{focusWorldX=game._deathWorldX;focusDist=game.distance;}
    }
    const cam=focusWorldX-PLAYER_X;drawWorld(cam,focusWorldX);

    if(game.mode==='multi'&&net.state){
      for(const p of net.state.players){
        if(p.id===net.playerId||!p.alive)continue;
        const sx=p.distance*PX_PER_M-cam;
        const py=(p.y&&p.y>-100)?p.y:GROUND-48;
        if(sx>-90&&sx<W+90)drawDino(sx,py,p.dino,false,p.name);
        else drawOffscreenFocus(p,sx<0,focusDist);
      }
    }

    if(game.alive){drawDino(game.worldX-cam,game.y,localDinoIndex(),true,localName());}
    else if(game.mode==='multi'&&now<game._deathAnimUntil){drawDino(game._deathWorldX-cam,game._deathY,localDinoIndex(),true,localName(),'dead');}
  };

  loop = function(t){
    if(!document.getElementById('gameScreen').classList.contains('hidden')){
      const dt=Math.min(.035,Math.max(0,(t-game.last)/1000));game.last=t;
      if(game.running&&game.alive){
        const speed=310+Math.min(210,game.distance*.055);game.worldX+=speed*dt;game.distance=game.worldX/PX_PER_M;
        game.vy+=1840*dt;game.y+=game.vy*dt;
        const feet=game.y+47,hole=overPit(game.worldX);
        if(!hole&&feet>=GROUND&&game.vy>=0){game.y=GROUND-47;game.vy=0;game.onGround=true}else if(hole&&game.onGround){game.onGround=false}
        if(game.y>H+80||collide())die();
        if(game.mode==='multi'&&t-game.lastSend>95){sendRun(true);game.lastSend=t}
      }
      draw();
      if(game.mode==='multi'&&!game.alive&&game._spectating){
        const p=pickSpectator(game._spectatorId);document.getElementById('distanceHud').textContent=p?`${Math.floor(p.distance)}m`:`${Math.floor(game.distance)}m`;updateSpectatorUI();
      }else document.getElementById('distanceHud').textContent=`${Math.floor(game.distance)}m`;
      requestAnimationFrame(loop);
    }
  };
})();
