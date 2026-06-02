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

  // The object leads in the hero (closed + idly turning, draggable). Scrolling
  // jumps straight into the opening — no scroll-driven closed turntable.
  foldEnd: 0.74,              // unfold finishes here; [foldEnd .. 1] is the OPEN
                              // dwell — object held open + clickable while pinned
  idleSpinSpeed: 0.18,        // rad/s — slow at-rest turntable while parked closed

  // Hero intro: the closed object is beautifully CENTERED and viewable on load,
  // then eases to the full open-framing as you scroll in. Because the camera
  // frames the wide OPEN pose, the hero scale + lift are computed responsively
  // (see frameCamera) so the closed booklet fills a consistent fraction of the
  // viewport on every screen, then eases to scale 1 / centered.
  heroFill: 0.4,              // closed booklet ≈ this fraction of viewport height
  heroLiftFrac: 0.05,         // upward bias (fraction of viewport height) so the
                              // centered object clears the announcement beneath it
  heroScaleMin: 0.7, heroScaleMax: 2.6,
  introExit: 0.14,            // scroll fraction over which the type + backdrop go
  liftEnd: 0.30,              // object reaches centered + full open-framing by here

  // Phase thresholds (timeline progress) for wayfinding + hotspots
  openAt: 0.74,               // >= this -> fully open: reveal hotspots, allow clicks
  closedUntil: 0.004,         // <= this (at rest) -> 'closed' (cover) phase

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
  scrollLength: '+=300%',     // pin distance -> intro exit + the fold + dwell
  scrub: 1,
  rightSpan: 0.56,            // right wing opens over [0 .. rightSpan]
  leftStart: 0.50,            // left starts here (right is ~90% open -> ~170deg)

  // Lighting (less is more — let the topology read)
  exposure: 0.86,
  envIntensity: 0.42,         // image-based fill; lower = more contrast/form
  keyIntensity: 2.6,
  rimIntensity: 1.1,
  fillIntensity: 0.22,
};

