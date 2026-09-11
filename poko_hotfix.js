(() => {
  // Extend only very short gameplay timeouts. In the original game these are
  // the final-rush target lifetimes (about 235-350ms). This keeps the rush fast
  // but gives a real finger tap time to register.
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = function(fn, delay, ...args) {
    let adjusted = delay;
    if (typeof delay === 'number' && delay >= 180 && delay <= 380) {
      adjusted = Math.max(delay, 410);
    }
    return nativeSetTimeout(fn, adjusted, ...args);
  };

  // Browser zoom/gesture suppression is limited to the actual game screen.
  document.addEventListener('gesturestart', e => {
    if (e.target && e.target.closest && e.target.closest('#gameScreen')) e.preventDefault();
  }, { passive: false });

  document.addEventListener('dblclick', e => {
    if (e.target && e.target.closest && e.target.closest('#gameScreen')) e.preventDefault();
  }, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    if (!(e.target && e.target.closest && e.target.closest('#gameScreen'))) return;
    const now = Date.now();
    if (now - lastTouchEnd < 360) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('DOMContentLoaded', () => {
    const board = document.getElementById('board');
    if (!board) return;

    // Keep track of the instant a target disappears. A human tap that lands a
    // split-second after the visual vanishes is ignored instead of becoming MISS.
    const recentlyGone = new WeakMap();
    const obs = new MutationObserver(records => {
      for (const rec of records) {
        if (rec.type !== 'childList' || !rec.target.classList?.contains('hole')) continue;
        for (const node of rec.removedNodes) {
          if (node.nodeType === 1 && node.classList?.contains('target')) {
            recentlyGone.set(rec.target, performance.now());
          }
        }
      }
    });
    obs.observe(board, { subtree: true, childList: true });

    document.addEventListener('pointerdown', e => {
      if (!(e.target instanceof Element)) return;
      const hole = e.target.closest('.hole');
      if (!hole || !hole.closest('#board')) return;
      if (e.target.closest('.target')) return;
      const goneAt = recentlyGone.get(hole) || -9999;
      if (performance.now() - goneAt < 190) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // Make the penalty target explicit in the legend too.
    const legend = document.querySelector('.legend');
    if (legend) {
      legend.innerHTML = '<span>🙂 +1</span><span class="lgold">⭐ +3</span><span class="lbad decoy-legend">❌ おじゃま −1</span><span class="lbad">💣 −2</span>';
    }
  });
})();
