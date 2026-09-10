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
  const STAGES = [
    {name:'🌿 はじまりの草原',from:0,sky:'#75cff0',sky2:'#dff7ff',ground:'#5d9e48',soil:'#69492f'},
    {name:'🌴 ジャングル',from:500,sky:'#4ba790',sky2:'#9ed9ad',ground:'#2f753f',soil:'#4b3828'},
    {name:'🌋 火山地帯',from:1000,sky:'#9a635d',sky2:'#df9b63',ground:'#70513e',soil:'#3b2927'},
    {name:'☄️ 隕石ゾーン',from:1500,sky:'#252b57',sky2:'#765481',ground:'#51445a',soil:'#241e2b'}
  ];

  let selectedDino = +(localStorage.getItem('dinoSelected') || 0);
  if (!(selectedDino >= 0 && selectedDino < 4)) selectedDino = 0;
  let ghost = null;
  try { ghost = JSON.parse(localStorage.getItem('dinoGhost') || 'null'); } catch { ghost = null; }

  game._multiRoundKey = game._multiRoundKey || '';
  game._spectating = false;
  game._spectatorId = null;
  game._spectateWorldX = 0;
  game._deathAnimUntil = 0;
  game._deathWorldX = 0;
  game._deathY = 0;
  game._soloSamples = [];
  game._lastGhostSample = 0;
  game._stageIndex = 0;

  gameScreen.addEventListener('contextmenu', e => e.preventDefault());
  gameScreen.addEventListener('dragstart', e => e.preventDefault());
  gameScreen.addEventListener('selectstart', e => e.preventDefault());

  function R(c,x,y,w,h,color){ c.fillStyle=color; c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); }

  function paintDino(c,x,y,index,frame,state='run',scale=4,alpha=1){
    const p=PALETTES[index%4], air=state==='air', dead=state==='dead';
    c.save(); c.globalAlpha=alpha; c.translate(Math.round(x),Math.round(y));
    if(dead){c.translate(0,42);c.rotate(Math.PI/2);c.translate(0,-42)}
    c.scale(scale,scale);
    const rr=(a,b,w,h,col)=>R(c,a,b,w,h,col);
    const leg=(x0,phase)=>{
      if(air){rr(x0,9,2,2,p.dark);rr(x0+(phase?1:-1),10,3,1,p.body);return}
      if((frame+phase)%2){rr(x0,8,2,4,p.dark);rr(x0-1,11,3,2,p.body)}
      else{rr(x0,8,2,3,p.dark);rr(x0+1,10,3,2,p.body)}
    };
    if(index%4===0){
      rr(-10,5,5,2,p.dark);rr(-8,4,7,3,p.body);rr(-4,3,8,6,p.dark);rr(-3,4,7,4,p.body);
      rr(1,2,4,5,p.body);rr(3,0,7,5,p.dark);rr(4,0,7,4,p.body);rr(8,3,4,2,p.body);
      rr(7,4,4,1,p.dark);rr(8,4,1,1,'#fff7d6');rr(10,4,1,1,'#fff7d6');rr(5,1,1,1,'#fff');rr(6,1,1,1,'#17202b');
      rr(2,5,2,1,p.dark);rr(3,6,1,2,p.body);leg(-2,0);leg(2,1);
    } else if(index%4===1){
      rr(-9,5,5,2,p.dark);rr(-6,4,10,6,p.dark);rr(-5,4,9,5,p.body);
      rr(1,1,5,7,p.dark);rr(2,2,4,6,p.light);rr(5,3,5,4,p.dark);rr(6,3,4,3,p.body);
      rr(6,1,1,3,'#fff1cf');rr(9,0,1,4,'#fff1cf');rr(10,4,3,1,'#fff1cf');rr(8,4,1,1,'#17202b');
      leg(-3,0);leg(1,1);leg(4,0);
    } else if(index%4===2){
      rr(-10,6,6,2,p.dark);rr(-6,4,11,6,p.dark);rr(-5,5,10,4,p.body);rr(4,6,4,3,p.dark);rr(5,6,3,2,p.body);rr(7,6,1,1,'#17202b');
      rr(-5,2,2,3,p.light);rr(-3,1,2,3,p.light);rr(-1,0,2,4,p.light);rr(1,1,2,3,p.light);rr(3,2,2,3,p.light);rr(5,4,2,2,p.light);
      rr(-10,5,1,1,p.light);rr(-11,4,1,1,p.light);leg(-3,0);leg(1,1);leg(4,0);
    } else {
      rr(-11,5,6,2,p.dark);rr(-8,4,7,3,p.body);rr(-4,3,7,6,p.dark);rr(-3,4,6,4,p.body);
      rr(1,1,3,5,p.body);rr(3,0,6,4,p.dark);rr(4,0,6,3,p.body);rr(8,2,3,2,p.body);
      rr(5,1,1,1,'#fff');rr(6,1,1,1,'#17202b');rr(2,5,2,1,p.dark);rr(3,6,1,2,p.body);leg(-2,1);leg(2,0);
    }
    c.restore();
  }

  function pickerHTML(id){
    return `<div class="dino-picker-wrap"><div class="dino-picker-title">🦖 恐竜を選ぶ</div><div class="dino-picker" id="${id}">${SPECIES.map((s,i)=>`<button type="button" class="dino-pick ${i===selectedDino?'selected':''}" data-dino="${i}"><canvas width="70" height="44"></canvas><span>${s}</span></button>`).join('')}</div></div>`;
  }

  function wirePicker(root){
    if(!root)return;
    root.querySelectorAll('.dino-pick').forEach(btn=>{
      const i=+btn.dataset.dino, c=btn.querySelector('canvas'), cc=c.getContext('2d'); cc.imageSmoothingEnabled=false; paintDino(cc,35,1,i,0,'idle',3);
      btn.addEventListener('click',()=>{
        selectedDino=i; localStorage.setItem('dinoSelected',String(i));
        document.querySelectorAll('.dino-pick').forEach(b=>b.classList.toggle('selected',+b.dataset.dino===i));
        sfx('select');
      });
    });
  }

  // Pickers on solo / create / join screens.
  const homeActions=document.querySelector('#homeScreen .home-actions');
  if(homeActions && !document.getElementById('homeDinoPicker')){const wrap=document.createElement('div');wrap.style.gridColumn='1/-1';wrap.innerHTML=pickerHTML('homeDinoPicker');homeActions.prepend(wrap);wirePicker(wrap)}
  const createForm=document.querySelector('#createScreen .form-grid');
  if(createForm && !document.getElementById('createDinoPicker')){const wrap=document.createElement('div');wrap.innerHTML=pickerHTML('createDinoPicker');createForm.insertBefore(wrap,document.getElementById('createBtn'));wirePicker(wrap)}
  const joinForm=document.querySelector('#joinScreen .form-grid');
  if(joinForm && !document.getElementById('joinDinoPicker')){const wrap=document.createElement('div');wrap.innerHTML=pickerHTML('joinDinoPicker');joinForm.insertBefore(wrap,document.getElementById('joinBtn'));wirePicker(wrap)}

  // Replace create/join actions so selected dinosaur is synchronized by server.
  document.getElementById('createBtn').onclick=async()=>{
    try{
      const name=document.getElementById('createName').value.trim();if(!name){toast('名前を入れてね');return}
      const r=await fetch('/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,rounds:+document.getElementById('roundsSelect').value,dino:selectedDino})});
      const d=await r.json();if(!r.ok)throw new Error(d.detail||'作成できませんでした');
      Object.assign(net,{code:d.code,playerId:d.player_id,playerToken:d.player_token,hostToken:d.host_token});
      history.replaceState({},'',`/host/${d.code}#host=${d.host_token}&player=${d.player_token}`);connect();
    }catch(e){toast(e.message)}
  };
  document.getElementById('joinBtn').onclick=async()=>{
    try{
      const code=document.getElementById('joinCode').value.replace(/\D/g,'').slice(0,4),name=document.getElementById('joinName').value.trim();
      if(code.length!==4||!name){toast('コードと名前を入れてね');return}
      const r=await fetch(`/api/rooms/${code}/join`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,dino:selectedDino})});
      const d=await r.json();if(!r.ok)throw new Error(d.detail||'参加できませんでした');
      Object.assign(net,{code,playerId:d.player_id,playerToken:d.player_token,hostToken:null});history.replaceState({},'',`/join/${code}`);connect();
    }catch(e){toast(e.message)}
  };

  // Sound generated locally with Web Audio; no audio files are required.
  let audioCtx=null,audioOn=localStorage.getItem('dinoSound')!=='off',musicTimer=null,musicStep=0;
  const soundBtn=document.createElement('button');soundBtn.className='sound-toggle';soundBtn.type='button';soundBtn.textContent=audioOn?'🔊':'🔇';document.body.appendChild(soundBtn);
  function ensureAudio(){if(!audioOn)return null;if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}
  function tone(freq,dur=.08,type='square',gain=.035,delay=0){const a=ensureAudio();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(gain,a.currentTime+delay);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+delay+dur);o.connect(g);g.connect(a.destination);o.start(a.currentTime+delay);o.stop(a.currentTime+delay+dur+.02)}
  function sfx(kind){if(!audioOn)return;if(kind==='jump'){tone(360,.06);tone(520,.08,'square',.025,.045)}else if(kind==='dead'){tone(180,.14,'sawtooth',.04);tone(95,.25,'square',.03,.1)}else if(kind==='select'){tone(620,.045,'square',.025)}else if(kind==='stage'){tone(520,.06);tone(660,.06,'square',.025,.07);tone(820,.1,'square',.025,.14)}else if(kind==='win'){[523,659,784,1047].forEach((f,i)=>tone(f,.15,'square',.035,i*.11))}else if(kind==='count'){tone(330,.05,'square',.025)} }
  function startMusic(){if(musicTimer)return;musicTimer=setInterval(()=>{if(!audioOn||gameScreen.classList.contains('hidden')||!game.running)return;const notes=[196,247,294,330,294,247,220,262];tone(notes[musicStep++%notes.length],.07,'square',.012)},260)}
  soundBtn.onclick=()=>{audioOn=!audioOn;localStorage.setItem('dinoSound',audioOn?'on':'off');soundBtn.textContent=audioOn?'🔊':'🔇';if(audioOn){ensureAudio();sfx('select')}};
  document.addEventListener('pointerdown',()=>{ensureAudio();startMusic()},{once:true});

  let controls=gameScreen.querySelector('.game-controls');if(!controls){controls=document.createElement('div');controls.className='game-controls';gameScreen.appendChild(controls)}
  controls.innerHTML=`<button id="jumpBtn" type="button">JUMP！</button><div id="spectatorControls" class="spectator-controls hidden"><button id="specPrev" type="button">◀</button><div id="specLabel" class="spectator-label">観戦中<small>生存プレイヤーを追跡</small></div><button id="specNext" type="button">▶</button></div>`;
  let spectatorBanner=document.getElementById('spectatorBanner');if(!spectatorBanner){spectatorBanner=document.createElement('div');spectatorBanner.id='spectatorBanner';spectatorBanner.className='spectator-banner hidden';shell.appendChild(spectatorBanner)}
  let stageBadge=document.getElementById('stageBadge');if(!stageBadge){stageBadge=document.createElement('div');stageBadge.id='stageBadge';stageBadge.className='stage-badge';shell.appendChild(stageBadge)}
  let ghostLabel=document.getElementById('ghostLabel');if(!ghostLabel){ghostLabel=document.createElement('div');ghostLabel.id='ghostLabel';ghostLabel.className='ghost-label hidden';ghostLabel.textContent='👻 BEST GHOST';shell.appendChild(ghostLabel)}
  const jumpBtn=document.getElementById('jumpBtn'),spectatorControls=document.getElementById('spectatorControls'),specLabel=document.getElementById('specLabel');

  function resetSpectator(){game._spectating=false;game._spectatorId=null;game._spectateWorldX=0;spectatorBanner.classList.add('hidden');spectatorControls.classList.add('hidden');jumpBtn.classList.remove('hidden');jumpBtn.disabled=false;jumpBtn.textContent='JUMP！'}
  function livingOpponents(){return net.state?net.state.players.filter(p=>p.id!==net.playerId&&p.alive&&p.connected!==false).sort((a,b)=>b.distance-a.distance):[]}
  function pickSpectator(id){const live=livingOpponents();if(!live.length){game._spectatorId=null;return null}const p=live.find(x=>x.id===id)||live[0];game._spectatorId=p.id;if(!game._spectateWorldX)game._spectateWorldX=p.distance*PX_PER_M;return p}
  function cycleSpectator(dir){const live=livingOpponents();if(!live.length)return;let i=live.findIndex(p=>p.id===game._spectatorId);if(i<0)i=0;i=(i+dir+live.length)%live.length;game._spectatorId=live[i].id;game._spectateWorldX=live[i].distance*PX_PER_M;updateSpectatorUI()}
  function updateSpectatorUI(){const active=game.mode==='multi'&&!game.alive&&net.state?.stage==='playing';game._spectating=!!active;if(!active){spectatorBanner.classList.add('hidden');spectatorControls.classList.add('hidden');jumpBtn.classList.remove('hidden');jumpBtn.disabled=net.state?.stage==='countdown';return}const p=pickSpectator(game._spectatorId);jumpBtn.classList.add('hidden');spectatorControls.classList.remove('hidden');spectatorBanner.classList.remove('hidden');if(p){spectatorBanner.textContent=`👀 観戦中：${p.name} ${Math.floor(p.distance)}m｜自分 ${Math.floor(game.distance)}mでOUT`;specLabel.innerHTML=`${esc(p.name)} ${Math.floor(p.distance)}m<small>◀ ▶ で切替</small>`}else{spectatorBanner.textContent=`👀 自分 ${Math.floor(game.distance)}mでOUT　結果集計中…`;specLabel.innerHTML='全員OUT<small>結果を待っています…</small>'}}
  document.getElementById('specPrev').addEventListener('pointerdown',e=>{e.preventDefault();cycleSpectator(-1)},{passive:false});document.getElementById('specNext').addEventListener('pointerdown',e=>{e.preventDefault();cycleSpectator(1)},{passive:false});

  const originalJump=jump;
  jump=function(){if(game.mode==='multi'&&!game.alive)return;const was=game.onGround;originalJump();if(was&&!game.onGround)sfx('jump')};
  jumpBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(game.mode==='multi'&&!game.alive)return;if(game.mode==='solo'&&!game.alive){document.querySelector('#outOverlay b').textContent='OUT!';resetRun();game.running=true;jumpBtn.textContent='JUMP！';return}jump()},{passive:false});

  // More varied deterministic obstacle generation.
  segmentObjects=function(seg){
    if(seg<1)return[];const base=seg*620,r=randSeg(seg),out=[],meters=base/PX_PER_M;
    if(r<.18)out.push({type:'pit',x:base+220+randSeg(seg,2)*110,w:105+randSeg(seg,3)*70});
    else if(r<.43)out.push({type:'rock',x:base+255+randSeg(seg,4)*120,w:45+randSeg(seg,5)*30,h:42+randSeg(seg,6)*45});
    else if(r<.63)out.push({type:'log',x:base+245+randSeg(seg,4)*120,w:75+randSeg(seg,5)*35,h:32+randSeg(seg,6)*22});
    else if(r<.80)out.push({type:'bone',x:base+250+randSeg(seg,4)*110,w:55+randSeg(seg,5)*25,h:38+randSeg(seg,6)*22});
    else {out.push({type:meters>950?'lava':'rock',x:base+210,w:46,h:50});out.push({type:meters>1450?'meteor':'bone',x:base+390+randSeg(seg,7)*45,w:52,h:62})}
    return out;
  };
  collide=function(){const px=game.worldX,py=game.y,pw=52,ph=44;for(const o of nearObjects())if(o.type!=='pit'){if(px+pw*.35>o.x&&px-pw*.35<o.x+o.w&&py+ph>GROUND-o.h&&py<GROUND)return true}return false};

  const oldStartSolo=startSolo,oldResetRun=resetRun;
  startSolo=function(){resetSpectator();game.mode='solo';if(ghost?.seed)game.seed=ghost.seed;else game.seed=(Date.now()&0x7fffffff);resetRun();game.running=true;document.getElementById('soloExit').classList.remove('hidden');document.getElementById('rankList').innerHTML='';document.getElementById('roundHud').textContent=`ENDLESS  BEST ${Math.floor(game.best)}m`;ghostLabel.classList.toggle('hidden',!ghost);show('gameScreen');requestAnimationFrame(loop);startMusic()};
  resetRun=function(){oldResetRun();game._deathAnimUntil=0;game._soloSamples=[];game._lastGhostSample=0;if(game.mode!=='multi')resetSpectator();document.getElementById('tapHint').textContent='SPACE / 下のJUMPボタン';ghostLabel.classList.toggle('hidden',!(game.mode==='solo'&&ghost))};
  localDinoIndex=function(){if(game.mode==='solo')return selectedDino;return net.state?.players.find(p=>p.id===net.playerId)?.dino||0};

  die=function(){
    if(!game.alive)return;game.alive=false;game.running=false;game._deathWorldX=game.worldX;game._deathY=game.y;game._deathAnimUntil=performance.now()+650;sfx('dead');
    const overlay=document.getElementById('outOverlay');overlay.classList.remove('hidden');document.getElementById('outDistance').textContent=`${Math.floor(game.distance)}m`;
    if(game.mode==='solo'){
      const isBest=game.distance>game.best;
      if(isBest){game.best=game.distance;localStorage.setItem('dinoBest',String(game.best));ghost={seed:game.seed,dino:selectedDino,best:game.distance,samples:game._soloSamples.slice(-5000)};localStorage.setItem('dinoGhost',JSON.stringify(ghost));overlay.querySelector('b').textContent='NEW BEST!'}else overlay.querySelector('b').textContent='OUT!';
      document.getElementById('roundHud').textContent=`BEST ${Math.floor(game.best)}m`;jumpBtn.textContent='RETRY';setTimeout(()=>overlay.classList.add('hidden'),650);return;
    }
    overlay.querySelector('b').textContent='OUT!';sendRun(false);game._spectating=true;pickSpectator();updateSpectatorUI();setTimeout(()=>{if(game.mode==='multi'&&!game.alive)overlay.classList.add('hidden')},650);
  };

  // Sample the best solo run so the next attempt can see its jump timing.
  setInterval(()=>{if(game.mode==='solo'&&game.running&&game.alive){if(game.distance-game._lastGhostSample>=3){game._soloSamples.push({d:+game.distance.toFixed(1),y:+game.y.toFixed(1)});game._lastGhostSample=game.distance}}},70);

  handleState=function(s){
    net.state=s;
    if(s.stage==='lobby'){game._multiRoundKey='';resetSpectator();ghostLabel.classList.add('hidden');renderLobby(s);show('lobbyScreen');return}
    if(s.stage==='countdown'||s.stage==='playing'){
      const key=`${s.round_no}:${s.seed}`;if(game.mode!=='multi'||game._multiRoundKey!==key){game._multiRoundKey=key;resetSpectator();startMultiRound(s);document.getElementById('tapHint').textContent='SPACE / 下のJUMPボタン'}
      const self=s.players.find(p=>p.id===net.playerId);updateRemote(s);renderRanks(s);ghostLabel.classList.add('hidden');
      if(s.stage==='countdown'){const cd=document.getElementById('countdown');cd.classList.remove('hidden');const n=Math.max(1,Math.min(3,Math.ceil(s.countdown)));if(cd.textContent!==String(n))sfx('count');cd.textContent=n;game.running=false;jumpBtn.disabled=true}
      else{document.getElementById('countdown').classList.add('hidden');if(self&&!self.alive){if(game.alive){game.alive=false;game.running=false;game._deathWorldX=game.worldX;game._deathY=game.y}game.running=false;game._spectating=true;pickSpectator(game._spectatorId)}else{game.alive=true;game.running=true;jumpBtn.disabled=false}}
      updateSpectatorUI();show('gameScreen');startMusic();return;
    }
    if(s.stage==='round_result'||s.stage==='final_result'){game.running=false;resetSpectator();renderResult(s);show('resultScreen')}
  };

  renderRanks=function(s){const list=[...s.players].sort((a,b)=>b.distance-a.distance);document.getElementById('rankList').innerHTML=list.map((r,i)=>`<div class="rank-pill ${r.id===net.playerId?'me':''}">${i+1} ${esc(r.name)} ${Math.floor(r.distance)}m${!r.alive?' OUT':''}</div>`).join('')};

  function ensureQR(s){
    const card=document.querySelector('#lobbyScreen .card');if(!card)return;let grid=document.getElementById('lobbyShareGrid');if(!grid){grid=document.createElement('div');grid.id='lobbyShareGrid';grid.className='lobby-share-grid';const old=document.querySelector('#lobbyScreen .share');old.parentNode.insertBefore(grid,old);grid.appendChild(old);old.classList.add('lobby-share-main');const q=document.createElement('div');q.innerHTML='<div class="qr-box"><img id="roomQr" alt="参加QRコード"></div><div class="qr-caption">スマホで読み取って参加</div>';grid.appendChild(q)}const url=`${location.origin}/join/${s.code}`;document.getElementById('roomQr').src=`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(url)}`;
  }

  renderLobby=function(s){
    document.getElementById('roomCode').textContent=s.code;document.getElementById('roomRule').textContent=`${s.rounds_total}レース・総距離`;document.getElementById('shareUrl').value=`${location.origin}/join/${s.code}`;ensureQR(s);
    const host=s.host_player_id;let html='';for(let i=0;i<4;i++){const p=s.players[i];if(p)html+=`<div class="player-card"><div class="dino-chip"><canvas class="pixel-dino-card" width="84" height="54" data-dino="${p.dino}"></canvas></div><div class="player-name">${esc(p.name)}</div><div class="dino-species">${SPECIES[p.dino]||'DINO'}</div>${p.id===host?'<span class="host-badge">HOST</span>':''}</div>`;else html+='<div class="player-card empty"><div class="dino-chip"><span class="dino-mini">＋</span></div><div class="player-name">募集中</div></div>'}
    document.getElementById('players').innerHTML=html;document.querySelectorAll('.pixel-dino-card').forEach(c=>{const cc=c.getContext('2d');cc.imageSmoothingEnabled=false;paintDino(cc,42,2,+c.dataset.dino,0,'idle',3)});const isHost=s.is_host;document.getElementById('startBtn').classList.toggle('hidden',!isHost);document.getElementById('startBtn').disabled=s.players.length<2;document.getElementById('lobbyStatus').textContent=isHost?(s.players.length<2?'あと1人来たらスタートできる！':`${s.players.length}人参加中。準備できたらスタート！`):'ホストがゲームを開始するまで待ってね';
  };

  function stageFor(m){let idx=0;for(let i=0;i<STAGES.length;i++)if(m>=STAGES[i].from)idx=i;return {idx,...STAGES[idx]}}
  function watchedDistance(){if(game._spectating){const p=net.state?.players.find(x=>x.id===game._spectatorId);if(p)return p.distance}return game.distance}
  setInterval(()=>{if(gameScreen.classList.contains('hidden'))return;const st=stageFor(watchedDistance());if(st.idx!==game._stageIndex){game._stageIndex=st.idx;stageBadge.classList.remove('pop');void stageBadge.offsetWidth;stageBadge.classList.add('pop');sfx('stage')}stageBadge.textContent=st.name},120);

  function objectsAt(worldX){const cam=worldX-PLAYER_X,first=Math.floor((cam-200)/620),last=Math.floor((cam+W+300)/620),out=[];for(let s=Math.max(0,first);s<=last;s++)out.push(...segmentObjects(s));return out}
  function drawPixelObject(o,sx){const y=GROUND-o.h;if(o.type==='pit'){ctx.fillStyle='#11131d';ctx.fillRect(Math.round(sx),GROUND-10,Math.round(o.w),H-GROUND+20);ctx.fillStyle='#39251e';for(let x=sx;x<sx+o.w;x+=18)ctx.fillRect(Math.round(x),GROUND-13,12,8);return}ctx.save();ctx.translate(Math.round(sx),Math.round(y));if(o.type==='rock'){R(ctx,5,8,o.w-10,o.h-8,'#626a70');R(ctx,12,2,o.w*.55,o.h*.3,'#889197');R(ctx,0,o.h-12,o.w,12,'#444b50')}else if(o.type==='log'){R(ctx,0,8,o.w,o.h-8,'#71442d');R(ctx,7,0,o.w-14,10,'#8d5a36');R(ctx,o.w-14,8,14,o.h-8,'#4d2c20');R(ctx,o.w-10,12,4,4,'#bd8050')}else if(o.type==='bone'){R(ctx,8,12,o.w-16,9,'#eee0ba');R(ctx,0,8,14,15,'#f7eac7');R(ctx,o.w-14,8,14,15,'#f7eac7');R(ctx,6,4,8,8,'#f7eac7');R(ctx,o.w-14,4,8,8,'#f7eac7')}else if(o.type==='lava'){R(ctx,0,12,o.w,o.h-12,'#5d342d');R(ctx,4,3,o.w-8,14,'#ff6d31');R(ctx,9,0,10,8,'#ffb52f');R(ctx,o.w-18,5,10,7,'#ffd75a')}else{R(ctx,4,5,o.w-8,o.h-5,'#493e61');R(ctx,10,0,o.w*.45,o.h*.25,'#806e99');R(ctx,0,o.h-10,o.w,10,'#30293f')}ctx.restore()}

  function drawBackdrop(cam,meters){const st=stageFor(meters);ctx.fillStyle=st.sky;ctx.fillRect(0,0,W,H);ctx.fillStyle=st.sky2;ctx.fillRect(0,180,W,GROUND-180);
    if(st.idx===0){ctx.fillStyle='#4a8894';for(let i=-1;i<5;i++){const x=i*350-(cam*.08)%350;ctx.beginPath();ctx.moveTo(x,GROUND);ctx.lineTo(x+170,180);ctx.lineTo(x+340,GROUND);ctx.fill()}ctx.fillStyle='#397c52';for(let i=-1;i<8;i++){const x=i*170-(cam*.18)%170;ctx.fillRect(x+72,330,15,105);ctx.beginPath();ctx.arc(x+80,330,42,0,Math.PI*2);ctx.fill()}}
    else if(st.idx===1){ctx.fillStyle='#255d45';for(let i=-1;i<10;i++){const x=i*125-(cam*.22)%125;ctx.fillRect(x+54,260,16,180);ctx.fillStyle='#367b52';ctx.fillRect(x+22,260,82,28);ctx.fillStyle='#255d45'}ctx.fillStyle='#214f3c';for(let i=-1;i<8;i++){const x=i*170-(cam*.4)%170;ctx.beginPath();ctx.arc(x+70,390,55,Math.PI,0);ctx.fill()}}
    else if(st.idx===2){ctx.fillStyle='#553a3c';for(let i=-1;i<5;i++){const x=i*380-(cam*.1)%380;ctx.beginPath();ctx.moveTo(x,GROUND);ctx.lineTo(x+175,205);ctx.lineTo(x+350,GROUND);ctx.fill();ctx.fillStyle='#f06b38';ctx.fillRect(x+167,220,18,65);ctx.fillStyle='#553a3c'}ctx.fillStyle='#ef7d3c';for(let i=0;i<8;i++){const x=(i*157-(cam*.5)%157+W)%W;ctx.fillRect(x,360+(i%3)*18,7,7)}}
    else{ctx.fillStyle='#141934';for(let i=0;i<55;i++){const x=(i*83-(cam*.025)%83+W)%W,y=30+(i*47)%250;ctx.fillRect(x,y,2+(i%2),2+(i%2))}ctx.fillStyle='#684e72';for(let i=-1;i<6;i++){const x=i*260-(cam*.12)%260;ctx.beginPath();ctx.moveTo(x,GROUND);ctx.lineTo(x+110,265);ctx.lineTo(x+240,GROUND);ctx.fill()}for(let i=0;i<4;i++){const x=(i*290-(cam*.7)%290+W)%W,y=110+(i%3)*65;ctx.fillStyle='#ff9b55';ctx.fillRect(x,y,28,9);ctx.fillStyle='#d9b27b';ctx.fillRect(x+22,y-5,14,14)}}
    ctx.fillStyle=st.soil;ctx.fillRect(0,GROUND,W,H-GROUND);ctx.fillStyle=st.ground;ctx.fillRect(0,GROUND-12,W,18);ctx.fillStyle='rgba(255,255,255,.14)';for(let x=-(cam%40);x<W;x+=40)ctx.fillRect(Math.round(x),GROUND-10,18,4)
  }

  function labelDino(x,y,name,me,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.font='900 13px ui-monospace,monospace';ctx.textAlign='center';const label=me?`YOU ${name}`:name,tw=ctx.measureText(label).width;ctx.fillStyle='rgba(7,17,29,.82)';ctx.fillRect(x-tw/2-7,y-29,tw+14,19);ctx.fillStyle='#fff';ctx.fillText(label,x,y-15);ctx.restore()}
  function drawPixelDino(x,y,index,me,name,stateOverride=null,alphaOverride=null){const frame=Math.floor(performance.now()/105)%2,state=stateOverride||(game.onGround?'run':'air'),alpha=alphaOverride??(me?1:.88);paintDino(ctx,x,y,index,frame,state,4,alpha);labelDino(x,y,name,me,alpha)}
  function ghostSampleAt(d){if(!ghost?.samples?.length)return null;let lo=0,hi=ghost.samples.length-1;while(lo<hi){const mid=(lo+hi>>1);if(ghost.samples[mid].d<d)lo=mid+1;else hi=mid}return ghost.samples[lo]}

  draw=function(){
    let focusWorld=game.worldX,focusDistance=game.distance,focusY=game.y;
    if(game._spectating){const p=net.state?.players.find(x=>x.id===game._spectatorId);if(p){const target=p.distance*PX_PER_M;game._spectateWorldX+=(target-game._spectateWorldX)*.17;focusWorld=game._spectateWorldX;focusDistance=p.distance;focusY=p.y||GROUND-47}}
    const cam=focusWorld-PLAYER_X;ctx.clearRect(0,0,W,H);drawBackdrop(cam,focusDistance);
    for(const o of objectsAt(focusWorld))drawPixelObject(o,o.x-cam);

    if(game.mode==='solo'&&ghost&&game.alive){const gs=ghostSampleAt(game.distance);if(gs&&game.distance<=ghost.best){drawPixelDino(PLAYER_X,gs.y,ghost.dino??selectedDino,false,'BEST','air',.36)}}

    if(game.mode==='multi'&&net.state){for(const p of net.state.players){if(!p.alive)continue;if(game._spectating&&p.id===game._spectatorId){drawPixelDino(PLAYER_X,p.y||GROUND-47,p.dino,true,p.name);continue}if(!game._spectating&&p.id===net.playerId)continue;const sx=PLAYER_X+(p.distance-focusDistance)*PX_PER_M;if(sx>-90&&sx<W+90)drawPixelDino(sx,p.y||GROUND-47,p.dino,false,p.name)}}
    if(!game._spectating&&game.alive)drawPixelDino(PLAYER_X,game.y,localDinoIndex(),true,localName());
    if(performance.now()<game._deathAnimUntil&&!game.alive&&!game._spectating)drawPixelDino(PLAYER_X,game._deathY,localDinoIndex(),true,localName(),'dead');
  };
  drawDino=function(x,y,index,me,name){drawPixelDino(x,y,index,me,name)};

  const oldRenderResult=renderResult;
  renderResult=function(s){
    const key=`${s.stage}-${s.round_no}-${s.result_rows.map(x=>x.actual_total).join('-')}`;if(game.resultKey===key)return;game.resultKey=key;
    const final=s.stage==='final_result',hidden=s.hide_totals;document.getElementById('resultRound').textContent=final?'FINAL RESULT':`ROUND ${s.round_no} RESULT`;document.getElementById('resultHeading').textContent=final?'TOTAL RESULT':'RACE RESULT';document.getElementById('mysteryText').classList.toggle('hidden',!hidden);document.getElementById('nextBtn').classList.toggle('hidden',!s.is_host);document.getElementById('homeBtn').classList.toggle('hidden',!final);document.getElementById('nextBtn').textContent=final?'もう一度！':'次のレースへ';
    const rows=[...s.result_rows].sort((a,b)=>b.actual_total-a.actual_total),max=Math.max(...rows.map(r=>final?r.actual_total:r.round_distance),1),leader=rows[0],gap=rows[1]?leader.actual_total-rows[1].actual_total:0;
    let phrase='';if(final&&rows[1])phrase=gap<=30?'📸 PHOTO FINISH!!':gap<=100?'🔥 超接戦!!':gap<=300?'⚡ ナイスレース!':'👑 圧倒的勝利!';
    document.getElementById('winnerStage').innerHTML=final?`<div class="crown">🏆</div><div class="winname">${esc(leader.name)} WIN!!</div><div class="close">${phrase}</div>${rows[1]?`<div class="result-big-gap">差 ${Math.round(gap)}m</div>`:''}`:'';
    document.getElementById('bars').innerHTML=rows.map((r,i)=>{const value=final?r.actual_total:r.round_distance,shown=hidden?'???m':`${Math.floor(value)}m`,diff=i===0?'':`<div class="diff">−${Math.floor((final?leader.actual_total:rows[0].round_distance)-value)}m</div>`;return`<div class="bar-row"><div class="bar-name">${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${esc(r.name)}</div><div class="bar-track"><div class="bar-fill" style="background:${r.color};width:0"></div></div><div class="bar-value">${shown}${diff}</div></div>`}).join('');
    const wrap=document.querySelector('.result-wrap');wrap.classList.toggle('final-flash',final);wrap.classList.toggle('photo-finish',final&&gap<=30);setTimeout(()=>document.querySelectorAll('.bar-fill').forEach((b,i)=>{const v=final?rows[i].actual_total:rows[i].round_distance;b.style.width=`${Math.max(4,v/max*100)}%`}),180);if(final){sfx('win');confetti(42)}else tone(440,.08,'square',.025);
  };
  function confetti(n){const colors=['#ffd65a','#8cf0a5','#56d7ff','#ff6f91','#fff'];for(let i=0;i<n;i++){const p=document.createElement('i');p.className='confetti-piece';p.style.left=`${Math.random()*100}vw`;p.style.background=colors[i%colors.length];p.style.setProperty('--drift',`${-90+Math.random()*180}px`);p.style.animationDelay=`${Math.random()*.45}s`;document.body.appendChild(p);setTimeout(()=>p.remove(),3000)}}
})();