/* ---------- DOM ---------- */
const html = document.documentElement;
const section = document.getElementById('object3d');
const canvas = section && section.querySelector('.stage3d__canvas');
const pin = section && section.querySelector('.stage3d__pin');
const cue = section && section.querySelector('.stage3d__cue');
const bg = section && section.querySelector('.stage3d__bg');
const plaque = section && section.querySelector('.stage3d__plaque');
const phaseSteps = section ? Array.from(section.querySelectorAll('.stage3d__step')) : [];
const hotspotEls = section ? Array.from(section.querySelectorAll('.hotspot')) : [];

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

  /* nesting: rig (hero vertical lift) > outer (float + cinematic yaw) >
     spin (user orbit) > tilt (idle parallax) > model (orientation + centering).
     The key light targets `outer` so it follows the object as it floats. */
  const rig = new THREE.Group();
  const outer = new THREE.Group();
  const spin = new THREE.Group();
  const tilt = new THREE.Group();
  const model = new THREE.Group();
  rig.add(outer); outer.add(spin); spin.add(tilt); tilt.add(model); scene.add(rig);
  // aim the key light at `outer` (already in the graph via rig — no re-add, or
  // it would detach outer from the rig and break the hero lift/scale)
  key.target = outer;

  let leftCard = null, rightCard = null, centerCard = null;
  let objHeight = 0.1, objWidth = 0.26, baseY = 0;
  let foldTL = null, floatTween = null;
  let idleSpinActive = false, lastFrameT = 0;
  let heroScaleDyn = 1, heroLiftDyn = 0;   // responsive hero pose (set in frameCamera)
  let tiltXTo = null, tiltYTo = null;
  let spinXTo = null, spinYTo = null, returnTween = null;
  let dragging = false, orbitYaw = 0, orbitPitch = 0;
  let ready = false, visible = true, disposed = false;
  let phase = '';                          // 'closed' | 'opening' | 'open'

  // hotspot panels (filled once the model loads): { el, node, dir }
  const panels = [];
  const raycaster = new THREE.Raycaster();
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpBox = new THREE.Box3();

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
    centerCard = root.getObjectByName('CENTER');

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
    setupHotspots();
    setPhase(0);                 // parked closed at the top
    idleSpinActive = true;       // ...and gently turning

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

    // responsive hero pose: scale the closed booklet so it fills ~heroFill of
    // the viewport height on any aspect, with a small upward bias. (The camera
    // is framed for the wide OPEN pose, so the closed object would otherwise be
    // tiny on narrow/portrait screens.)
    const viewH = 2 * dist * Math.tan(vFov / 2);          // world height in view
    const closedFrac = size.y / viewH;                    // object height at scale 1
    heroScaleDyn = THREE.MathUtils.clamp(CFG.heroFill / closedFrac, CFG.heroScaleMin, CFG.heroScaleMax);
    heroLiftDyn = CFG.heroLiftFrac * viewH;
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

    // The timeline is normalized to duration 1:
    //   [0 .. introExit]   announcement + backdrop leave; object eases to center
    //   [0 .. foldEnd]     unfold (right wing first, then left), turning face-on
    //   [foldEnd .. 1]     OPEN dwell — held open + clickable while pinned
    const unfoldDur = CFG.foldEnd;

    // hero pose: the booklet sits centered (slight upward bias) and sized to
    // fill the viewport nicely, easing to the full open-framing as you scroll
    // in. Function values + invalidateOnRefresh keep it responsive on resize.
    rig.position.y = heroLiftDyn;
    rig.scale.setScalar(heroScaleDyn);
    foldTL.fromTo(rig.position,
      { y: () => heroLiftDyn }, { y: 0, duration: CFG.liftEnd, ease: 'power2.out' }, 0);
    foldTL.fromTo(rig.scale,
      { x: () => heroScaleDyn, y: () => heroScaleDyn, z: () => heroScaleDyn },
      { x: 1, y: 1, z: 1, duration: CFG.liftEnd, ease: 'power2.out' }, 0);

    // announcement + faded backdrop leave as soon as you start scrolling
    if (plaque) foldTL.to(plaque, { autoAlpha: 0, y: 28, duration: CFG.introExit }, 0);
    if (bg) foldTL.to(bg, { autoAlpha: 0, duration: CFG.introExit }, 0);
    if (cue) foldTL.to(cue, { autoAlpha: 0, duration: 0.06 }, 0);

    // unfold — right wing first, then the left, across the whole fold span
    if (rightCard) foldTL.fromTo(rightCard.rotation,
      { z: CFG.rightClosed }, { z: CFG.rightOpen, duration: CFG.rightSpan * unfoldDur }, 0);
    if (leftCard) foldTL.fromTo(leftCard.rotation,
      { z: CFG.leftClosed }, { z: CFG.leftOpen, duration: (1 - CFG.leftStart) * unfoldDur },
      CFG.leftStart * unfoldDur);
    // cinematic: turn from the slight 3/4 to face-on as it opens
    foldTL.fromTo(outer.rotation,
      { y: CFG.yawClosed }, { y: CFG.yawOpen, duration: unfoldDur }, 0);

    // spacer holds the object open for the rest of the pin so there's scroll
    // room to read the hotspots and click a panel (normalizes duration to 1).
    foldTL.to({ _hold: 0 }, { _hold: 1, duration: 1 - CFG.foldEnd }, CFG.foldEnd);

    // idle float — paused while actively scrubbing
    floatTween = gsap.to(outer.position, {
      y: `+=${objHeight * CFG.floatAmp}`,
      duration: CFG.floatDur, ease: 'sine.inOut',
      yoyo: true, repeat: -1,
    });

    // idle turntable — a slow continuous spin so the parked, closed booklet is
    // "alive". Driven manually in render() (not a tween, to avoid fighting the
    // return-home reset); see idleSpinActive / onScrub.

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

  /* ---------- phase signalling — drives wayfinding + hotspot reveal ---------- */
  function setPhase(progress) {
    const next = progress <= CFG.closedUntil ? 'closed'
      : (progress >= CFG.openAt ? 'open' : 'opening');
    if (next === phase) return;
    phase = next;
    section.classList.toggle('is-closed', phase === 'closed');
    section.classList.toggle('is-opening', phase === 'opening');
    section.classList.toggle('is-open', phase === 'open');
    for (const s of phaseSteps) s.classList.toggle('is-active', s.dataset.phase === phase);
    if (phase === 'open') {
      for (const p of panels) p.el.hidden = false;     // CSS fades them in
    } else {
      for (const p of panels) { p.el.hidden = true; p.el.style.visibility = ''; }
    }
  }

  /* ---------- pause the float while scrolling, resume when idle;
       and ease any user orbit / idle spin back to the scroll-natural pose ---------- */
  let idleTimer = 0;
  let settleTimer = 0;
  function onScrub() {
    const st = foldTL && foldTL.scrollTrigger;
    if (st) setPhase(st.progress);
    if (floatTween && floatTween.isActive()) floatTween.pause();
    idleSpinActive = false;                 // suppress the closed turntable while scrolling
    if (!dragging) returnHome();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (disposed) return;
      if (floatTween) floatTween.resume();
      // resume the closed turntable only when parked at rest near the very top
      const s = foldTL && foldTL.scrollTrigger;
      if (s && ready && !dragging && s.progress <= 0.02) idleSpinActive = true;
    }, 360);
    // when scroll stops at either end of the pin, finish the scrub so the
    // booklet isn't left ajar (scrub: 1 lags ~1s behind fast scroll-stops)
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const s = foldTL && foldTL.scrollTrigger;
      if (!s || !ready) return;
      const p = s.progress;
      if (p <= 0.02) snapFold(0);
      else if (p >= 0.98) snapFold(1);
    }, 420);
  }

  /* smoothly unwind the manual orbit / idle-spin offset back to 0 (the
     scroll-driven pose) so the object opens face-on regardless of how it was
     turned while closed. */
  function returnHome() {
    // shortest path home for yaw
    let y = spin.rotation.y % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2; else if (y < -Math.PI) y += Math.PI * 2;
    orbitYaw = 0; orbitPitch = 0;
    if (Math.abs(y) < 1e-4 && Math.abs(spin.rotation.x) < 1e-4) { spin.rotation.y = y; return; }
    spin.rotation.y = y;
    returnTween && returnTween.kill();
    returnTween = gsap.to(spin.rotation, { x: 0, y: 0, duration: CFG.orbitReturn, ease: 'power3.out', overwrite: true });
  }

  /* ---------- project each panel's hotspot onto the screen (open phase) ---------- */
  function updateHotspots() {
    if (!panels.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    // world-space "front" of the painted faces (group rotations, not the
    // model's internal orientation): faces look down +Z when un-orbited.
    tilt.getWorldQuaternion(tmpQuat);
    const front = tmpV2.set(0, 0, 1).applyQuaternion(tmpQuat);
    for (const p of panels) {
      tmpBox.setFromObject(p.node);
      if (tmpBox.isEmpty()) { p.el.style.visibility = 'hidden'; continue; }
      tmpBox.getCenter(tmpV);
      // facing test: hide the marker when its panel turns away from the camera
      const facing = front.x * (camera.position.x - tmpV.x)
        + front.y * (camera.position.y - tmpV.y)
        + front.z * (camera.position.z - tmpV.z);
      tmpV.project(camera);
      const onScreen = tmpV.z < 1 && tmpV.x > -1.05 && tmpV.x < 1.05 && tmpV.y > -1.05 && tmpV.y < 1.05;
      if (facing <= 0 || !onScreen) { p.el.style.visibility = 'hidden'; continue; }
      p.el.style.visibility = '';
      const x = (tmpV.x * 0.5 + 0.5) * rect.width;
      const y = (-tmpV.y * 0.5 + 0.5) * rect.height;
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  /* map each hotspot button (data-panel 1/2/3) to its node: I→LEFT, II→CENTER,
     III→RIGHT. Buttons with no matching node are skipped. */
  function setupHotspots() {
    const map = { '1': leftCard, '2': centerCard, '3': rightCard };
    panels.length = 0;
    for (const el of hotspotEls) {
      const node = map[el.dataset.panel];
      if (node) panels.push({ el, node });
    }
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
    idleSpinActive = false;
    last = { x: e.clientX, y: e.clientY, downX: e.clientX, downY: e.clientY, moved: false, touch: e.pointerType === 'touch' };
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
    if (Math.abs(e.clientX - last.downX) > 6 || Math.abs(e.clientY - last.downY) > 6) last.moved = true;
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
    const wasTap = last && !last.moved;
    dragging = false; last = null;
    canvas.style.cursor = 'grab';
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    // a tap (not a drag) on an open panel opens its write-up
    if (wasTap && phase === 'open') tryPick(e);
  }

  /* raycast the tapped point against the panels; open the matching write-up */
  function tryPick(e) {
    if (!ready || !panels.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    const hits = raycaster.intersectObject(model, true);
    if (!hits.length) return;
    let o = hits[0].object, which = 0;
    while (o) {
      if (o === leftCard) { which = 1; break; }
      if (o === centerCard) { which = 2; break; }
      if (o === rightCard) { which = 3; break; }
      o = o.parent;
    }
    if (which) {
      try { window.dispatchEvent(new CustomEvent('fyp:openpanel', { detail: { panel: which } })); } catch (_) {}
    }
  }
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onDragDown);
  canvas.addEventListener('pointermove', onDragMove);
  canvas.addEventListener('pointerup', onDragUp);
  canvas.addEventListener('pointercancel', onDragUp);

  /* ---------- render loop (driven by gsap.ticker; paused off-screen) ---------- */
  function render() {
    if (disposed) return;
    const now = performance.now();
    const dt = lastFrameT ? Math.min((now - lastFrameT) / 1000, 0.05) : 0;
    lastFrameT = now;
    // closed turntable: slowly spin the parked, shut booklet (see onScrub)
    if (idleSpinActive && !dragging) spin.rotation.y += CFG.idleSpinSpeed * dt;
    renderer.render(scene, camera);
    // anchor the hotspot markers to their panels once fully open
    if (phase === 'open') updateHotspots();
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
    envRT && envRT.texture && envRT.texture.dispose();
    pmrem.dispose();
    renderer.dispose();
    // clear scroll-driven inline props so the static no-3D fallback shows the
    // backdrop, announcement and cue normally
    if (cue) gsap.set(cue, { clearProps: 'all' });
    if (bg) gsap.set(bg, { clearProps: 'all' });
    if (plaque) gsap.set(plaque, { clearProps: 'all' });
    // reset wayfinding + hotspots so the (now-static) fallback isn't left in an
    // open/clickable state
    idleSpinActive = false;
    rig.position.set(0, 0, 0);
    rig.scale.setScalar(1);
    section.classList.remove('is-closed', 'is-opening', 'is-open');
    for (const s of phaseSteps) s.classList.remove('is-active');
    for (const p of panels) { p.el.hidden = true; p.el.style.visibility = ''; p.el.style.transform = ''; }
  }

  // first sizing pass (before model arrives, so the canvas isn't 0x0)
  resize();

  return { destroy };
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
