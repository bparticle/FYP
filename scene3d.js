/* ============================================================
   FYP — the triptych in 3D.
   A faithful model of the physical altarpiece, folded shut below
   the hero. Scroll scrubs it open (right wing first, then left);
   it floats while idle and leans toward the cursor. When fully
   open the sticky releases and the page scrolls on.

   Vanilla ES module. Three.js (vendored, ESM) + GSAP/ScrollTrigger
   (vendored globals). No build step. Degrades to a still image when
   WebGL is unavailable or motion is off.

   The GLB is authored so each wing's origin sits exactly on its
   hinge and the hinge rods run along local Z — so folding is just
   rotating LEFTCARD / RIGHTCARD around their own Z. No reparenting.
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from './public/vendor/three/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './public/vendor/three/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from './public/vendor/three/jsm/environments/RoomEnvironment.js';

/* ---------- tunables (the only values that need eyeballing) ---------- */
const CFG = {
  model: './public/models/fyp-triptych.glb?v=20260602-art3',

  // Orientation of the model so the painted faces front the camera.
  // Model is authored Z-up (panel height along Z, art normal along Y),
  // so we stand it upright: Z-up -> Y-up. Flip values get tuned on screen.
  orient: { x: Math.PI / 2, y: 0, z: 0 },
  faceFlip: false,            // set true if we end up looking at the backs

  // Fold angles (radians) for each wing's local Z. 0 == open (authored
  // rest pose is the flat, fully-spread triptych). Closed folds the wings
  // up and over the center so the booklet is fully shut. Signs mirror L/R.
  // The two wings stack (right is the inner layer, left the outer cover), so
  // they fold to slightly different angles to avoid z-fighting.
  leftOpen: 0, leftClosed: -Math.PI * 0.995,    // outer cover — lies flat
  rightOpen: 0, rightClosed: Math.PI * 0.965,   // inner layer — a hair less

  // Camera
  fov: 34,
  fitMargin: 1.16,            // padding around the open triptych
  camHeight: 0.10,            // slight high angle (fraction of fit dist)
  camYaw: 0.0,                // 3/4 turn baked into the cinematic instead

  // Cinematic: object yaws from a slight 3/4 turn (closed) to face-on (open)
  yawClosed: 0.34,
  yawOpen: 0.0,

  // Idle float
  floatAmp: 0.05,             // fraction of object height
  floatDur: 3.4,

  // Pointer parallax (subtle, idle) + drag-to-orbit (user, on demand)
  tiltMax: 0.10,              // radians, max idle lean toward cursor
  tiltEase: 0.5,
  orbitYawSpeed: 0.011,       // radians per px of horizontal drag
  orbitPitchSpeed: 0.008,     // radians per px of vertical drag
  orbitPitchClamp: 0.7,       // max up/down tilt while orbiting
  orbitReturn: 0.7,           // seconds to ease back to the scroll pose

  // Scroll
  scrollLength: '+=240%',     // pin distance -> length of the fold
  scrub: 1,
  rightSpan: 0.56,            // right wing opens over [0 .. rightSpan]
  leftStart: 0.50,            // left starts here (right is ~90% open -> ~170deg)

  // Lighting (less is more — let the topology read)
  exposure: 0.86,
  envIntensity: 0.42,         // image-based fill; lower = more contrast/form
  keyIntensity: 2.6,
  rimIntensity: 1.1,
  fillIntensity: 0.22,

  // Contact shadow
  shadowScale: 0.62,          // fraction of object footprint
  shadowOpacity: 0.5,
};

/* ---------- DOM ---------- */
const html = document.documentElement;
const section = document.getElementById('object3d');
const canvas = section && section.querySelector('.stage3d__canvas');
const pin = section && section.querySelector('.stage3d__pin');
const cue = section && section.querySelector('.stage3d__cue');

