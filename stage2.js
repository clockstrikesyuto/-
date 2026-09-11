(() => {
  const gameScreen=document.getElementById('gameScreen');
  const shell=gameScreen&&gameScreen.querySelector('.game-shell');
  if(!gameScreen||!shell)return;

  const STAGES2=[
    {name:'はじまりの草原',emoji:'🌿',from:0,sub:'RUN INTO THE WILD'},
    {name:'原始ジャングル',emoji:'🌴',from:400,sub:'PRIMAL JUNGLE'},
    {name:'化石洞窟',emoji:'💀',from:800,sub:'FOSSIL CAVE'},
    {name:'氷河地帯',emoji:'❄️',from:1200,sub:'ICE AGE'},
    {name:'火山地帯',emoji:'🌋',from:1600,sub:'VOLCANIC ZONE'},
    {name:'隕石終末地帯',emoji:'☄️',from:2100,sub:'EXTINCTION RUN'},
    {name:'UNKNOWN',emoji:'🌀',from:2600,sub:'??? BEYOND TIME ???'}
  ];
  const EVENTS=[
    {m:650,text:'🦕 ドン… ドン… 巨大な足音が近づいてくる…'},
    {m:1020,text:'⚠️ 落盤注意！ 洞窟が揺れている！',shake:true},
    {m:1450,text:'❄️ 氷がきしむ音がする…'},
    {m:1900,text:'🌋 大噴火！！ 地面が震える！',shake:true},
    {m:2380,text:'☄️ 巨大隕石 接近中！！',shake:true},
    {m:2860,text:'🌀 ここは……どこだ？',shake:true}
  ];
  const ICONS=STAGES2.map(s=>s.emoji);

  function stageFor(m){let i=0;for(let n=0;n<STAGES2.length;n++)if(m>=STAGES2[n].from)i=n;return {idx:i,...STAGES2[i]}}
  function watchedDistance(){if(game._spectating){const p=net.state?.players.find(x=>x.id===game._spectatorId);if(p)return p.distance}return game.distance||0}

  const badge=document.createElement('div');badge.className='stage2-badge';shell.appendChild(badge);
  const progress=document.createElement('div');progress.className='stage2-progress';shell.appendChild(progress);
  const next=document.createElement('div');next.className='stage2-next';shell.appendChild(next);
  const intro=document.createElement('div');intro.className='stage2-intro';intro.innerHTML='<div class="stage2-intro-card"><div class="stage2-intro-num"></div><div class="stage2-intro-name"></div><div class="stage2-intro-sub"></div></div>';shell.appendChild(intro);
  const eventBox=document.createElement('div');eventBox.className='stage2-event';shell.appendChild(eventBox);

  function renderProgress(idx){let h='';for(let i=0;i<ICONS.length;i++){h+=`<div class="stage2-node ${i<idx?'done':''} ${i===idx?'active':''}">${ICONS[i]}</div>`;if(i<ICONS.length-1)h+=`<div class="stage2-link ${i<idx?'done':''}"></div>`}progress.innerHTML=h}
  function showIntro(st){intro.querySelector('.stage2-intro-num').textContent=`STAGE ${st.idx+1}`;intro.querySelector('.stage2-intro-name').textContent=`${st.emoji} ${st.name}`;intro.querySelector('.stage2-intro-sub').textContent=st.sub;intro.classList.remove('show');void intro.offsetWidth;intro.classList.add('show');stageTone(st.idx,true)}
  function showEvent(e){eventBox.textContent=e.text;eventBox.classList.remove('show');void eventBox.offsetWidth;eventBox.classList.add('show');if(e.shake){shell.classList.remove('stage-shake');void shell.offsetWidth;shell.classList.add('stage-shake')}stageTone(stageFor(watchedDistance()).idx,true)}

  let lastStage=-1,lastDistance=0,seen=new Set();
  setInterval(()=>{
    if(gameScreen.classList.contains('hidden'))return;
    const d=watchedDistance();
    if(d+80<lastDistance){lastStage=-1;seen=new Set()}
    const st=stageFor(d);
    badge.textContent=`STAGE ${st.idx+1}  ${st.emoji} ${st.name}`;
    renderProgress(st.idx);
    const ns=STAGES2[st.idx+1];next.textContent=ns?`NEXT ${ns.emoji}  あと ${Math.max(0,Math.ceil(ns.from-d))}m`:'MAX ZONE  ∞';
    if(st.idx!==lastStage){showIntro(st);lastStage=st.idx}
    for(const e of EVENTS){if(d>=e.m&&lastDistance<e.m&&!seen.has(e.m)){seen.add(e.m);showEvent(e)}}
    lastDistance=d;
  },120);

  // Seven-stage deterministic obstacle set. Same seed = same course for everyone.
  segmentObjects=function(seg){
    if(seg<1)return[];
    const base=seg*620,m=base/PX_PER_M,st=stageFor(m),r=randSeg(seg),out=[];
    const x1=base+220+randSeg(seg,2)*115;
    const x2=base+390+randSeg(seg,7)*45;
    const rock=()=>({type:'rock',x:x1,w:44+randSeg(seg,5)*28,h:40+randSeg(seg,6)*42});
    const pit=()=>({type:'pit',x:x1,w:100+randSeg(seg,3)*62});
    const log=()=>({type:'log',x:x1,w:72+randSeg(seg,5)*34,h:30+randSeg(seg,6)*20});
    const bone=()=>({type:'bone',x:x1,w:54+randSeg(seg,5)*24,h:36+randSeg(seg,6)*22});
    const lava=()=>({type:'lava',x:x1,w:68+randSeg(seg,5)*42,h:30+randSeg(seg,6)*24});
    const meteor=(x=x1)=>({type:'meteor',x,w:46+randSeg(seg,5)*26,h:48+randSeg(seg,6)*30});
    if(st.idx===0){
      if(r<.18)out.push(pit());else if(r<.70)out.push(rock());else out.push(bone());
    }else if(st.idx===1){
      if(r<.12)out.push(pit());else if(r<.62)out.push(log());else if(r<.85)out.push(rock());else{out.push(log());out.push({...rock(),x:x2,w:40,h:44})}
    }else if(st.idx===2){
      if(r<.22)out.push(pit());else if(r<.56)out.push(rock());else if(r<.80)out.push(bone());else{out.push({...rock(),x:x1,w:42,h:58});out.push({type:'rock',x:x2,w:46,h:68})}
    }else if(st.idx===3){
      if(r<.32)out.push(pit());else if(r<.70)out.push({...rock(),h:48+randSeg(seg,6)*35});else out.push(bone());
    }else if(st.idx===4){
      if(r<.20)out.push(pit());else if(r<.63)out.push(lava());else if(r<.84)out.push(rock());else{out.push(lava());out.push({...rock(),x:x2,w:42,h:54})}
    }else if(st.idx===5){
      if(r<.24)out.push(pit());else if(r<.72)out.push(meteor());else{out.push(meteor(x1));out.push({...meteor(x2),w:42,h:56})}
    }else{
      if(r<.18)out.push(pit());else if(r<.40)out.push(meteor());else if(r<.60)out.push(lava());else if(r<.80)out.push(bone());else{out.push({...meteor(x1),w:40,h:54});out.push({type:'bone',x:x2,w:54,h:45})}
    }
    return out;
  };
  collide=function(){const px=game.worldX,py=game.y,pw=52,ph=44;for(const o of nearObjects())if(o.type!=='pit'){if(px+pw*.35>o.x&&px-pw*.35<o.x+o.w&&py+ph>GROUND-o.h&&py<GROUND)return true}return false};

  // Extra stage atmosphere layered over the existing pixel world.
  const oldDraw=draw;
  draw=function(){
    oldDraw();
    const d=watchedDistance(),st=stageFor(d),t=performance.now()/1000;
    ctx.save();
    if(st.idx===0){
      ctx.globalAlpha=.22;ctx.strokeStyle='#173b4a';ctx.lineWidth=3;for(let i=0;i<3;i++){const x=((i*330+t*28)%1100)-50,y=145+i*42;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8,y-5);ctx.lineTo(x+16,y);ctx.stroke()}
    }else if(st.idx===1){
      ctx.globalAlpha=.18;ctx.fillStyle='#0a4d2e';for(let i=0;i<8;i++){const x=(i%2)?W-26-i*5:8+i*5,y=90+(i*61)%320;ctx.fillRect(x,y,34,11);ctx.fillRect(x+10,y-12,12,34)}
    }else if(st.idx===2){
      const g=ctx.createRadialGradient(PLAYER_X,GROUND-70,45,PLAYER_X,GROUND-70,410);g.addColorStop(0,'rgba(0,0,0,.05)');g.addColorStop(.55,'rgba(0,0,0,.30)');g.addColorStop(1,'rgba(0,0,0,.72)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(8,10,14,.72)';for(let i=0;i<14;i++){const x=i*78-(game.worldX*.05)%78,h=35+(i%4)*18;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+35,h);ctx.lineTo(x+65,0);ctx.fill()}
    }else if(st.idx===3){
      ctx.fillStyle='rgba(210,248,255,.18)';ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(255,255,255,.78)';for(let i=0;i<34;i++){const x=(i*91+t*38)%W,y=(i*53+t*75)%GROUND;ctx.fillRect(x,y,3+(i%3),3+(i%2))}ctx.fillStyle='rgba(220,250,255,.6)';for(let i=0;i<9;i++){const x=i*125;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+22,42+(i%3)*20);ctx.lineTo(x+44,0);ctx.fill()}
    }else if(st.idx===4){
      ctx.fillStyle='rgba(130,28,10,.16)';ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(35,25,24,.55)';for(let i=0;i<24;i++){const x=(i*73+t*19)%W,y=(i*37+t*22)%330;ctx.fillRect(x,y,3+(i%3),3+(i%3))}ctx.fillStyle='rgba(255,83,24,.16)';ctx.fillRect(0,GROUND-55,W,55)
    }else if(st.idx===5){
      ctx.fillStyle='rgba(10,8,33,.2)';ctx.fillRect(0,0,W,H);for(let i=0;i<7;i++){const x=((i*181-t*(120+i*12))%(W+240))+W+120,y=80+(i*47)%260;ctx.strokeStyle=i%2?'#ffc06b':'#fff1ad';ctx.lineWidth=4+(i%3);ctx.beginPath();ctx.moveTo(x-65,y-28);ctx.lineTo(x,y);ctx.stroke()}
    }else{
      ctx.fillStyle='rgba(39,12,66,.16)';ctx.fillRect(0,0,W,H);for(let i=0;i<6;i++){ctx.fillStyle=i%2?'rgba(90,255,221,.12)':'rgba(255,80,220,.10)';const y=55+i*73+Math.sin(t*3+i)*9;ctx.fillRect(0,y,W,10+(i%2)*6)}ctx.strokeStyle='rgba(151,255,222,.35)';ctx.lineWidth=2;for(let i=0;i<5;i++){const x=110+i*190,y=170+(i%2)*70;ctx.strokeRect(x,y,28,28);ctx.strokeRect(x+7,y+7,14,14)}}
    ctx.restore();
  };

  // Stage-specific low-volume motifs. It respects the existing sound toggle.
  let ac=null,musicStep=0;
  const seqs=[
    [196,247,294,247],[174,220,262,330],[130,155,196,155],[220,277,330,370],[147,196,233,294],[110,165,220,330],[185,277,415,311]
  ];
  const tempos=[1050,900,1200,1050,760,620,840];
  function soundEnabled(){const b=document.querySelector('.sound-toggle');return !b||b.textContent.includes('🔊')}
  function initAudio(){if(!soundEnabled())return;if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume()}
  function stageTone(idx,loud=false){if(!soundEnabled())return;initAudio();if(!ac)return;const o=ac.createOscillator(),g=ac.createGain();o.type=idx>=4?'sawtooth':'triangle';o.frequency.value=seqs[idx][musicStep%seqs[idx].length]*(loud?2:1);g.gain.setValueAtTime(loud?.018:.004,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+(loud?.18:.09));o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+(loud?.2:.11))}
  document.addEventListener('pointerdown',initAudio,{once:true});
  let lastBeat=0;
  setInterval(()=>{if(gameScreen.classList.contains('hidden')||!game.running||!soundEnabled())return;const st=stageFor(watchedDistance()),now=performance.now();if(now-lastBeat>=tempos[st.idx]){lastBeat=now;stageTone(st.idx,false);musicStep++}},140);
})();