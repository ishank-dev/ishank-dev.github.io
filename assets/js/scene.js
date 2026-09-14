/* =====================================================================
   scene.js — GPU point-cloud field
   Raw WebGL (no libraries). ~12KB. Renders a cloud of particles that
   morphs between shapes as you scroll and reacts to the pointer.

   Degrades: no WebGL -> canvas stays empty, CSS gradient shows through.
             reduced motion -> one static frame, no rAF loop.
             hidden tab / off-screen -> loop paused.
   ===================================================================== */

(function () {
  'use strict';

  const canvas = document.getElementById('scene');
  if (!canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let gl;
  try {
    gl = canvas.getContext('webgl', {
      alpha: true, antialias: false, depth: false,
      premultipliedAlpha: true, powerPreference: 'high-performance'
    }) || canvas.getContext('experimental-webgl');
  } catch (e) { gl = null; }

  if (!gl) { document.documentElement.classList.add('no-webgl'); return; }
  document.documentElement.classList.add('has-webgl');

  /* ---------------------------------------------------------------
     shaders
     --------------------------------------------------------------- */

  const VERT = `
  precision highp float;

  attribute vec3  aFrom;      // shape we are morphing out of
  attribute vec3  aTo;        // shape we are morphing into
  attribute vec3  aSeed;      // per-particle randomness

  uniform mat4  uProj;
  uniform mat4  uView;
  uniform float uTime;
  uniform float uMix;         // 0..1 morph progress
  uniform float uSpin;        // accumulated rotation
  uniform vec2  uPointer;     // world-space pointer on z=0
  uniform float uPointerAmp;  // pointer influence, fades in on move
  uniform float uSize;
  uniform float uDrift;
  uniform float uDark;        // 1 = dark theme (glowing), 0 = light (inked)

  varying vec3  vColor;
  varying float vFade;

  const float TAU = 6.2831853;

  vec3 palette(float t) {
    // dark theme: luminous ice -> violet -> orchid, drawn additively
    vec3 a = vec3(0.42, 0.90, 1.00);
    vec3 b = vec3(0.66, 0.55, 0.98);
    vec3 c = vec3(1.00, 0.60, 0.85);
    vec3 lit = t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);

    // light theme: the same hues as ink, drawn over the page
    vec3 d = vec3(0.05, 0.42, 0.52);
    vec3 e = vec3(0.30, 0.20, 0.66);
    vec3 f = vec3(0.52, 0.20, 0.50);
    vec3 ink = t < 0.5 ? mix(d, e, t * 2.0) : mix(e, f, (t - 0.5) * 2.0);

    return mix(ink, lit, uDark);
  }

  void main() {
    // staggered morph: each particle starts at a slightly different time
    float lead = aSeed.x * 0.35;
    float t = clamp((uMix - lead) / (1.0 - 0.35), 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);                  // smoothstep
    vec3 p = mix(aFrom, aTo, t);

    // particles bow outward mid-morph so the transition reads as a swarm
    float arc = sin(t * 3.14159);
    p += normalize(p + 0.001) * arc * aSeed.y * 0.55;

    // idle drift
    float ph = aSeed.z * TAU;
    p.x += sin(uTime * 0.42 + ph) * uDrift;
    p.y += cos(uTime * 0.37 + ph * 1.3) * uDrift;
    p.z += sin(uTime * 0.29 + ph * 0.7) * uDrift;

    // spin around Y, gentle tilt on X
    float s = sin(uSpin), c = cos(uSpin);
    p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    float tilt = sin(uTime * 0.12) * 0.16;
    p = vec3(p.x, p.y * cos(tilt) - p.z * sin(tilt), p.y * sin(tilt) + p.z * cos(tilt));

    // pointer pushes particles away, falls off with distance
    vec2 d = p.xy - uPointer;
    float dist2 = dot(d, d);
    float push = uPointerAmp * 2.2 / (1.0 + dist2 * 1.8);
    p.xy += normalize(d + 0.0001) * push;

    vec4 mv = uView * vec4(p, 1.0);
    gl_Position = uProj * mv;

    // 0 = nearest particle, 1 = furthest. Camera sits ~6.6 units out.
    float dist = -mv.z;
    float depth = clamp((dist - 4.0) / 5.6, 0.0, 1.0);

    vColor = palette(clamp(aSeed.x * 0.42 + (1.0 - depth) * 0.38, 0.0, 1.0));
    vFade  = (0.46 + aSeed.y * 0.54) * (1.0 - depth * 0.55) * mix(1.35, 1.0, uDark);

    gl_PointSize = uSize * (0.55 + aSeed.y * 0.95) * (6.6 / max(dist, 1.0));
  }`;

  const FRAG = `
  precision mediump float;
  varying vec3  vColor;
  varying float vFade;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = dot(uv, uv);
    if (r > 0.25) discard;
    float a = (1.0 - smoothstep(0.0, 0.25, r));
    a *= a * vFade;
    gl_FragColor = vec4(vColor * a, a);
  }`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('scene: shader failed', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { document.documentElement.classList.add('no-webgl'); return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    document.documentElement.classList.add('no-webgl');
    return;
  }
  gl.useProgram(prog);

  const loc = {
    aFrom: gl.getAttribLocation(prog, 'aFrom'),
    aTo: gl.getAttribLocation(prog, 'aTo'),
    aSeed: gl.getAttribLocation(prog, 'aSeed'),
    uProj: gl.getUniformLocation(prog, 'uProj'),
    uView: gl.getUniformLocation(prog, 'uView'),
    uTime: gl.getUniformLocation(prog, 'uTime'),
    uMix: gl.getUniformLocation(prog, 'uMix'),
    uSpin: gl.getUniformLocation(prog, 'uSpin'),
    uPointer: gl.getUniformLocation(prog, 'uPointer'),
    uPointerAmp: gl.getUniformLocation(prog, 'uPointerAmp'),
    uSize: gl.getUniformLocation(prog, 'uSize'),
    uDrift: gl.getUniformLocation(prog, 'uDrift'),
    uDark: gl.getUniformLocation(prog, 'uDark')
  };

  /* ---------------------------------------------------------------
     particle count — scale to the device, stay honest on phones
     --------------------------------------------------------------- */

  const area = window.innerWidth * window.innerHeight;
  const cores = navigator.hardwareConcurrency || 4;
  let COUNT = Math.round(Math.min(14000, Math.max(2600, area * 0.0065)));
  if (cores <= 4) COUNT = Math.round(COUNT * 0.6);
  if (window.innerWidth < 720) COUNT = Math.min(COUNT, 3600);

  /* ---------------------------------------------------------------
     shapes — each fills a Float32Array(COUNT * 3)
     --------------------------------------------------------------- */

  // deterministic RNG so the cloud looks the same on every load
  let _s = 1337;
  function rnd() {
    _s = (_s * 1664525 + 1013904223) % 4294967296;
    return _s / 4294967296;
  }

  const seeds = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    seeds[i * 3] = rnd();
    seeds[i * 3 + 1] = rnd();
    seeds[i * 3 + 2] = rnd();
  }

  function make(fn) {
    const out = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) fn(out, i * 3, i / COUNT, i);
    return out;
  }

  // 1. sphere shell, slightly noisy — the "embedding cloud"
  const sphere = make((o, j, u) => {
    const phi = Math.acos(1 - 2 * rnd());
    const th = rnd() * Math.PI * 2;
    const r = 2.3 + (rnd() - 0.5) * 0.5;
    o[j] = Math.sin(phi) * Math.cos(th) * r;
    o[j + 1] = Math.cos(phi) * r * 0.92;
    o[j + 2] = Math.sin(phi) * Math.sin(th) * r;
  });

  // 2. double helix — a stream / pipeline
  const helix = make((o, j, u, i) => {
    const strand = i % 2;
    const t = u * Math.PI * 9;
    const r = 1.15 + (rnd() - 0.5) * 0.16;
    const off = strand * Math.PI;
    o[j] = Math.cos(t + off) * r;
    o[j + 1] = (u - 0.5) * 5.6;
    o[j + 2] = Math.sin(t + off) * r;
    // a few particles form the "rungs"
    if (i % 23 === 0) {
      const k = rnd();
      o[j] = Math.cos(t) * r * (1 - 2 * k);
      o[j + 2] = Math.sin(t) * r * (1 - 2 * k);
    }
  });

  // 3. lattice — a 3D grid, the "warehouse"
  const lattice = (function () {
    const n = Math.ceil(Math.cbrt(COUNT));
    const step = 4.0 / (n - 1);
    return make((o, j, u, i) => {
      const x = i % n, y = Math.floor(i / n) % n, z = Math.floor(i / (n * n)) % n;
      const jit = 0.09;
      o[j] = -2 + x * step + (rnd() - 0.5) * jit;
      o[j + 1] = -2 + y * step + (rnd() - 0.5) * jit;
      o[j + 2] = -2 + z * step + (rnd() - 0.5) * jit;
    });
  })();

  // 4. torus knot — the "system"
  const knot = make((o, j, u) => {
    const t = u * Math.PI * 2;
    const p = 2, q = 3;
    const cr = 2 + Math.cos(q * t) * 0.85;
    const rr = 0.36 * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    o[j] = cr * Math.cos(p * t) + Math.cos(a) * rr;
    o[j + 1] = Math.sin(q * t) * 0.95 + Math.sin(a) * rr;
    o[j + 2] = cr * Math.sin(p * t) + Math.cos(a + 1.7) * rr;
  });

  // 5. disc / galaxy — spiral arms
  const disc = make((o, j, u) => {
    const arm = Math.floor(rnd() * 3) * (Math.PI * 2 / 3);
    const r = Math.pow(rnd(), 0.55) * 2.9;
    const th = arm + r * 1.15 + (rnd() - 0.5) * 0.55;
    o[j] = Math.cos(th) * r;
    o[j + 1] = (rnd() - 0.5) * (0.35 + r * 0.09);
    o[j + 2] = Math.sin(th) * r;
  });

  // 6. converging ring — the "call to action"
  const ring = make((o, j, u) => {
    const th = u * Math.PI * 2 + (rnd() - 0.5) * 0.2;
    const r = 2.25 + (rnd() - 0.5) * 0.3;
    o[j] = Math.cos(th) * r;
    o[j + 1] = Math.sin(th) * r * 0.62;
    o[j + 2] = (rnd() - 0.5) * 0.8;
  });

  const SHAPES = [sphere, helix, lattice, knot, disc, ring];

  /* ---------------------------------------------------------------
     buffers
     --------------------------------------------------------------- */

  const fromData = new Float32Array(SHAPES[0]);
  const toData = new Float32Array(SHAPES[0]);

  function buffer(data, location, size) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return b;
  }

  const bufFrom = buffer(fromData, loc.aFrom, 3);
  const bufTo = buffer(toData, loc.aTo, 3);
  buffer(seeds, loc.aSeed, 3);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);

  // dark theme: colour adds, so overlapping points glow.
  // light theme: ordinary source-over, so points read as ink on paper.
  function setBlendMode(dark) {
    if (dark) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  setBlendMode(true);
  gl.clearColor(0, 0, 0, 0);

  /* ---------------------------------------------------------------
     matrices
     --------------------------------------------------------------- */

  const proj = new Float32Array(16);
  const view = new Float32Array(16);

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[11] = -1;
    out[10] = (far + near) / (near - far);
    out[14] = (2 * far * near) / (near - far);
  }

  function lookFrom(out, x, y, z) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    out[12] = -x; out[13] = -y; out[14] = -z;
  }

  /* ---------------------------------------------------------------
     state
     --------------------------------------------------------------- */

  const state = {
    shape: 0, prevShape: 0, mix: 1,
    spin: 0, spinRate: 0.055,
    camX: 0, camXTarget: 0,
    camY: 0, camYTarget: 0,
    camZ: 6.6, camZTarget: 6.6,
    pointerX: 0, pointerY: 0,
    ptrTargetX: 0, ptrTargetY: 0,
    amp: 0, ampTarget: 0,
    opacity: 0,
    dpr: 1, w: 0, h: 0,
    dark: 1,
    running: false, visible: true
  };

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    state.w = canvas.clientWidth;
    state.h = canvas.clientHeight;
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    perspective(proj, 0.92, state.w / state.h, 0.1, 40);
    // on wide screens the cloud sits to the right of the headline
    state.camXTarget = state.w >= 1080 ? -1.95 : 0;
  }

  /* ---------------------------------------------------------------
     morphing between shapes
     --------------------------------------------------------------- */

  function morphTo(index) {
    index = ((index % SHAPES.length) + SHAPES.length) % SHAPES.length;
    if (index === state.shape) return;

    // freeze the current interpolated positions as the new "from"
    const a = SHAPES[state.prevShape], b = SHAPES[state.shape], m = state.mix;
    for (let i = 0; i < fromData.length; i++) {
      fromData[i] = a[i] + (b[i] - a[i]) * m;
    }
    toData.set(SHAPES[index]);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufFrom);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, fromData);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufTo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, toData);

    state.prevShape = state.shape;
    state.shape = index;
    state.mix = 0;

    // rebind pointers after the buffer swap
    gl.bindBuffer(gl.ARRAY_BUFFER, bufFrom);
    gl.vertexAttribPointer(loc.aFrom, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufTo);
    gl.vertexAttribPointer(loc.aTo, 3, gl.FLOAT, false, 0, 0);
  }

  /* ---------------------------------------------------------------
     input
     --------------------------------------------------------------- */

  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -((e.clientY / window.innerHeight) * 2 - 1);
      state.ptrTargetX = nx * 3.4 + (state.w >= 1080 ? 1.95 : 0);
      state.ptrTargetY = ny * 2.2;
      state.ampTarget = 1;
    }, { passive: true });

    window.addEventListener('pointerleave', function () { state.ampTarget = 0; }, { passive: true });
  }

  /* ---------------------------------------------------------------
     public API — main.js drives shape + camera from scroll
     --------------------------------------------------------------- */

  window.Scene = {
    setShape: morphTo,
    shapeCount: SHAPES.length,
    setCamera: function (y, z) {
      if (typeof y === 'number') state.camYTarget = y;
      if (typeof z === 'number') state.camZTarget = z;
    },
    setSpin: function (rate) { state.spinRate = rate; },
    setTheme: function (isDark) {
      state.dark = isDark ? 1 : 0;
      setBlendMode(!!isDark);
      if (reduceMotion) draw(0);
    },
    pulse: function () { state.mix = Math.min(state.mix, 0.82); }
  };

  /* ---------------------------------------------------------------
     loop
     --------------------------------------------------------------- */

  let last = performance.now();
  let raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    state.mix = Math.min(1, state.mix + dt * 0.62);
    state.spin += dt * state.spinRate;
    state.opacity = Math.min(1, state.opacity + dt * 0.55);

    const k = 1 - Math.pow(0.0015, dt);       // frame-rate independent easing
    state.camX += (state.camXTarget - state.camX) * k;
    state.camY += (state.camYTarget - state.camY) * k;
    state.camZ += (state.camZTarget - state.camZ) * k;
    state.pointerX += (state.ptrTargetX - state.pointerX) * k;
    state.pointerY += (state.ptrTargetY - state.pointerY) * k;
    state.amp += (state.ampTarget - state.amp) * (1 - Math.pow(0.02, dt));

    draw(now / 1000);
  }

  function draw(time) {
    lookFrom(view, state.camX, state.camY, state.camZ);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniform1f(loc.uTime, time);
    gl.uniform1f(loc.uMix, state.mix);
    gl.uniform1f(loc.uSpin, state.spin);
    gl.uniform2f(loc.uPointer, state.pointerX, state.pointerY);
    gl.uniform1f(loc.uPointerAmp, state.amp * 0.55);
    gl.uniform1f(loc.uSize, 4.4 * state.dpr * state.opacity);
    gl.uniform1f(loc.uDrift, reduceMotion ? 0 : 0.055);
    gl.uniform1f(loc.uDark, state.dark);
    gl.drawArrays(gl.POINTS, 0, COUNT);
  }

  function start() {
    if (state.running || reduceMotion) return;
    state.running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    cancelAnimationFrame(raf);
  }

  /* pause when the tab is hidden or the canvas scrolls away */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else if (state.visible) start();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      state.visible = entries[0].isIntersecting;
      if (state.visible && !document.hidden) start(); else stop();
    }, { threshold: 0 }).observe(canvas);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (reduceMotion) { state.opacity = 1; draw(0); }
    }, 150);
  }, { passive: true });

  resize();

  if (reduceMotion) {
    state.opacity = 1;
    state.mix = 1;
    draw(0);
  } else {
    start();
  }
})();