/* ---------- capability / preference guards ---------- */
function motionOff() {
  let stored = null;
  try { stored = localStorage.getItem('fyp.motion'); } catch (e) {}
  if (stored === 'off') return true;
  if (stored === 'on') return false;
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}
function gsapOK() { return typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined'; }

function showFallback() { html.classList.add('no3d'); }
function hideFallback() { html.classList.remove('no3d'); }

/* ---------- module state (so we can build / tear down on motion toggle) ---------- */
let app = null;

function start() {
  if (app) return;
  if (!section || !canvas || !pin) return;
  if (!webglOK() || !gsapOK()) { showFallback(); return; }
  if (motionOff()) { showFallback(); return; }
  hideFallback();
  app = build();
}

function stop() {
  if (!app) { showFallback(); return; }
  app.destroy();
  app = null;
  showFallback();
}

/* ============================================================
   build() — everything lives in a closure so destroy() is clean
   ============================================================ */
function build() {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  /* renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;          // self-shadowing reveals topology
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  /* image-based lighting, dialled down so it fills rather than flattens */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = CFG.envIntensity;

  /* key light — directional, casts shadows so folded panels shade each other */
  const key = new THREE.DirectionalLight(0xfff6ee, CFG.keyIntensity);
  key.position.set(0.55, 0.95, 0.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.004;
  const sc = key.shadow.camera;            // tight ortho frustum around the object
  sc.left = sc.bottom = -0.22; sc.right = sc.top = 0.22; sc.near = 0.01; sc.far = 3;
  sc.updateProjectionMatrix();
  scene.add(key);
  /* cool rim from behind to separate the object from the white ground */
  const rim = new THREE.DirectionalLight(0xeaf0ff, CFG.rimIntensity);
  rim.position.set(-0.6, 0.5, -0.8);
  scene.add(rim);
  /* whisper of fill so the shadows don't go black */
  const fill = new THREE.HemisphereLight(0xffffff, 0xdfdfe2, CFG.fillIntensity);
  scene.add(fill);

  /* camera */
  const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.01, 100);

  /* nesting: outer (float + cinematic yaw) > spin (user orbit) > tilt (idle
     parallax) > model (orientation + centering). The key light targets `outer`
     so its shadow follows the object as it floats. */
  const outer = new THREE.Group();
  const spin = new THREE.Group();
  const tilt = new THREE.Group();
  const model = new THREE.Group();
  outer.add(spin); spin.add(tilt); tilt.add(model); scene.add(outer);
  key.target = outer; scene.add(key.target);

  /* soft contact-shadow blob beneath the floating object */
  const shadow = makeBlobShadow();
  scene.add(shadow.mesh);

  let leftCard = null, rightCard = null;
  let objHeight = 0.1, objWidth = 0.26, baseY = 0;
  let foldTL = null, floatTween = null;
  let tiltXTo = null, tiltYTo = null;
  let spinXTo = null, spinYTo = null, returnTween = null;
  let dragging = false, orbitYaw = 0, orbitPitch = 0;
  let ready = false, visible = true, disposed = false;

  /* ---------- load ---------- */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(CFG.model, onLoad, undefined, (err) => {
    console.error('[FYP 3D] model failed to load', err);
    teardownPartial();
    showFallback();
  });

  function onLoad(gltf) {
    if (disposed) return;
    const root = gltf.scene;
    model.add(root);

    // orient the model upright, art toward camera
    model.rotation.set(CFG.orient.x, CFG.orient.y, CFG.orient.z);
    if (CFG.faceFlip) model.rotation.y += Math.PI;
    model.updateMatrixWorld(true);

    // Find the wings by node name. The GLB is compressed as texture-resize +
    // WebP only (no meshopt quantization), so each wing's node origin still
    // sits exactly on its hinge and the hinge rods run along local Z — folding
    // is just rotating each wing around its own local Z. No reparenting needed.
    leftCard = root.getObjectByName('LEFTCARD');
    rightCard = root.getObjectByName('RIGHTCARD');

    // Blender's material preview shows the inserts as a rough, slightly metallic
    // Principled BSDF. Keep ART_ in the lit PBR path so it picks up the same
    // shallow shading and presence instead of becoming a flat, pale billboard.
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m) continue;

        if (m.name === 'Glass') m.visible = false;

        if (m.map) m.map.anisotropy = maxAniso;

        if (m.name === 'ART_') {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          m.metalness = 0.7;
          m.roughness = 1.0;
          m.envMapIntensity = 0.22;
          m.toneMapped = true;
          continue;
        }

        if (m.name === 'chrome') {
          m.metalness = 1.0;
          m.roughness = 0.32;
          m.envMapIntensity = 0.9;
        } else {
          m.metalness = 0;
          m.roughness = Math.max(m.roughness ?? 1, 0.72);
          m.envMapIntensity = 0.45;
        }
      }
    });

    // center the model at the origin (in its oriented pose, measured OPEN)
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    objWidth = size.x; objHeight = size.y;
    model.position.sub(center); // shift so center sits at outer origin

    // frame the camera for the OPEN (widest) pose so it never overflows
    frameCamera(size);

    baseY = outer.position.y;
    buildTimelines();

    ready = true;
    resize();
    // render only if the section is actually near the viewport (the
    // IntersectionObserver keeps it in sync from here on)
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    setVisible(r.top < vh * 1.2 && r.bottom > -vh * 0.2);
    // layout changed (canvas sized, pin spacer created) -> recalc triggers
    requestAnimationFrame(() => ScrollTrigger.refresh());

    // dev-only inspection hook (?debug3d) — lets a headless driver pin the
    // fold to an exact progress and read back the live transforms.
    if (location.search.includes('debug3d')) {
      window.__fyp3d = {
        THREE, scene, camera, model, root, outer,
        get leftCard() { return leftCard; },
        get rightCard() { return rightCard; },
        // scroll to the pixel position that maps to fold progress p (keeps the
        // pin intact; let scrub settle before reading)
        setProgress(p) {
          const st = foldTL && foldTL.scrollTrigger;
          if (!st) return;
          window.scrollTo(0, Math.round(st.start + (st.end - st.start) * p));
        },
        read() {
          const st = foldTL && foldTL.scrollTrigger;
          return {
            right: rightCard && +rightCard.rotation.z.toFixed(3),
            left: leftCard && +leftCard.rotation.z.toFixed(3),
            yaw: +outer.rotation.y.toFixed(3),
            spinY: +spin.rotation.y.toFixed(3),
            stStart: st && Math.round(st.start),
            stEnd: st && Math.round(st.end),
            stProg: st && +st.progress.toFixed(3),
            scrollY: Math.round(window.scrollY),
          };
        },
      };
    }
  }

  /* ---------- camera framing (fit the box for current aspect) ---------- */
  function frameCamera(size) {
    const aspect = camera.aspect || 1;
    const vFov = THREE.MathUtils.degToRad(CFG.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distV = (size.y / 2) / Math.tan(vFov / 2);
    const distH = (size.x / 2) / Math.tan(hFov / 2);
    const dist = Math.max(distV, distH) * CFG.fitMargin;
    camera.position.set(0, dist * CFG.camHeight, dist);
    camera.lookAt(0, 0, 0);
    camera.near = dist / 100; camera.far = dist * 100;
    camera.updateProjectionMatrix();
    // park a small, soft contact shadow just under the object
    shadow.mesh.position.y = -size.y * 0.58;
    shadow.mesh.scale.set(Math.max(size.x, size.z) * CFG.shadowScale, size.z * 1.6 * CFG.shadowScale, 1);
  }

  /* ---------- GSAP: fold scrub + idle float + cinematic yaw ---------- */
  function buildTimelines() {
    // closed pose from frame one
    if (leftCard) leftCard.rotation.z = CFG.leftClosed;
    if (rightCard) rightCard.rotation.z = CFG.rightClosed;
    outer.rotation.y = CFG.yawClosed;

    foldTL = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: CFG.scrollLength,
        pin: pin,
        scrub: CFG.scrub,
        invalidateOnRefresh: true,
        // NOTE: rendering is gated by the IntersectionObserver (visibility),
        // NOT by the trigger's active state. With scrub there's a settle lag,
        // so the render loop must keep running while the section is on screen —
        // otherwise the fold freezes mid-ease at the top and "jumps" on reverse.
        onUpdate: onScrub,
        // above/below the pin the scrub tween stops updating — snap so the
        // hero and the post-pin section never show a half-folded triptych.
        onLeaveBack: () => snapFold(0),
        onLeave: () => snapFold(1),
      },
    });

    // right wing opens first
    if (rightCard) foldTL.fromTo(rightCard.rotation,
      { z: CFG.rightClosed }, { z: CFG.rightOpen, duration: CFG.rightSpan }, 0);
    // left wing follows once the right is ~170 deg open
    if (leftCard) foldTL.fromTo(leftCard.rotation,
      { z: CFG.leftClosed }, { z: CFG.leftOpen, duration: 1 - CFG.leftStart }, CFG.leftStart);
    // cinematic: turn to face-on across the whole fold
    foldTL.fromTo(outer.rotation, { y: CFG.yawClosed }, { y: CFG.yawOpen, duration: 1 }, 0);
    // the scroll cue fades out as soon as it starts moving
    if (cue) foldTL.to(cue, { autoAlpha: 0, duration: 0.12 }, 0);

    // idle float — paused while actively scrubbing
    floatTween = gsap.to(outer.position, {
      y: `+=${objHeight * CFG.floatAmp}`,
      duration: CFG.floatDur, ease: 'sine.inOut',
      yoyo: true, repeat: -1,
    });

    // pointer parallax (smoothed) — idle lean toward the cursor
    tiltXTo = gsap.quickTo(tilt.rotation, 'x', { duration: CFG.tiltEase, ease: 'power2.out' });
    tiltYTo = gsap.quickTo(tilt.rotation, 'y', { duration: CFG.tiltEase, ease: 'power2.out' });
    // user orbit (drag to turn it around) — smoothed
    spinYTo = gsap.quickTo(spin.rotation, 'y', { duration: 0.3, ease: 'power2.out' });
    spinXTo = gsap.quickTo(spin.rotation, 'x', { duration: 0.3, ease: 'power2.out' });
  }

  /* Snap the fold to a hard endpoint (scrub lag can't catch up once the
     trigger is inactive, or when the user stops right at 0 / 1). */
  function snapFold(p) {
    if (!foldTL) return;
    foldTL.progress(p);
  }

  /* ---------- pause the float while scrolling, resume when idle;
       and ease any user orbit back to the scroll-natural pose ---------- */
  let idleTimer = 0;
  let settleTimer = 0;
  function onScrub() {
    if (floatTween && floatTween.isActive()) floatTween.pause();
    if (!dragging) returnHome();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (floatTween && !disposed) floatTween.resume(); }, 360);
    // when scroll stops at either end of the pin, finish the scrub so the
    // booklet isn't left ajar (scrub: 1 lags ~1s behind fast scroll-stops)
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const st = foldTL && foldTL.scrollTrigger;
      if (!st || !ready) return;
      const p = st.progress;
      if (p <= 0.02) snapFold(0);
      else if (p >= 0.98) snapFold(1);
    }, 420);
  }

  /* smoothly unwind the manual orbit back to 0 (the scroll-driven pose) */
  function returnHome() {
    if (!orbitYaw && !orbitPitch) return;
    // shortest path home for yaw
    let y = spin.rotation.y % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2; else if (y < -Math.PI) y += Math.PI * 2;
    spin.rotation.y = y;
    orbitYaw = 0; orbitPitch = 0;
    returnTween && returnTween.kill();
    returnTween = gsap.to(spin.rotation, { x: 0, y: 0, duration: CFG.orbitReturn, ease: 'power3.out', overwrite: true });
  }

  /* ---------- idle pointer parallax (suppressed while orbiting) ---------- */
  function onPointer(e) {
    if (!ready || !visible || dragging || orbitYaw || orbitPitch) return;
    const r = renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;   // -1..1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    tiltYTo && tiltYTo(THREE.MathUtils.clamp(nx, -1, 1) * CFG.tiltMax);
    tiltXTo && tiltXTo(THREE.MathUtils.clamp(ny, -1, 1) * CFG.tiltMax * 0.7);
  }
  function onLeave() { if (!dragging) { tiltXTo && tiltXTo(0); tiltYTo && tiltYTo(0); } }
  function onDeviceTilt(e) {
    if (!ready || !visible || dragging || e.gamma == null) return;
    tiltYTo && tiltYTo(THREE.MathUtils.clamp(e.gamma / 35, -1, 1) * CFG.tiltMax);
    tiltXTo && tiltXTo(THREE.MathUtils.clamp(((e.beta || 0) - 45) / 35, -1, 1) * CFG.tiltMax * 0.6);
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('deviceorientation', onDeviceTilt, { passive: true });

  /* ---------- drag to orbit (turn the object around) ----------
     Mouse: drag = free yaw + pitch. Touch: only horizontal drag orbits
     (the canvas keeps touch-action:pan-y so vertical swipes still scroll).
     Releasing holds the pose; the next scroll eases it home (see onScrub). */
  let last = null;
  function onDragDown(e) {
    if (!ready || !visible) return;
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    last = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    returnTween && returnTween.kill();
    // continue from wherever the orbit currently is (e.g. grabbed mid-return)
    orbitYaw = spin.rotation.y;
    orbitPitch = spin.rotation.x;
    if (floatTween) floatTween.pause();
    tiltXTo && tiltXTo(0); tiltYTo && tiltYTo(0); // drop idle lean
    // capture mouse so the drag tracks outside the canvas; for touch we let the
    // browser keep ownership so vertical swipes can still scroll the page.
    if (!last.touch) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
    canvas.style.cursor = 'grabbing';
  }
  function onDragMove(e) {
    if (!dragging || !last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last.x = e.clientX; last.y = e.clientY;
    orbitYaw += dx * CFG.orbitYawSpeed;
    spinYTo && spinYTo(orbitYaw);
    if (!last.touch) {
      orbitPitch = THREE.MathUtils.clamp(orbitPitch + dy * CFG.orbitPitchSpeed, -CFG.orbitPitchClamp, CFG.orbitPitchClamp);
      spinXTo && spinXTo(orbitPitch);
      e.preventDefault();
    }
  }
  function onDragUp(e) {
    if (!dragging) return;
    dragging = false; last = null;
    canvas.style.cursor = 'grab';
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onDragDown);
  canvas.addEventListener('pointermove', onDragMove);
  canvas.addEventListener('pointerup', onDragUp);
  canvas.addEventListener('pointercancel', onDragUp);

  /* ---------- render loop (driven by gsap.ticker; paused off-screen) ---------- */
  function render() {
    if (disposed) return;
    renderer.render(scene, camera);
  }
  let onTicker = false;
  function ticker(on) {
    if (on && !onTicker) { gsap.ticker.add(render); onTicker = true; }
    else if (!on && onTicker) { gsap.ticker.remove(render); onTicker = false; }
  }
  function setVisible(v) {
    visible = v;
    ticker(v && ready);
  }
  // also drop rendering when the section scrolls fully away
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(
    (entries) => { for (const en of entries) setVisible(en.isIntersecting); },
    { rootMargin: '20% 0px 20% 0px' }
  ) : null;
  io && io.observe(section);

  /* ---------- resize ---------- */
  let resizeRAF = 0;
  function resize() {
    const w = pin.clientWidth || window.innerWidth;
    const h = pin.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (ready) frameCamera(new THREE.Vector3(objWidth, objHeight, objWidth));
    camera.updateProjectionMatrix();
  }
  function onResize() {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => { resize(); ScrollTrigger.refresh(); });
  }
  window.addEventListener('resize', onResize);

  /* ---------- teardown ---------- */
  function teardownPartial() {
    ticker(false);
    if (foldTL) { foldTL.scrollTrigger && foldTL.scrollTrigger.kill(); foldTL.kill(); foldTL = null; }
    if (floatTween) { floatTween.kill(); floatTween = null; }
    if (returnTween) { returnTween.kill(); returnTween = null; }
  }
  function destroy() {
    disposed = true;
    teardownPartial();
    clearTimeout(idleTimer);
    clearTimeout(settleTimer);
    cancelAnimationFrame(resizeRAF);
    io && io.disconnect();
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('deviceorientation', onDeviceTilt);
    canvas.removeEventListener('pointerdown', onDragDown);
    canvas.removeEventListener('pointermove', onDragMove);
    canvas.removeEventListener('pointerup', onDragUp);
    canvas.removeEventListener('pointercancel', onDragUp);
    window.removeEventListener('resize', onResize);
    scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry && o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (!m) return; for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); });
      }
    });
    shadow.dispose();
    envRT && envRT.texture && envRT.texture.dispose();
    pmrem.dispose();
    renderer.dispose();
    if (cue) gsap.set(cue, { clearProps: 'all' });
  }

  // first sizing pass (before model arrives, so the canvas isn't 0x0)
  resize();

  return { destroy };
}

/* ---------- a soft radial blob, used as a fake contact shadow ---------- */
function makeBlobShadow() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(20,16,16,0.34)');
  g.addColorStop(0.4, 'rgba(20,16,16,0.12)');
  g.addColorStop(0.75, 'rgba(20,16,16,0.03)');
  g.addColorStop(1, 'rgba(20,16,16,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: CFG.shadowOpacity });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return { mesh, dispose() { tex.dispose(); mat.dispose(); mesh.geometry.dispose(); } };
}

/* ---------- boot + react to the motion toggle in script.js ---------- */
if (section && canvas) {
  start();
  window.addEventListener('fyp:motion', (e) => {
    const off = e && e.detail && e.detail.off;
    if (off) stop(); else start();
  });
} else {
  showFallback();
}
