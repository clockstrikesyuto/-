(async()=>{
  const ungzip=async url=>{
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error(`${url}: ${r.status}`);
    if(!('DecompressionStream' in window)) throw new Error('このブラウザは読み込み方式に未対応です');
    const stream=r.body.pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  };
  try{
    const cssFiles=[...Array(8)].map((_,i)=>`cs${String(i+1).padStart(2,'0')}.bin`);
    const jsFiles=[...Array(16)].map((_,i)=>`js${String(i+1).padStart(2,'0')}.bin`);
    const [cssParts,jsParts]=await Promise.all([
      Promise.all(cssFiles.map(ungzip)),
      Promise.all(jsFiles.map(ungzip))
    ]);
    const style=document.createElement('style');
    style.textContent=cssParts.join('');
    document.head.appendChild(style);
    (0,eval)(jsParts.join(''));
  }catch(err){
    console.error(err);
    document.body.innerHTML=`<div style="min-height:100vh;background:#080a14;color:white;display:grid;place-items:center;font-family:system-ui;padding:24px;text-align:center"><div><h1>DECK DIVE</h1><p>ゲームの読み込みに失敗しました。</p><small>${String(err.message||err)}</small></div></div>`;
  }
})();