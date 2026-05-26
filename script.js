/* FYP — small progressive enhancements. No frameworks, no analytics. */
(() => {
  const body = document.body;
  const toggle = document.getElementById('motion-toggle');
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');

  // initialize motion state — honor system preference + stored choice
  const stored = (() => { try { return localStorage.getItem('fyp.motion'); } catch { return null; } })();
  const initialOff = stored === 'off' || (stored === null && prefersReduced.matches);
  applyMotion(initialOff);

  toggle?.addEventListener('click', () => {
    const next = body.dataset.motion !== 'off';
    applyMotion(next);
    try { localStorage.setItem('fyp.motion', next ? 'off' : 'on'); } catch {}
  });

  prefersReduced.addEventListener?.('change', (e) => {
    if (stored !== null) return; // user override wins
    applyMotion(e.matches);
  });

  function applyMotion(off) {
    if (off) {
      body.dataset.motion = 'off';
      toggle?.setAttribute('aria-pressed', 'true');
      // pause videos to be polite to battery
      document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch {} });
    } else {
      delete body.dataset.motion;
      toggle?.setAttribute('aria-pressed', 'false');
      document.querySelectorAll('video').forEach((v) => { try { v.play().catch(() => {}); } catch {} });
    }
  }

  // ---------- the easter egg ----------
  // type "fyp" anywhere to invert the page for 1.2s
  let buf = '';
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length !== 1) return;
    buf = (buf + e.key.toLowerCase()).slice(-3);
    if (buf === 'fyp') {
      buf = '';
      const html = document.documentElement;
      html.style.filter = 'invert(1) hue-rotate(180deg)';
      setTimeout(() => { html.style.filter = ''; }, 1200);
    }
  });

  // ---------- ensure videos start (some browsers gate autoplay) ----------
  // After first user interaction, try to play anything paused (unless motion off).
  const tryPlay = () => {
    if (body.dataset.motion === 'off') return;
    document.querySelectorAll('video').forEach((v) => {
      if (v.paused) { v.play().catch(() => {}); }
    });
    window.removeEventListener('pointerdown', tryPlay);
    window.removeEventListener('keydown', tryPlay);
  };
  window.addEventListener('pointerdown', tryPlay, { once: true, passive: true });
  window.addEventListener('keydown', tryPlay, { once: true });
})();
