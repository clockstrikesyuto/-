(()=>{
  'use strict';
  const syncViewport=()=>{
    const h=Math.round(window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight||0);
    if(h>0) document.documentElement.style.setProperty('--vvh',`${h}px`);
  };
  syncViewport();
  window.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});

  const nativeScrollIntoView=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(options){
    if(this.classList?.contains('route-row')&&this.classList.contains('current')){
      const sc=document.getElementById('screen');
      if(sc){
        requestAnimationFrame(()=>{
          const sr=sc.getBoundingClientRect();
          const cr=this.getBoundingClientRect();
          const txt=this.querySelector('.route-floor')?.textContent||'';
          const n=parseInt(txt.replace(/\D/g,''),10)||3;
          const anchor=n<=2?0.68:0.48;
          const target=sc.scrollTop+(cr.top-sr.top)-(sc.clientHeight*anchor);
          sc.scrollTo({top:Math.max(0,target),behavior:'auto'});
        });
        return;
      }
    }
    return nativeScrollIntoView.call(this,options);
  };

  document.addEventListener('contextmenu',e=>e.preventDefault(),true);
  document.addEventListener('selectstart',e=>e.preventDefault(),true);

  // Cards used to open details on a long press. Block only the pointer-down
  // event so normal tap/click play and reward selection still work.
  document.addEventListener('pointerdown',e=>{
    if(e.target.closest?.('.card')) e.stopImmediatePropagation();
  },true);
})();
