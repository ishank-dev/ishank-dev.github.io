import { presentation, advanceMorph } from './motion.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mode = presentation(location.search, reduced.matches);
document.documentElement.dataset.view = mode.dimensional ? '3d' : '2d';
document.querySelector('.view-switch [data-view="' + (mode.dimensional ? '3d' : '2d') + '"]').setAttribute('aria-current', 'page');
const motionButton = document.getElementById('motion-toggle');
const views = [];
let playing = mode.playing;
function updateMotionButton() {
  motionButton.textContent = playing ? 'Pause motion' : 'Play motion';
  motionButton.setAttribute('aria-pressed', String(playing));
  document.documentElement.dataset.motion = playing ? 'playing' : 'paused';
}
motionButton.addEventListener('click', () => { playing = !playing; updateMotionButton(); views.forEach(view => view.draw()); });
reduced.addEventListener('change', () => { playing = !reduced.matches && mode.dimensional; updateMotionButton(); views.forEach(view => view.draw()); });
updateMotionButton();

if (mode.dimensional) {
  try {
    const THREE = await import('../spatial/vendor/three.module.js');
    const blue = 0x2447df;
    const metal = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: .42, roughness: .2, clearcoat: 1, clearcoatRoughness: .13, ...extra });
    const pointer = { x: 0, y: 0 };
    window.addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth - .5; pointer.y = e.clientY / innerHeight - .5; }, { passive: true });

    function createView(id, holder, build, ambient = false) {
      const canvas = document.getElementById(id);
      if (!canvas || getComputedStyle(canvas).position === 'static') return;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); }
      catch { return; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, ambient ? 1 : 1.6));
      renderer.setClearColor(0, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      const scene = new THREE.Scene(), root = new THREE.Group();
      scene.add(root);
      const camera = new THREE.PerspectiveCamera(36, 1, .1, 70);
      scene.add(new THREE.HemisphereLight(0xf1f5ff, 0x798395, 2));
      [[0xffffff, 4, -3, 5, 5], [0xb0caff, 3, 4, 1, -3], [0xfff3df, 2, -3, -2, 2]].forEach(([color, intensity, x, y, z]) => {
        const light = new THREE.DirectionalLight(color, intensity); light.position.set(x, y, z); scene.add(light);
      });
      // A local studio environment gives the ribbons broad, photographic highlights.
      const studio = new THREE.Scene(); studio.background = new THREE.Color(0x8592b0);
      [[8, 4, -4, 4, 3], [3, 8, 5, 1, 2], [6, 2, 0, -4, 1]].forEach(([w, h, x, y, z]) => {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        panel.position.set(x, y, z); panel.lookAt(0, 0, 0); studio.add(panel);
      });
      const generator = new THREE.PMREMGenerator(renderer);
      const environment = generator.fromScene(studio, .06, .1, 30);
      scene.environment = environment.texture; generator.dispose();
      studio.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      let frame = 0, visible = true, lost = false, previous = 0, time = 0;
      let yaw = -.18, pitch = .08, drag = null;
      const state = build(root);
      const fallback = holder.querySelector('.problem-art,.work-art');
      function render(now) {
        frame = 0;
        if (lost || !visible || document.hidden) return;
        const dt = Math.min(previous ? (now - previous) / 1000 : .016, .04); previous = now;
        if (playing) time += dt;
        const active = state.update?.(dt, time) ?? false;
        root.rotation.set(pitch + (playing ? Math.sin(time * .32) * .065 + pointer.y * .08 : 0), yaw + (playing ? Math.sin(time * .24) * .2 + pointer.x * .16 : 0), 0);
        if (ambient) root.rotation.z = playing ? Math.sin(time * .12) * .12 : 0;
        renderer.render(scene, camera);
        if (playing || active) frame = requestAnimationFrame(render);
      }
      function draw() { if (!frame && !lost) frame = requestAnimationFrame(render); }
      function resize() {
        const w = ambient ? innerWidth : holder.clientWidth, h = ambient ? innerHeight : holder.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false); camera.aspect = w / h;
        camera.position.set(0, 0, ambient ? 15 : Math.max(state.distance || 8.4, 6.1 / camera.aspect)); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); draw();
      }
      const ro = new ResizeObserver(resize); ro.observe(holder);
      if (!ambient) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { previous = 0; draw(); } else { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: '30px' }).observe(holder);
      document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { previous = 0; draw(); } });
      if (!ambient) {
        canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => { if (!drag) return; yaw += (e.clientX - drag.x) * .009; pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * .006, -.9, .9); drag = { x: e.clientX, y: e.clientY }; draw(); });
        ['pointerup', 'pointercancel'].forEach(event => canvas.addEventListener(event, () => { drag = null; }));
        canvas.addEventListener('keydown', e => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
          e.preventDefault();
          if (e.key === 'Home') reset();
          else { yaw += e.key === 'ArrowLeft' ? -.15 : e.key === 'ArrowRight' ? .15 : 0; pitch = THREE.MathUtils.clamp(pitch + (e.key === 'ArrowUp' ? -.1 : e.key === 'ArrowDown' ? .1 : 0), -.9, .9); draw(); }
        });
      }
      function reset() { yaw = -.18; pitch = .08; draw(); }
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; ro.disconnect(); canvas.hidden = true; holder.classList.remove('has-3d'); fallback?.removeAttribute('aria-hidden'); state.fallback?.(); });
      if (!ambient) { holder.classList.add('has-3d'); fallback?.setAttribute('aria-hidden', 'true'); }
      canvas.hidden = false; resize();
      const view = { draw, reset }; views.push(view); return view;
    }

    // Flattened elliptical cross-sections make substantial ribbons, not wires.
    function ribbonGeometry(points, width = .29, thickness = .065) {
      const curve = new THREE.CatmullRomCurve3(points);
      const steps = 170, sides = 12, frames = curve.computeFrenetFrames(steps, false);
      const geometry = new THREE.TubeGeometry(curve, steps, 1, sides, false), vertices = geometry.attributes.position;
      const point = new THREE.Vector3();
      for (let i = 0; i <= steps; i++) {
        const center = curve.getPointAt(i / steps);
        for (let j = 0; j <= sides; j++) {
          const angle = j / sides * Math.PI * 2;
          point.copy(center).addScaledVector(frames.normals[i], Math.cos(angle) * width).addScaledVector(frames.binormals[i], Math.sin(angle) * thickness);
          vertices.setXYZ(i * (sides + 1) + j, point.x, point.y, point.z);
        }
      }
      geometry.computeVertexNormals(); return geometry;
    }
    const playground = document.getElementById('playground');
    let morph = playground.classList.contains('is-clear') ? 1 : 0, target = morph;
    const hero = createView('fieldwork-hero', document.querySelector('.playground-stage'), root => {
      const paths = [0, 1, 2].map(index => Array.from({ length: 90 }, (_, i) => {
        const u = i / 89, angle = u * Math.PI * 1.9 - Math.PI * .95 + index * 2.05;
        const messy = new THREE.Vector3(Math.cos(angle) * (1.45 + .32 * Math.sin(u * 6.28)), Math.sin(angle) * 1.34, Math.sin(angle * 2 + index) * .72);
        messy.applyAxisAngle(new THREE.Vector3(1, .25, 0).normalize(), index * .75 - .6);
        const clear = new THREE.Vector3((u - .5) * 3.7, (1 - index) * .84 + Math.sin(u * Math.PI * 2) * .12, Math.sin(u * Math.PI) * .2);
        return { messy, clear };
      }));
      const ribbons = paths.map((path, index) => {
        const mesh = new THREE.Mesh(ribbonGeometry(path.map(p => p.messy)), metal(index === 1 ? 0x8c9fee : blue, { metalness: index === 1 ? .6 : .38 })); root.add(mesh); return mesh;
      });
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(.24, 40, 24), metal(0xe2eacb, { metalness: .2, roughness: .16 })); pearl.position.set(.15, .07, .1); root.add(pearl);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.95, .009, 6, 160), metal(0x9aa9ce)); halo.rotation.set(.8, .5, .3); root.add(halo);
      const hint = document.querySelector('.three-hint'); hint.hidden = false;
      function shape() { const smooth = morph * morph * (3 - 2 * morph); ribbons.forEach((mesh, index) => { const old = mesh.geometry; mesh.geometry = ribbonGeometry(paths[index].map(p => p.messy.clone().lerp(p.clear, smooth))); old.dispose(); }); pearl.visible = morph < .95; halo.visible = morph < .95; }
      if (morph) shape();
      return { distance: 8.2, update(dt, time) { const next = advanceMorph(morph, target, dt, reduced.matches); if (next !== morph) { morph = next; shape(); } halo.rotation.z = .3 + time * .055; pearl.position.y = .07 + Math.sin(time * .7) * .09; return morph !== target; }, fallback() { hint.hidden = true; } };
    });
    new MutationObserver(() => { target = playground.classList.contains('is-clear') ? 1 : 0; hero?.draw(); }).observe(playground, { attributes: true, attributeFilter: ['class'] });
    document.getElementById('reset-fieldwork').addEventListener('click', () => hero?.reset());

    const work = createView('fieldwork-work', document.querySelector('.work-visual'), root => {
      const rings = [blue, 0xf4f6fa, 0x8198ef].map((color, index) => {
        const points = Array.from({ length: 110 }, (_, i) => { const a = i / 109 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * 1.25, Math.sin(a) * 1.25, Math.sin(a * 2) * .16); });
        const mesh = new THREE.Mesh(ribbonGeometry(points, .22, .08), metal(color, { metalness: index === 1 ? .12 : .4 })); mesh.rotation.set(index * .85, index * 1.1, index * .3); root.add(mesh); return mesh;
      });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 3), metal(blue)); root.add(core);
      const button = document.querySelector('.work-reset'); button.hidden = false;
      return { distance: 7.8, update(dt, time) { rings.forEach((ring, i) => { ring.rotation.z = i * .3 + time * (i % 2 ? -.08 : .065); }); core.rotation.set(time * .08, time * .12, 0); }, fallback() { button.hidden = true; } };
    });
    document.querySelector('.work-reset').addEventListener('click', () => work?.reset());

    createView('approach-scene', document.getElementById('approach'), root => {
      const rings = [0, 1, 2].map(i => {
        const object = new THREE.Mesh(new THREE.TorusGeometry(2.3 - i * .3, .12, 16, 100), metal(0xb9cef4));
        object.rotation.set(.55 + i * .6, .4 + i * .35, i * .5); object.position.x = -2.2; root.add(object); return object;
      });
      return { distance: 8.5, update(dt, time) { rings.forEach((ring, i) => { ring.rotation.z = i * .5 + time * .045 * (i % 2 ? -1 : 1); }); } };
    });

    createView('ambient-scene', document.body, root => {
      const forms = [];
      [[-7, 2.6, -3, 2.8], [7.7, -2.5, -4, 3.1], [-5.5, -4.6, -4, 1.2]].forEach(([x, y, z, size], i) => {
        const object = new THREE.Mesh(new THREE.TorusGeometry(size, .16, 12, 100), metal(i === 1 ? 0xc8d3f1 : 0xd4dfee, { roughness: .38, metalness: .2 })); object.position.set(x, y, z); object.rotation.set(.6 + i, .2 + i * .3, .3); root.add(object); forms.push({ object, y, i });
      });
      return { update(dt, time) { const scroll = window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight); forms.forEach(({ object, y, i }) => { object.position.y = y + Math.sin(time * .24 + i) * .35 + scroll * 2; object.rotation.z = time * .035 * (i % 2 ? -1 : 1); }); } };
    }, true);
    if (views.length) { motionButton.hidden = false; updateMotionButton(); }
  } catch (error) {
    console.warn('3D unavailable; the 2D artwork remains available.', error);
  }
}
