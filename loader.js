(async()=>{
  const ungzip=async url=>{
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error(`${url}: ${r.status}`);
    if(!('DecompressionStream' in window)) throw new Error('このブラウザは読み込み方式に未対応です');
    const stream=r.body.pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  };
  try{
    const [css,p1,p2a,p2b1,p2b2]=await Promise.all([
      ungzip('style.bin'),ungzip('app1.bin'),ungzip('app2a.bin'),ungzip('app2b1.bin'),ungzip('app2b2.bin')
    ]);
    const style=document.createElement('style');
    style.textContent=css;
    document.head.appendChild(style);
    (0,eval)(p1+p2a+p2b1+p2b2);
  }catch(err){
    console.error(err);
    document.body.innerHTML=`<div style="min-height:100vh;background:#080a14;color:white;display:grid;place-items:center;font-family:system-ui;padding:24px;text-align:center"><div><h1>DECK DIVE</h1><p>ゲームの読み込みに失敗しました。</p><small>${String(err.message||err)}</small></div></div>`;
  }
})();
