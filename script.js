/* FYP — small progressive enhancements. No frameworks, no analytics. */
(() => {
  const body = document.body;
  const html = document.documentElement;
  const toggle = document.getElementById('motion-toggle');
  const foldToggle = document.getElementById('fold-toggle');
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
      // motion off → triptych should be open immediately, no transition
      html.dataset.triptychState = 'open';
      foldToggle?.setAttribute('aria-pressed', 'true');
      // clear any inline transforms left over from a drag
      document.querySelectorAll('.tp--left, .tp--right').forEach((el) => { el.style.transform = ''; });
    } else {
      delete body.dataset.motion;
      toggle?.setAttribute('aria-pressed', 'false');
      document.querySelectorAll('video').forEach((v) => { try { v.play().catch(() => {}); } catch {} });
    }
  }

  // ---------- the triptych: toggle + drag-to-fold ----------
  const triptych = document.getElementById('triptych');
  const stage = triptych?.querySelector('.triptych__stage');
  const leftWing = triptych?.querySelector('.tp--left');
  const rightWing = triptych?.querySelector('.tp--right');

  // OPEN and CLOSED angles must match the CSS custom properties per breakpoint.
  const readAngles = () => {
    const root = getComputedStyle(html);
    const open = parseFloat(root.getPropertyValue('--tp-open')) || 16;
    const closed = parseFloat(root.getPropertyValue('--tp-closed')) || 132;
    return { openLeft: open, openRight: -open, closedLeft: closed, closedRight: -closed };
  };

  // Sync the fold toggle's aria-pressed with the current state
  const syncFold = () => {
    if (!foldToggle) return;
    foldToggle.setAttribute('aria-pressed', html.dataset.triptychState === 'closed' ? 'false' : 'true');
  };
  syncFold();
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(syncFold).observe(html, {
      attributes: true,
      attributeFilter: ['data-triptych-state'],
    });
  }

  foldToggle?.addEventListener('click', () => {
    // Clear any inline transform so the CSS rule for the new state takes effect
    if (leftWing) leftWing.style.transform = '';
    if (rightWing) rightWing.style.transform = '';
    html.dataset.triptychState = html.dataset.triptychState === 'closed' ? 'open' : 'closed';
  });

  // Drag a wing inward to close, outward to open. Mirrors to the other wing.
  if (leftWing && rightWing && stage) {
    const interp = (a, b, t) => a + (b - a) * t;

    const applyProgress = (p) => {
      // p: 0 = open, 1 = closed
      const angles = readAngles();
      const left  = interp(angles.openLeft,  angles.closedLeft,  p);
      const right = interp(angles.openRight, angles.closedRight, p);
      leftWing.style.transform  = `rotateY(${left.toFixed(2)}deg)`;
      rightWing.style.transform = `rotateY(${right.toFixed(2)}deg)`;
    };

    let drag = null;

    const onDown = (side) => (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const wing = side === 'left' ? leftWing : rightWing;
      const startProgress = html.dataset.triptychState === 'closed' ? 1 : 0;
      drag = {
        side,
        startX: e.clientX,
        startProgress,
        // map ~25% of stage width to a full close — gentle enough for trackpads,
        // tight enough to feel responsive on touch
        range: Math.max(160, stage.offsetWidth * 0.25),
        pointerId: e.pointerId,
        moved: false,
      };
      html.classList.add('is-dragging');
      try { wing.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 5) drag.moved = true;
      if (!drag.moved) return;
      // left wing: dragging right (+dx) closes; right wing: dragging left (-dx) closes
      const sign = drag.side === 'left' ? 1 : -1;
      let p = drag.startProgress + (dx * sign) / drag.range;
      p = Math.max(0, Math.min(1, p));
      applyProgress(p);
    };

    const onUp = (e) => {
      if (!drag) return;
      html.classList.remove('is-dragging');

      // Tap without drag → toggle (parity with the fold button)
      if (!drag.moved) {
        leftWing.style.transform = '';
        rightWing.style.transform = '';
        html.dataset.triptychState = html.dataset.triptychState === 'closed' ? 'open' : 'closed';
        drag = null;
        return;
      }

      const dx = e.clientX - drag.startX;
      const sign = drag.side === 'left' ? 1 : -1;
      let p = drag.startProgress + (dx * sign) / drag.range;
      p = Math.max(0, Math.min(1, p));

      const targetState = p > 0.5 ? 'closed' : 'open';
      // Force the snap target on the next frame so the transition fires from
      // current angle (last drag value) to the snapped angle.
      requestAnimationFrame(() => {
        applyProgress(targetState === 'closed' ? 1 : 0);
        html.dataset.triptychState = targetState;
        // After the transition settles, clear inline so the CSS rule owns the value again
        setTimeout(() => {
          if (drag) return;
          leftWing.style.transform = '';
          rightWing.style.transform = '';
        }, 1500);
      });

      drag = null;
    };

    leftWing.addEventListener('pointerdown', onDown('left'));
    rightWing.addEventListener('pointerdown', onDown('right'));
    [leftWing, rightWing].forEach((w) => {
      w.addEventListener('pointermove', onMove);
      w.addEventListener('pointerup', onUp);
      w.addEventListener('pointercancel', onUp);
    });
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
