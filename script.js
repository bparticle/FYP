/* FYP — small progressive enhancements. No frameworks, no analytics. */
(() => {
  const body = document.body;
  const html = document.documentElement;
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
      html.dataset.triptychState = 'open';
    } else {
      delete body.dataset.motion;
      toggle?.setAttribute('aria-pressed', 'false');
      document.querySelectorAll('video').forEach((v) => { try { v.play().catch(() => {}); } catch {} });
    }
    // let the 3D module (scene3d.js) tear down / re-init the WebGL scene
    try { window.dispatchEvent(new CustomEvent('fyp:motion', { detail: { off } })); } catch {}
  }

  // ---------- panel modals (the 3D object's click-to-read write-ups) ----------
  // Opened by tapping a panel (or its hotspot) in the 3D scene; native <dialog>
  // gives focus trap + Esc. The same dialogs double as the no-3D stacked
  // fallback (shown via html.no3d in CSS) — there they just sit open inline.
  const panelModals = {
    1: document.getElementById('panel-modal-1'),
    2: document.getElementById('panel-modal-2'),
    3: document.getElementById('panel-modal-3'),
  };
  let lastModalTrigger = null;

  const playModalVideo = (dialog) => {
    if (!dialog || body.dataset.motion === 'off') return;
    const v = dialog.querySelector('video');
    if (v) { try { v.play().catch(() => {}); } catch {} }
  };
  const stopModalVideo = (dialog) => {
    const v = dialog && dialog.querySelector('video');
    if (v) { try { v.pause(); } catch {} }
  };

  const openPanel = (n) => {
    const dialog = panelModals[n];
    if (!dialog || typeof dialog.showModal !== 'function' || dialog.open) return;
    lastModalTrigger = document.activeElement;
    dialog.showModal();
    playModalVideo(dialog);
  };

  Object.values(panelModals).forEach((dialog) => {
    if (!dialog) return;
    dialog.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => dialog.open && dialog.close()));
    // click on the backdrop (the dialog box itself, outside the card) closes
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    // on close (Esc / .close() / backdrop): pause video, restore focus
    dialog.addEventListener('close', () => {
      stopModalVideo(dialog);
      if (lastModalTrigger && typeof lastModalTrigger.focus === 'function') {
        try { lastModalTrigger.focus(); } catch {}
      }
      lastModalTrigger = null;
    });
  });

  // hotspot buttons (positioned over each panel by scene3d.js) + 3D raycast taps
  document.querySelectorAll('.hotspot[data-panel]').forEach((btn) =>
    btn.addEventListener('click', () => openPanel(btn.dataset.panel)));
  window.addEventListener('fyp:openpanel', (e) => {
    const n = e && e.detail && e.detail.panel;
    if (n) openPanel(n);
  });

  // when 3D is unavailable the dialogs render stacked (html.no3d) — play their
  // videos there; pause again if 3D comes back and the dialog is closed.
  const syncFallbackVideos = () => {
    const fallback = html.classList.contains('no3d');
    Object.values(panelModals).forEach((d) => {
      if (!d) return;
      if (fallback && body.dataset.motion !== 'off') playModalVideo(d);
      else if (!fallback && !d.open) stopModalVideo(d);
    });
  };
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(syncFallbackVideos).observe(html, { attributes: true, attributeFilter: ['class'] });
  }
  syncFallbackVideos();

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
      // closed panel-modal videos are managed by openPanel — don't wake them
      // unless they're showing as the stacked no-3D fallback
      const modal = v.closest('.panel-modal');
      if (modal && !modal.open && !html.classList.contains('no3d')) return;
      if (v.paused) { v.play().catch(() => {}); }
    });
    window.removeEventListener('pointerdown', tryPlay);
    window.removeEventListener('keydown', tryPlay);
  };
  window.addEventListener('pointerdown', tryPlay, { once: true, passive: true });
  window.addEventListener('keydown', tryPlay, { once: true });
})();
