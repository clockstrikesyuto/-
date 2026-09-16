(()=>{
  'use strict';

  const root=document.documentElement;
  const screen=()=>document.getElementById('screen');
  const hud=()=>document.getElementById('hud');

  let raf=0;
  const syncLayout=()=>{
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      const vv=window.visualViewport;
      const h=Math.round(vv?.height||window.innerHeight||root.clientHeight||0);
      if(h>0) root.style.setProperty('--vvh',`${h}px`);

      const hEl=hud();
      let hh=0;
      if(hEl && !hEl.classList.contains('hidden')){
        const r=hEl.getBoundingClientRect();
        hh=Math.max(0,Math.round(r.height));
      }
      root.style.setProperty('--hudh',`${hh}px`);
    });
  };

  syncLayout();
  window.addEventListener('resize',syncLayout,{passive:true});
  window.addEventListener('orientationchange',syncLayout,{passive:true});
  window.visualViewport?.addEventListener('resize',syncLayout,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncLayout,{passive:true});
  window.addEventListener('pageshow',syncLayout,{passive:true});

  if('ResizeObserver' in window){
    const ro=new ResizeObserver(syncLayout);
    const observe=()=>{
      const h=hud();
      if(h) ro.observe(h);
      const s=screen();
      if(s) ro.observe(s);
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',observe,{once:true});
    else observe();
  }

  const mo=new MutationObserver(syncLayout);
  const startMutationWatch=()=>{
    const h=hud();
    if(h) mo.observe(h,{attributes:true,attributeFilter:['class','style'],childList:true,subtree:true});
    const s=screen();
    if(s) mo.observe(s,{childList:true,subtree:false});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startMutationWatch,{once:true});
  else startMutationWatch();

  /* Keep route auto-focus inside the game's scroll container. Never scroll Safari's page. */
  const nativeScrollIntoView=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(options){
    if(this.classList?.contains('route-row')&&this.classList.contains('current')){
      const sc=screen();
      if(sc){
        requestAnimationFrame(()=>{
          const sr=sc.getBoundingClientRect();
          const cr=this.getBoundingClientRect();
          const txt=this.querySelector('.route-floor')?.textContent||'';
          const floor=parseInt(txt.replace(/\D/g,''),10)||3;
          const visibleAnchor=floor<=2?0.62:0.46;
          let target=sc.scrollTop+(cr.top-sr.top)-(sc.clientHeight*visibleAnchor);
          const max=Math.max(0,sc.scrollHeight-sc.clientHeight);
          target=Math.max(0,Math.min(max,target));
          sc.scrollTo({top:target,behavior:'auto'});
        });
        return;
      }
    }
    return nativeScrollIntoView.call(this,options);
  };

  /* App-like touch behaviour: no text selection, image drag, or Safari callout. */
  document.addEventListener('contextmenu',e=>{
    if(!e.target.closest?.('input,textarea,[contenteditable="true"]')) e.preventDefault();
  },true);
  document.addEventListener('selectstart',e=>{
    if(!e.target.closest?.('input,textarea,[contenteditable="true"]')) e.preventDefault();
  },true);
  document.addEventListener('dragstart',e=>e.preventDefault(),true);
  document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});

  /* Prevent page-level jumps caused by focus/scroll helpers; internal #screen remains scrollable. */
  window.addEventListener('scroll',()=>{
    if(window.scrollY!==0 || window.scrollX!==0) window.scrollTo(0,0);
  },{passive:true});

  setTimeout(syncLayout,50);
  setTimeout(syncLayout,250);
})();
