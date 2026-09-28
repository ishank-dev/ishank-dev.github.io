// Scroll-driven flight across the universe. WebGL2, no libraries.
// The camera flies forward as the page scrolls; each section is a real destination (see journey.mjs).
import { WAYPOINTS, JOURNEY_STEP, cameraZ, sceneAt, waypointAt, project, streakLength, journeyPolicy, flyby } from './journey.mjs?v=5';
import { BODY_VIEWS, orient, mapURL, mapSize } from './planets.mjs?v=6';
import { galaxyParticles, shelterRects, GALAXY_STRIDE } from './galaxy.mjs?v=3';

const root = document.documentElement;
const canvas = document.getElementById('universe');
const gl = canvas ? canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }) : null;

function fail(error) {
  console.warn('Universe unavailable; using the 2D sky instead.', error);
  root.dataset.universe = 'off';
  window.dispatchEvent(new Event('universe-failed'));
}

if (gl) {
  root.dataset.universe = 'on';
  try { start(); } catch (error) { fail(error); }
}

function start() {
  const FULLSCREEN = `#version 300 es
  void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  const NOISE = `
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }`;

  // Text shelters: boxes behind visible text blocks (device px, GL origin), measured every frame. Scenery dims inside them
  // with a soft feathered edge, so copy stays readable over nebulae, planets, stars, and the galaxy.
  const SHELTER = `
  uniform vec4 uShelter[16]; uniform int uShelterCount; uniform float uFeather;
  float shelter(vec2 p){
    float m = 0.0;
    for (int i = 0; i < 16; i++){
      if (i >= uShelterCount) break;
      vec4 r = uShelter[i];
      vec2 q = max(max(r.xy - p, p - r.zw), 0.0);
      m = max(m, 1.0 - smoothstep(0.0, uFeather, length(q)));
    }
    return m;
  }`;
  const GALAXY_TILT = 1.0, GALAXY_ANGLE = -0.35; // Andromeda's disk, tilted toward us so the arms read

  // Deep space, nebula layers that approach and pass, and the Milky Way band.
  const BACKGROUND = `#version 300 es
  precision highp float;
  uniform vec2 uRes; uniform float uTime, uTravel, uNebula, uCore, uRoll;
  uniform vec3 uPalA, uPalB, uPalC;
  out vec4 outColor;
  ${NOISE}
  void main(){
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = (frag - 0.5 * uRes) / uRes.y;
    float c = cos(uRoll), s = sin(uRoll); uv = mat2(c, -s, s, c) * uv;
    vec3 col = mix(vec3(0.010, 0.014, 0.040), vec3(0.028, 0.040, 0.100), smoothstep(-0.8, 0.7, uv.y));
    float z = uTravel * 0.011;
    vec3 neb = vec3(0.0);
    for (int i = 0; i < 3; i++){
      float fi = float(i), cyc = z + fi / 3.0, depth = fract(cyc);
      float scale = mix(3.4, 0.42, depth * depth);
      float fade = smoothstep(0.0, 0.35, depth) * (1.0 - smoothstep(0.6, 1.0, depth));
      vec2 seed = vec2(floor(cyc) * 3.71 + fi * 9.2, floor(cyc) * 1.93 + fi * 4.7);
      vec2 p = uv * scale + seed;
      float warp = fbm(p * 0.9 + vec2(uTime * 0.012, -uTime * 0.008));
      float n = fbm(p + warp * 1.35);
      float dens = smoothstep(0.42, 0.92, n) * fade;
      vec3 tint = mix(uPalA, uPalB, smoothstep(0.3, 0.75, fbm(p * 0.45 + 17.0)));
      tint = mix(tint, uPalC, smoothstep(0.62, 0.95, n));
      float dust = smoothstep(0.55, 0.8, fbm(p * 1.7 + 41.0));
      neb += tint * dens * (1.0 - dust * 0.55);
    }
    col += neb * uNebula * 1.45;
    vec2 b = uv; float across = (b.y + b.x * 0.32) * 3.0; float band = exp(-across * across);
    float bandN = fbm(b * vec2(3.0, 9.0) + vec2(uTravel * 0.004, 0.0));
    vec2 k = (b - vec2(-0.56, 0.3)) * vec2(1.0, 2.4); float core = exp(-dot(k, k) * 7.5);
    float lanes = smoothstep(0.55, 0.85, fbm(b * vec2(5.0, 14.0) + 3.0));
    vec3 milky = (band * (0.35 + 0.65 * bandN) * vec3(0.56, 0.52, 0.64) + core * vec3(1.0, 0.7, 0.4) * 1.15) * (1.0 - lanes * 0.62);
    col += milky * (0.045 + uCore * 0.18);
    outColor = vec4(col, 1.0);
  }`;

  const BLIT = `#version 300 es
  precision highp float;
  uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime;
  out vec4 outColor;
  ${SHELTER}
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 c = texture(uTex, uv).rgb;
    vec2 q = uv - 0.5; c *= 1.0 - dot(q, q) * 0.85;
    c *= 1.0 - 0.58 * shelter(gl_FragCoord.xy);
    float grain = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
    outColor = vec4(c + (grain - 0.5) * 0.012, 1.0);
  }`;

  const STAR_VERTEX = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPos;
  layout(location = 1) in vec4 aInfo; // size, phase, speed, brightness
  layout(location = 2) in vec3 aColor;
  layout(location = 3) in float aEnd;  // streaks: 0 head, 1 tail
  uniform vec2 uRes; uniform float uCamZ, uSpan, uFocal, uTime, uRoll, uWrap, uStreak, uLines;
  out vec3 vColor; out float vAlpha;
  void main(){
    float rel = uWrap > 0.5 ? mod(aPos.z - uCamZ, uSpan) : aPos.z - uCamZ;
    if (rel < 0.6){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; gl_PointSize = 0.0; return; }
    float depth = rel * (1.0 + aEnd * uStreak);
    float c = cos(uRoll), s = sin(uRoll);
    vec2 screen = (mat2(c, -s, s, c) * aPos.xy) / depth * uFocal;
    gl_Position = vec4(screen / (uRes * 0.5), 0.0, 1.0);
    float far = uWrap > 0.5 ? (1.0 - smoothstep(uSpan * 0.72, uSpan, rel)) : (1.0 - smoothstep(420.0, 900.0, rel));
    float twinkle = 0.72 + 0.28 * sin(uTime * aInfo.z + aInfo.y);
    vAlpha = far * smoothstep(0.6, 5.0, rel) * aInfo.w * twinkle * (uLines > 0.5 ? (1.0 - aEnd) * 0.85 * step(0.62, aInfo.w) : 1.0);
    vColor = aColor;
    gl_PointSize = clamp(aInfo.x * uFocal / rel * 0.045, 1.0, 13.0);
  }`;

  const STAR_FRAGMENT = `#version 300 es
  precision highp float;
  in vec3 vColor; in float vAlpha; uniform float uLines; out vec4 outColor;
  ${SHELTER}
  void main(){
    float a = vAlpha * (1.0 - 0.7 * shelter(gl_FragCoord.xy));
    if (uLines < 0.5){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; a *= exp(-d * d * 4.5); }
    outColor = vec4(vColor * a, a);
  }`;

  // Landmarks, drawn at full resolution inside their own bounding boxes: lit spheres (Earth, Jupiter, Saturn, the arrival world),
  // the Pleiades, the galactic core, and Andromeda with its companions.
  // Earth, Jupiter, and Saturn wear real surface maps once they load (see planets.mjs); until then, or if a map fails,
  // they fall back to the procedural surfaces below. The arrival world is fictional: it wears a generated map (Google Gemini,
  // provenance in maps/PROVENANCE.md) under fine procedural relief, and falls back to a procedural surface if the map fails.
  // The Orion nebula and the galactic core are generated textures drawn as light over the sky; the core keeps its procedural
  // stars on top, so stars stay the only things that glow.
  const PLANET = `#version 300 es
  precision highp float;
  uniform vec4 uBody; // centre x, centre y, radius (device px), kind
  uniform vec3 uColA, uColB, uColC, uLight; uniform float uTime, uFade, uDim; uniform vec2 uRes;
  uniform float uMapped, uSprite, uSpin, uCloudSpin, uExposure; uniform mat3 uRot; uniform vec3 uPole;
  uniform sampler2D uSurface, uNight, uClouds, uRing;
  out vec4 outColor;
  ${NOISE}
  ${SHELTER}
  float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  const float PI = 3.14159265;
  vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
  vec3 toDisplay(vec3 c){ return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
  vec3 tonemap(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  // Equirectangular lookup whose mip level ignores the jump at the dateline (no seam line).
  vec4 surfaceMap(sampler2D map, vec3 p, float spin){
    float lon = atan(p.x, p.z) - spin, lat = asin(clamp(p.y, -1.0, 1.0));
    vec2 a = vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI), b = vec2(fract(lon / (2.0 * PI)), a.y);
    vec2 dxa = dFdx(a), dya = dFdy(a), dxb = dFdx(b), dyb = dFdy(b);
    bool useB = abs(dxa.x) + abs(dya.x) > abs(dxb.x) + abs(dyb.x);
    return textureGrad(map, a, useB ? dxb : dxa, useB ? dyb : dya);
  }
  // Saturn's rings from 1.2 to 2.3 planet radii; explicit LOD so the fine ringlets do not shimmer.
  float ringDensity(float rho, out vec3 color){
    float u = (rho - 1.2) / 1.1;
    vec4 t = textureLod(uRing, vec2(clamp(u, 0.0, 1.0), 0.5), max(0.0, log2(1862.0 / uBody.z)));
    color = toLinear(t.rgb);
    return t.a * step(0.0, u) * step(u, 1.0);
  }
  vec4 mappedPlanet(vec2 d, float kind){
    float r2 = dot(d, d), r = sqrt(r2);
    vec3 n = vec3(d, sqrt(max(1.0 - r2, 0.0)));
    vec3 p = uRot * n, L = normalize(uLight);
    float ndl = dot(n, L), cover = smoothstep(1.0, 1.0 - 1.5 / uBody.z, r);
    vec3 col, glow; float a = cover;
    if (kind < 0.5){
      vec3 day = toLinear(surfaceMap(uSurface, p, uSpin).rgb);
      vec3 night = toLinear(surfaceMap(uNight, p, uSpin).rgb);
      float cloud = surfaceMap(uClouds, p, uSpin + uCloudSpin).r;
      float lum = dot(day, vec3(0.2126, 0.7152, 0.0722));
      float ocean = smoothstep(0.004, 0.02, day.b - max(day.r, day.g)) * (1.0 - smoothstep(0.05, 0.2, lum));
      float grazing = pow(1.0 - n.z, 4.0);   // water mirrors at low angles
      float glint = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 80.0) * (1.2 + 4.0 * grazing) * ocean * (1.0 - cloud);
      float lit = max(ndl, 0.0);
      col = day * lit * 1.7;
      col = mix(col, vec3(0.92, 0.94, 0.97) * lit * 1.8 * mix(1.0, 0.7, grazing), cloud * 0.92);
      col += vec3(1.0, 0.86, 0.66) * glint * smoothstep(-0.1, 0.2, ndl);
      col += night * vec3(1.0, 0.72, 0.4) * (1.0 - smoothstep(-0.18, 0.06, ndl)) * (1.0 - cloud * 0.85) * 3.0;
      float rim = pow(1.0 - n.z, 2.2), dusk = exp(-pow((ndl - 0.02) * 6.0, 2.0));
      col = col * (1.0 - rim * 0.45) + vec3(0.28, 0.52, 1.0) * rim * clamp(ndl * 1.3 + 0.1, 0.0, 1.0) * 0.9
          + vec3(1.0, 0.42, 0.18) * rim * dusk * smoothstep(-0.1, 0.1, ndl) * 0.1;
      // A thin atmosphere past the limb: blue on the day side, warm where the terminator meets it.
      float side = dot(normalize(vec3(d, 0.0)), L), beyond = max(r - 1.0, 0.0);
      float shell = exp(-beyond / 0.011) * (1.0 - cover), haze = exp(-beyond / 0.045) * (1.0 - cover);
      glow = (vec3(0.3, 0.58, 1.0) * shell * 1.6 + vec3(0.2, 0.4, 1.0) * haze * 0.25) * smoothstep(-0.35, 0.45, side)
           + vec3(1.0, 0.45, 0.2) * shell * exp(-pow(side * 3.5, 2.0)) * 0.2;
    } else if (kind > 5.5){
      // The arrival world: continents and seas from its map, fine relief on top so it holds up at this size, soft daylight,
      // and a thin sage-teal atmosphere along the limb.
      vec3 surface = toLinear(surfaceMap(uSurface, p, uSpin).rgb) * vec3(0.9, 1.04, 0.9);   // nudged off Earth's blue, toward teal-green
      vec2 ll = vec2(atan(p.x, p.z), asin(clamp(p.y, -1.0, 1.0)));
      surface *= mix(0.8, 1.16, fbm(ll * 40.0) * 0.6 + fbm(ll * 120.0) * 0.4);
      col = surface * smoothstep(-0.05, 0.35, ndl) * max(ndl, 0.0) * 1.9;
      float rim = pow(1.0 - n.z, 2.4);
      col = col * (1.0 - rim * 0.4) + vec3(0.42, 0.78, 0.7) * rim * clamp(ndl * 1.3 + 0.1, 0.0, 1.0) * 0.7;
      float side = dot(normalize(vec3(d, 0.0)), L), beyond = max(r - 1.0, 0.0);
      float shell = exp(-beyond / 0.006) * (1.0 - cover), haze = exp(-beyond / 0.03) * (1.0 - cover);
      glow = (vec3(0.5, 0.86, 0.72) * shell * 1.3 + vec3(0.4, 0.7, 0.9) * haze * 0.2) * smoothstep(-0.35, 0.45, side);
    } else {
      vec3 surface = toLinear(surfaceMap(uSurface, p, uSpin).rgb);
      col = surface * smoothstep(-0.06, 0.4, ndl) * max(ndl, 0.0) * 1.9 * mix(0.5, 1.0, pow(n.z, 0.45));
      if (kind > 1.5 && kind < 2.5){
        vec3 ringColor;
        float toward = dot(L, uPole);
        float t = -dot(n, uPole) / (abs(toward) < 1e-4 ? 1e-4 : toward);
        col *= 1.0 - 0.85 * (t > 0.0 ? ringDensity(length(n + t * L), ringColor) : 0.0);   // ring shadow on the globe
        float rz = -(d.x * uPole.x + d.y * uPole.y) / uPole.z;
        vec3 q = vec3(d, rz);
        float ring = ringDensity(length(q), ringColor);
        float b = dot(q, L), c = dot(q, q) - 1.0, disc = b * b - c;
        float shadow = (disc > 0.0 && (-b - sqrt(disc)) > 0.0) ? 1.0 : 0.0;                  // globe shadow on the rings
        ringColor *= (0.25 + 1.1 * abs(toward)) * (1.0 - 0.92 * shadow) * 1.5;
        if ((r2 >= 1.0 || rz > n.z) && ring > 0.0){ col = ringColor * ring + col * (1.0 - ring); a = ring + a * (1.0 - ring); }
      }
      glow = vec3(0.9, 0.8, 0.65) * exp(-max(r - 1.0, 0.0) / 0.012) * (1.0 - cover) * smoothstep(-0.2, 0.6, dot(normalize(vec3(d, 0.0)), L)) * 0.12;
    }
    return vec4(toDisplay(tonemap(col * uExposure)) * a + toDisplay(tonemap(glow * uExposure)), a);
  }
  vec4 ringAt(vec2 d, bool front){
    float t = -0.38; vec2 q = mat2(cos(t), -sin(t), sin(t), cos(t)) * d;
    if ((q.y < 0.0) != front) return vec4(0.0);
    float e = length(vec2(q.x, q.y / 0.28));
    if (e < 1.28 || e > 2.3) return vec4(0.0);
    float bands = 0.55 + 0.45 * sin(e * 38.0) * sin(e * 11.0 + 1.0);
    float gap = smoothstep(0.0, 0.035, abs(e - 1.8) - 0.02);
    float a = bands * gap * smoothstep(1.28, 1.34, e) * (1.0 - smoothstep(2.22, 2.3, e)) * 0.9;
    vec3 col = uColC * (0.35 + 0.65 * clamp(0.5 - q.x * 0.25, 0.0, 1.0));
    return vec4(col * a, a);
  }
  vec4 sphere(vec2 d, float kind){
    float r2 = dot(d, d), r = sqrt(r2);
    vec3 L = normalize(uLight);
    vec4 col = vec4(0.0);
    bool rings = kind > 1.5 && kind < 2.5;
    bool world = kind < 0.5 || kind > 5.5;
    if (rings && r2 >= 1.0) col = ringAt(d, false);
    if (r2 < 1.0){
      vec3 n = vec3(d, sqrt(1.0 - r2));
      float diff = max(dot(n, L), 0.0), lit = smoothstep(-0.08, 0.3, dot(n, L));
      vec2 sph = vec2(atan(n.x, n.z), asin(n.y));
      vec3 surf; vec3 glow = vec3(0.0);
      if (world){
        sph.x += uTime * 0.008;
        float land = smoothstep(0.5, 0.56, fbm(sph * vec2(2.2, 2.6) + (kind > 5.5 ? 11.0 : 3.0)));
        float cloud = smoothstep(0.52, 0.82, fbm(sph * vec2(4.0, 7.0) + vec2(uTime * 0.012, 0.0)));
        vec3 ground = uColB * mix(0.7, 1.3, fbm(sph * 8.0));
        surf = mix(uColA, ground, land);
        surf = mix(surf, kind > 5.5 ? vec3(0.9, 0.95, 0.88) : vec3(0.92), cloud * 0.78);
        if (kind < 0.5) glow = vec3(1.0, 0.72, 0.38) * (1.0 - lit) * land * step(0.68, fbm(sph * 42.0)) * 0.45;
      } else {
        float bands = fbm(vec2(n.y * 9.0, sph.x * 1.2 + uTime * 0.012));
        float stripes = 0.5 + 0.5 * sin(n.y * 24.0 + bands * 5.0);
        surf = mix(uColA, uColB, stripes);
        surf = mix(surf, uColC, smoothstep(0.62, 0.9, bands));
        if (kind < 1.5){ vec2 spot = vec2(sph.x - 0.5, n.y + 0.32) * vec2(3.2, 7.0); surf = mix(surf, vec3(0.72, 0.34, 0.2), (1.0 - smoothstep(0.55, 1.0, length(spot))) * 0.8); }
      }
      vec3 c = surf * (0.02 + diff * 1.18) * mix(0.55, 1.0, pow(n.z, 0.35)) + glow;
      c += uColC * pow(1.0 - n.z, 3.0) * lit * 0.55;
      col = vec4(c, 1.0);
    } else {
      float halo = exp(-(r - 1.0) * (world ? 22.0 : 34.0));
      float side = clamp(dot(normalize(vec3(d, 0.25)), L) + 0.2, 0.0, 1.0);
      col = vec4(col.rgb * (1.0 - halo * side * 0.6) + uColC * halo * side * 0.9, max(col.a, halo * side * 0.9));
    }
    if (rings){ vec4 f = ringAt(d, true); col = vec4(f.rgb + col.rgb * (1.0 - f.a), f.a + col.a * (1.0 - f.a)); }
    return col;
  }
  // The Pleiades: small soft blue-white stars, no diffraction spikes, with faint members and streaky reflection nebulosity.
  vec3 softStar(vec2 d, vec2 at, float size, vec3 color){
    vec2 q = (d - at) / size; float r2 = dot(q, q);
    return color * (exp(-r2 * 80.0) * 1.7 + exp(-r2 * 9.0) * 0.16);
  }
  vec4 pleiades(vec2 d, vec2 frag){
    vec2 S[7] = vec2[7](vec2(0.02, -0.02), vec2(-0.5, 0.03), vec2(-0.57, 0.15), vec2(0.22, -0.2), vec2(0.46, 0.07), vec2(0.34, 0.33), vec2(0.53, 0.52));
    float B[7] = float[7](1.0, 0.82, 0.55, 0.76, 0.86, 0.8, 0.64);
    vec3 c = vec3(0.0);
    for (int i = 0; i < 7; i++) c += softStar(d, S[i], 0.19 + 0.09 * B[i], mix(vec3(0.68, 0.79, 1.0), vec3(0.86, 0.92, 1.0), B[i])) * B[i];
    float member = step(0.995, h1(floor(frag / 2.0))) * exp(-dot(d, d) * 1.4);
    c += vec3(0.72, 0.83, 1.0) * member * 0.75;
    vec2 p = d * 2.2;
    float wisps = fbm(vec2(p.x * 1.4 + p.y * 0.55, p.y * 5.0) + 7.0) * fbm(p * 1.3 + 3.0);
    vec2 m = d - vec2(0.05, 0.12);
    c += vec3(0.24, 0.38, 0.95) * smoothstep(0.16, 0.5, wisps) * exp(-dot(m, m) * 2.4) * 0.8;
    return vec4(c, 0.0);
  }
  // Andromeda's unresolved light under its particle stars: a warm nucleus and a faint tilted disk. The stars are drawn as points.
  vec4 andromeda(vec2 d){
    float ca = cos(${(-GALAXY_ANGLE).toFixed(4)}), sa = sin(${(-GALAXY_ANGLE).toFixed(4)});
    vec2 g = mat2(ca, -sa, sa, ca) * d; g.y /= cos(${GALAXY_TILT.toFixed(4)});
    float r = length(g);
    vec3 light = exp(-r * r * 60.0) * vec3(1.0, 0.84, 0.6) * 0.9 + exp(-r * 3.4) * vec3(0.42, 0.44, 0.7) * 0.1;
    return vec4(light * (1.0 - smoothstep(0.9, 1.25, r)), 0.0);
  }
  vec4 galacticCore(vec2 d, vec2 frag){
    vec2 k = d * vec2(1.0, 2.2);
    float bulge = exp(-dot(k, k) * 3.2), glow = exp(-dot(k, k) * 0.9) * 0.35;
    float stars = step(1.0 - (0.015 + bulge * 0.2), h1(floor(frag))) * (0.4 + 0.6 * h1(floor(frag) + 7.0));
    float across = (d.y + d.x * 0.18 + 0.03 + (fbm(d * 3.0) - 0.5) * 0.14) * 8.0;
    float lane = exp(-across * across) * smoothstep(0.3, 0.7, fbm(d * vec2(4.0, 9.0) + 11.0) + 0.25);
    vec3 light = bulge * vec3(1.0, 0.8, 0.52) * 1.45 + glow * vec3(0.9, 0.7, 0.5) + stars * vec3(1.0, 0.9, 0.78) * (0.3 + bulge);
    float dust = clamp(lane * 0.85, 0.0, 0.85) * (1.0 - smoothstep(0.9, 1.6, length(k)));
    return vec4(light * (1.0 - dust), dust);
  }
  // The Orion nebula as generated art: light added to the sky (no alpha), fading out before its square edge.
  vec4 nebulaSprite(vec2 d){
    vec3 c = texture(uSurface, vec2(0.5 + 0.5 * d.x, 0.5 - 0.5 * d.y)).rgb;
    return vec4(c * (1.0 - smoothstep(0.78, 1.0, length(d))) * 0.85, 0.0);
  }
  vec4 coreSprite(vec2 d, vec2 frag){
    vec3 c = texture(uSurface, vec2(0.5 + 0.5 * d.x, 0.5 - 0.5 * d.y)).rgb * (1.0 - smoothstep(0.8, 1.0, length(d))) * 0.95;
    vec2 k = d * vec2(1.0, 2.2);
    float bulge = exp(-dot(k, k) * 3.2);
    float stars = step(1.0 - (0.012 + bulge * 0.16), h1(floor(frag))) * (0.4 + 0.6 * h1(floor(frag) + 7.0));
    return vec4(c + stars * vec3(1.0, 0.9, 0.78) * (0.25 + bulge * 0.8), 0.0);
  }
  void main(){
    vec2 d = (gl_FragCoord.xy - uBody.xy) / uBody.z;
    float kind = uBody.w;
    vec4 col = uSprite > 0.5 ? (kind > 6.5 ? nebulaSprite(d) : coreSprite(d, gl_FragCoord.xy)) : uMapped > 0.5 ? mappedPlanet(d, kind) : kind > 2.5 && kind < 3.5 ? pleiades(d, gl_FragCoord.xy) : kind > 3.5 && kind < 4.5 ? andromeda(d) : kind > 4.5 && kind < 5.5 ? galacticCore(d, gl_FragCoord.xy) : sphere(d, kind);
    // Keep the copy column readable: scenery dims where it crosses it and stays vivid toward the edges.
    col.rgb *= mix(uDim, 1.0, smoothstep(0.22, 0.46, abs(gl_FragCoord.x / uRes.x - 0.5)));
    col.rgb *= 1.0 - 0.62 * shelter(gl_FragCoord.xy);
    outColor = col * uFade;
  }`;

  // Andromeda as individual stars: each point turns with differential rotation (inner stars faster), then the disk is
  // tilted toward us and placed at the fly-by's spot. Companions M32 and M110 keep their screen positions.
  const GALAXY_VERTEX = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPos;
  layout(location = 1) in vec4 aColor;
  layout(location = 2) in vec2 aInfo; // size (css px), 1 = disk star, 0 = companion
  uniform vec2 uRes; uniform vec3 uCenter; uniform float uSpin, uFade, uPix;
  out vec4 vColor;
  void main(){
    vec3 p = aPos;
    if (aInfo.y > 0.5){
      float a = uSpin / (0.3 + length(p.xy));
      p.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xy;
      p = vec3(p.x, p.y * cos(${GALAXY_TILT.toFixed(4)}) - p.z * sin(${GALAXY_TILT.toFixed(4)}), p.y * sin(${GALAXY_TILT.toFixed(4)}) + p.z * cos(${GALAXY_TILT.toFixed(4)}));
    }
    vec2 s = mat2(cos(${GALAXY_ANGLE.toFixed(4)}), -sin(${GALAXY_ANGLE.toFixed(4)}), sin(${GALAXY_ANGLE.toFixed(4)}), cos(${GALAXY_ANGLE.toFixed(4)})) * p.xy;
    gl_Position = vec4((uCenter.xy + s * uCenter.z) / uRes * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = aInfo.x * uPix;
    vColor = vec4(aColor.rgb, aColor.a * uFade);
  }`;
  const GALAXY_FRAGMENT = `#version 300 es
  precision highp float;
  in vec4 vColor; out vec4 outColor;
  ${SHELTER}
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = vColor.a * exp(-d * d * 3.5) * (1.0 - 0.65 * shelter(gl_FragCoord.xy));
    outColor = vec4(vColor.rgb * a, a);
  }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function program(vertex, fragment) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) { const { name } = gl.getActiveUniform(p, i); uniforms[name] = gl.getUniformLocation(p, name); }
    return { p, u: uniforms };
  }
  const background = program(FULLSCREEN, BACKGROUND);
  const blit = program(FULLSCREEN, BLIT);
  const stars = program(STAR_VERTEX, STAR_FRAGMENT);
  const planet = program(FULLSCREEN, PLANET);
  const galaxy = program(GALAXY_VERTEX, GALAXY_FRAGMENT);
  gl.useProgram(planet.p);
  ['uSurface', 'uNight', 'uClouds', 'uRing'].forEach((name, unit) => gl.uniform1i(planet.u[name], unit));
  const emptyVao = gl.createVertexArray();

  // Stars: a repeating tube of field stars around the flight path, plus Orion's Trapezium as fixed landmark stars.
  const SPAN = 260;
  let seed = 3411824;
  const random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const SPECTRAL = [[0.8, 0.85, 1], [0.93, 0.95, 1], [1, 0.96, 0.9], [1, 0.85, 0.68], [1, 0.74, 0.62]];
  const spectral = () => { const roll = random(); return SPECTRAL[roll < 0.22 ? 0 : roll < 0.6 ? 1 : roll < 0.8 ? 2 : roll < 0.93 ? 3 : 4]; };
  function starData(count) {
    const data = new Float32Array(count * 10);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, radius = 7 + Math.sqrt(random()) * 105;
      const color = spectral();
      data.set([Math.cos(angle) * radius, Math.sin(angle) * radius, random() * SPAN, 0.6 + random() ** 3 * 3.4, random() * 6.28, 0.6 + random() * 1.8, 0.35 + random() * 0.65, ...color], i * 10);
    }
    return data;
  }
  function landmarkData() {
    const list = [];
    const add = (x, y, z, size, bright, color) => list.push(x, y, z, size, random() * 6.28, 0.4 + random(), bright, ...color);
    [[-1.4, 0.6], [0.3, 1.2], [1.1, -0.2], [-0.2, -0.9]].forEach(([x, y]) => add(-3 + x, 1.5 + y, 486, 5.5, 1, [1, 0.95, 0.88]));
    return new Float32Array(list);
  }
  function makeVao(data, instanced) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 40;
    [[0, 3, 0], [1, 4, 12], [2, 3, 28]].forEach(([location, size, offset]) => {
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, instanced ? 1 : 0);
    });
    if (instanced) {
      const ends = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ends); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    } else gl.vertexAttrib1f(3, 0);
    gl.bindVertexArray(null);
    return { vao, count: data.length / 10 };
  }

  // Landmarks. Earth uses true perspective from orbit; the others are art-directed fly-bys that hold a spot near a screen edge
  // (anchor, as fractions of the viewport from its centre, +y up) and slide outward as the camera closes in.
  const BODIES = [
    { kind: 0, world: true, x: 14, y: -69, z: 38, radius: 54, a: [0.02, 0.09, 0.26], b: [0.2, 0.24, 0.12], c: [0.5, 0.74, 1], light: [0.5, 0.62, 0.55], dim: 1 },
    { kind: 1, z: 192, radius: 11, anchor: [0.5, -0.02], slide: [0.08, -0.05], max: 0.42, a: [0.79, 0.64, 0.48], b: [0.54, 0.36, 0.24], c: [0.95, 0.88, 0.77], light: [-0.55, 0.42, 0.7], dim: 0.55, reach: 1.25 },
    { kind: 2, z: 296, radius: 8.5, anchor: [-0.34, -0.3], slide: [-0.05, -0.04], max: 0.15, a: [0.85, 0.75, 0.54], b: [0.66, 0.54, 0.33], c: [0.95, 0.9, 0.77], light: [0.6, 0.35, 0.7], dim: 0.7, reach: 2.4 },
    { kind: 3, z: 392, radius: 16, anchor: [0.3, 0.3], slide: [0.05, 0.04], max: 0.26, a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], light: [0, 0, 1], dim: 0.6, reach: 1.3 },
    { kind: 7, sprite: 'orion', z: 490, radius: 40, anchor: [0.3, 0.2], slide: [0.05, 0.04], max: 0.44, a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], light: [0, 0, 1], dim: 0.55, reach: 1.02 },
    { kind: 5, sprite: 'core', z: 592, radius: 40, anchor: [-0.3, -0.12], slide: [-0.04, 0], max: 0.5, a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], light: [0, 0, 1], dim: 0.55, reach: 1.7 },
    { kind: 4, z: 692, radius: 44, anchor: [-0.24, -0.12], slide: [-0.03, -0.02], max: 0.55, a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], light: [0, 0, 1], dim: 0.6, reach: 1.35 },
    { kind: 6, horizon: true, a: [0.02, 0.16, 0.18], b: [0.46, 0.62, 0.36], c: [0.66, 0.9, 0.72], light: [0.25, 0.35, -0.9], dim: 1 },
  ];

  // Real surface maps for Earth, Jupiter, and Saturn. Earth's day and cloud maps load first because the hero shows Earth;
  // night lights and the giants follow. Each body stays hidden until its maps are ready, then fades in (at once when motion
  // is off); if a map cannot load, the body falls back to its procedural surface instead.
  const MAPPED = { 0: 'earth', 1: 'jupiter', 2: 'saturn', 6: 'arrival' };
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  for (const body of BODIES) {
    const name = MAPPED[body.kind];
    if (!name) continue;
    const { rotation, pole } = orient(BODY_VIEWS[name]);
    Object.assign(body, { view: BODY_VIEWS[name], rotation: new Float32Array(rotation), pole, maps: null, mapState: 'loading', readyAt: 0 });
  }
  async function loadMap(key, size) {
    const image = new Image();
    image.src = mapURL(key, size);
    await image.decode();
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, key === 'saturnRing' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return texture;
  }
  function loadPlanetMaps() {
    const size = mapSize({ cssWidth: window.innerWidth });
    const [earth, jupiter, saturn] = [0, 1, 2].map(kind => BODIES.find(body => body.kind === kind));
    const ready = (body, maps) => { body.maps = { surface: blank, night: blank, clouds: blank, ring: blank, ...maps }; body.mapState = 'ready'; body.readyAt = performance.now(); request(); };
    const failed = (body, error) => { body.mapState = 'failed'; console.warn('Planet map unavailable; using the procedural surface.', error); request(); };
    Promise.all([loadMap('earthDay', size), loadMap('earthClouds', size)])
      .then(([surface, clouds]) => {
        ready(earth, { surface, clouds });
        loadMap('earthNight', size).then(night => { earth.maps.night = night; request(); }, () => {});
      }, error => failed(earth, error))
      .finally(() => {
        loadMap('jupiter', size).then(surface => ready(jupiter, { surface }), error => failed(jupiter, error));
        Promise.all([loadMap('saturn', size), loadMap('saturnRing', size)]).then(([surface, ring]) => ready(saturn, { surface, ring }), error => failed(saturn, error));
        // The later stops' art loads last: nobody reaches Orion or the arrival world in the first seconds.
        const arrival = BODIES.find(body => body.kind === 6);
        for (const body of BODIES.filter(b => b.sprite)) {
          loadMap(body.sprite, size).then(texture => { body.texture = texture; request(); }, error => console.warn(`Texture ${body.sprite} unavailable.`, error));
        }
        loadMap('arrival', size).then(surface => ready(arrival, { surface }), error => failed(arrival, error));
      });
  }
  // Fade a freshly mapped body in over 0.9s while motion plays; show it at once when motion is paused or reduced.
  const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const revealed = (body, now, playing) => (playing ? smooth((now - body.readyAt) / 900) : 1);

  let field, fieldLines, landmarks, fbo, fboTexture, galaxyStars;
  function makeGalaxy(cssWidth) {
    const data = galaxyParticles({ count: cssWidth <= 700 ? 7000 : 12000 });
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = GALAXY_STRIDE * 4;
    [[0, 3, 0], [1, 4, 12], [2, 2, 28]].forEach(([location, size, offset]) => { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset); gl.vertexAttribDivisor(location, 0); });
    gl.bindVertexArray(null);
    return { vao, count: data.length / GALAXY_STRIDE };
  }

  // Text blocks that get a shelter behind them. Plates (cards) are already dark enough to read on, so they are not listed.
  const shelterElements = [...document.querySelectorAll('.hero-topline, .hero-copy, .playground-controls, .hero-bottom, .section-heading, .project-story-text, .library-heading, .project-filters, .filter-status, .archive-grid, .approach-intro, .approach-steps, .about-heading, .about-copy, .experience-heading, .career-list, .education, .toolkit, .awards-intro, .award-list, .writing-intro, .article-list, .contact-layout, .footer-bottom')];
  let shelters = { data: new Float32Array(64), count: 0 };
  function applyShelter(prog) {
    gl.uniform4fv(prog.u['uShelter[0]'], shelters.data); gl.uniform1i(prog.u.uShelterCount, shelters.count); gl.uniform1f(prog.u.uFeather, 110 * ratio);
  }
  let width = 1, height = 1, ratio = 1, quality = 1, bgWidth = 1, bgHeight = 1;
  let anchors = WAYPOINTS.map(() => 0), maxScroll = 1;
  let camZ = 0, velocity = 0, drift = 0, intro = 150, time = 0, last = 0, frame = 0, roll = 0;
  const pointer = { x: 0 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const policy = () => journeyPolicy({ reduced: reduced.matches, playing: root.dataset.motion !== 'paused', hidden: document.hidden });

  function measureAnchors() {
    const offset = window.innerHeight * 0.45;
    anchors = WAYPOINTS.map(({ id }, index) => {
      if (index === 0) return 0;
      const element = document.getElementById(id);
      return element ? Math.max(0, element.getBoundingClientRect().top + window.scrollY - offset) : 0;
    });
    for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
    maxScroll = Math.max(anchors[anchors.length - 1] + 1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function resize() {
    const cssWidth = canvas.clientWidth || window.innerWidth, cssHeight = canvas.clientHeight || window.innerHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
    width = Math.max(1, Math.round(cssWidth * ratio)); height = Math.max(1, Math.round(cssHeight * ratio));
    canvas.width = width; canvas.height = height;
    bgWidth = Math.max(1, Math.round(width * 0.5)); bgHeight = Math.max(1, Math.round(height * 0.5));
    if (fboTexture) gl.deleteTexture(fboTexture);
    fboTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, fboTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bgWidth, bgHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!fbo) fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!field) {
      const count = Math.max(1800, Math.min(5000, Math.round(cssWidth * cssHeight / 380)));
      const data = starData(count);
      field = makeVao(data, false); fieldLines = makeVao(data, true); landmarks = makeVao(landmarkData(), false); galaxyStars = makeGalaxy(cssWidth);
    }
    measureAnchors();
  }

  // Flight readout: destination, true distance, and the section's own label as a caption.
  const hud = document.querySelector('.flight');
  const hudName = hud?.querySelector('.flight-name'), hudDistance = hud?.querySelector('.flight-distance'), hudCaption = hud?.querySelector('.flight-caption');
  const hudDots = hud ? [...hud.querySelectorAll('.flight-track li')] : [];
  const hudPause = hud?.querySelector('.flight-pause');
  const captions = WAYPOINTS.map(({ id }) => document.getElementById(id)?.querySelector('.small-heading')?.textContent.trim() || '');
  let hudIndex = -1;
  function updateHud(index) {
    if (!hud || index === hudIndex) return;
    hudIndex = index;
    hud.classList.remove('is-changing'); void hud.offsetWidth; hud.classList.add('is-changing');
    hudName.textContent = WAYPOINTS[index].name; hudDistance.textContent = WAYPOINTS[index].distance; hudCaption.textContent = captions[index];
    hudDots.forEach((dot, i) => { dot.classList.toggle('is-past', i < index); dot.classList.toggle('is-here', i === index); });
    root.dataset.waypoint = WAYPOINTS[index].id;
  }
  const heroMotion = document.getElementById('motion-toggle');
  function syncPause() {
    if (!hudPause || !heroMotion) return;
    hudPause.setAttribute('aria-label', heroMotion.textContent); hudPause.disabled = heroMotion.disabled;
  }
  hudPause?.addEventListener('click', () => heroMotion?.click());
  // On phones the pause button steps out of the way while the reader scrolls and returns once they stop.
  const phone = matchMedia('(max-width: 600px)');
  let tuck = 0;
  window.addEventListener('scroll', () => {
    if (!hud || !phone.matches) return;
    hud.classList.add('is-tucked');
    clearTimeout(tuck);
    tuck = setTimeout(() => hud.classList.remove('is-tucked'), 900);
  }, { passive: true });

  function drawStars(set, lines, camera, wrap, streak, focal) {
    gl.useProgram(stars.p);
    gl.uniform2f(stars.u.uRes, width, height); gl.uniform1f(stars.u.uCamZ, camera); gl.uniform1f(stars.u.uSpan, SPAN);
    gl.uniform1f(stars.u.uFocal, focal); gl.uniform1f(stars.u.uTime, time); gl.uniform1f(stars.u.uRoll, roll);
    gl.uniform1f(stars.u.uWrap, wrap); gl.uniform1f(stars.u.uStreak, streak); gl.uniform1f(stars.u.uLines, lines ? 1 : 0); applyShelter(stars);
    gl.bindVertexArray(set.vao);
    if (lines) gl.drawArraysInstanced(gl.LINES, 0, 2, set.count); else gl.drawArrays(gl.POINTS, 0, set.count);
  }

  let frameTimes = [];
  function render(now) {
    frame = 0;
    const state = policy();
    if (!state.render) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016; last = now;
    if (state.drift) { time += dt; drift += dt * 1.2; intro *= Math.exp(-dt * 2.2); drift += intro * dt; } else intro = 0;
    const target = state.travel ? cameraZ(anchors, window.scrollY, maxScroll) : 0;
    const previous = camZ;
    camZ += (target - camZ) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - camZ) < 0.01) camZ = target;
    const speed = Math.abs(camZ - previous) / Math.max(dt, 0.001) + (state.drift ? intro : 0);
    velocity += (speed - velocity) * (1 - Math.exp(-dt * 8));
    roll += ((state.drift ? Math.sin(time * 0.07) * 0.035 + pointer.x * 0.04 : 0) - roll) * (1 - Math.exp(-dt * 2));

    const cssHeight = height / ratio;
    const focal = cssHeight * 0.95 * ratio / (1 + Math.min(velocity, 300) * 0.0011);
    const travel = camZ + drift;
    const scene = sceneAt(camZ);
    shelters = shelterRects(shelterElements.map(element => element.getBoundingClientRect()), { ratio, viewportHeight: cssHeight, pad: 10, max: 16 });
    const core = Math.exp(-Math.pow(camZ / JOURNEY_STEP - 5.5, 2) * 1.6);

    // 1. Background into a half-resolution buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, bgWidth, bgHeight); gl.disable(gl.BLEND);
    gl.useProgram(background.p); gl.bindVertexArray(emptyVao);
    const u = background.u;
    gl.uniform2f(u.uRes, bgWidth, bgHeight); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uTravel, travel);
    gl.uniform1f(u.uNebula, scene.nebula); gl.uniform1f(u.uCore, core); gl.uniform1f(u.uRoll, roll);
    gl.uniform3fv(u.uPalA, scene.palette[0]); gl.uniform3fv(u.uPalB, scene.palette[1]); gl.uniform3fv(u.uPalC, scene.palette[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Upscale to the screen with vignette and grain
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height);
    gl.useProgram(blit.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTexture);
    gl.uniform1i(blit.u.uTex, 0); gl.uniform2f(blit.u.uRes, width, height); gl.uniform1f(blit.u.uTime, time); applyShelter(blit);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3. Stars, landmarks, and warp streaks, added as light
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    drawStars(field, false, travel, 1, 0, focal);
    drawStars(landmarks, false, camZ, 0, 0, focal);
    const streak = state.travel ? streakLength(velocity) : 0;
    if (streak > 0.02) drawStars(fieldLines, true, travel, 1, streak, focal);

    // 4. Landmarks, each drawn only inside its own bounding box
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(planet.p); gl.bindVertexArray(emptyVao);
    gl.uniform1f(planet.u.uTime, time); gl.uniform2f(planet.u.uRes, width, height); applyShelter(planet);
    let galaxyView = null;
    for (let unit = 1; unit < 4; unit++) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, blank); }
    const cssWidth = width / ratio, sizeFocal = Math.min(cssHeight, cssWidth * 0.8) * 0.95 * ratio;
    for (const body of BODIES) {
      if (body.mapState === 'loading') continue; // hidden until its real maps arrive, rather than flashing a stand-in
      if (body.sprite === 'orion' && !body.texture) continue;   // the core falls back to its procedural glow until then
      const mapped = body.mapState === 'ready';
      let cx, cy, radius, fade, reach;
      if (body.world) {
        const view = project(body, camZ, focal);
        if (!view) continue;
        radius = body.radius * view.scale; fade = 1; reach = radius * 1.25;
        cx = width / 2 + (Math.cos(roll) * view.x - Math.sin(roll) * view.y); cy = height / 2 + (Math.sin(roll) * view.x + Math.cos(roll) * view.y);
      } else if (body.horizon) {
        const rise = Math.min(1, Math.max(0, (camZ - 690) / 110));
        fade = Math.min(1, Math.max(0, (camZ - 690) / 30));
        const eased = rise * rise * (3 - 2 * rise);
        if (mapped) {
          // With its map, the new world rises as a lit globe under the closing column rather than a faint distant rim.
          radius = Math.max(width, height) * 0.82; reach = radius * 1.26;   // room for the whole haze falloff
          cx = width * (width < height ? 0.5 : 0.34); cy = -radius + eased * height * 0.3;
        } else {
          radius = Math.max(width, height) * 1.5; reach = radius * 1.1;
          cx = width / 2; cy = -radius + eased * height * 0.13;
        }
      } else {
        const rel = body.z - camZ;
        const pass = flyby({ rel, anchor: body.anchor, slide: body.slide });
        fade = pass.fade;
        if (fade <= 0.001) continue;
        radius = Math.min(body.radius * sizeFocal / Math.max(rel, 1), body.max * height);
        cx = width / 2 + pass.x * width; cy = height / 2 + pass.y * height; reach = radius * body.reach;
      }
      if (mapped) fade *= revealed(body, now, state.drift);
      if (fade <= 0.001 || radius < 1.5) continue;
      const x0 = Math.max(0, Math.floor(cx - reach)), y0 = Math.max(0, Math.floor(cy - reach));
      const x1 = Math.min(width, Math.ceil(cx + reach)), y1 = Math.min(height, Math.ceil(cy + reach));
      if (x1 <= x0 || y1 <= y0) continue;
      gl.scissor(x0, y0, x1 - x0, y1 - y0);
      gl.uniform4f(planet.u.uBody, cx, cy, radius, body.kind);
      gl.uniform1f(planet.u.uFade, fade); gl.uniform1f(planet.u.uDim, body.dim);
      gl.uniform3fv(planet.u.uColA, body.a); gl.uniform3fv(planet.u.uColB, body.b); gl.uniform3fv(planet.u.uColC, body.c);
      gl.uniform3fv(planet.u.uLight, mapped ? body.view.sun : body.light);
      const sprite = body.sprite && body.texture;
      gl.uniform1f(planet.u.uMapped, mapped ? 1 : 0); gl.uniform1f(planet.u.uSprite, sprite ? 1 : 0);
      if (sprite) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, body.texture); }
      if (mapped) {
        const { view, maps } = body;
        gl.uniformMatrix3fv(planet.u.uRot, false, body.rotation); gl.uniform3fv(planet.u.uPole, body.pole);
        gl.uniform1f(planet.u.uSpin, time * view.spin); gl.uniform1f(planet.u.uCloudSpin, time * (view.cloudSpin || 0));
        gl.uniform1f(planet.u.uExposure, view.exposure);
        [maps.surface, maps.night, maps.clouds, maps.ring].forEach((texture, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); });
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (body.kind === 4) galaxyView = { cx, cy, radius, fade };
    }
    gl.disable(gl.SCISSOR_TEST);

    // 5. Andromeda's stars, added as light over its glow
    if (galaxyView && galaxyStars) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(galaxy.p); gl.bindVertexArray(galaxyStars.vao); applyShelter(galaxy);
      gl.uniform2f(galaxy.u.uRes, width, height); gl.uniform3f(galaxy.u.uCenter, galaxyView.cx, galaxyView.cy, galaxyView.radius);
      gl.uniform1f(galaxy.u.uSpin, time * 0.04); gl.uniform1f(galaxy.u.uFade, galaxyView.fade);
      gl.uniform1f(galaxy.u.uPix, ratio * Math.min(1.3, Math.max(0.8, galaxyView.radius / (420 * ratio))));
      gl.drawArrays(gl.POINTS, 0, galaxyStars.count);
    }

    updateHud(waypointAt(camZ).index);

    // Keep weaker GPUs smooth: step resolution down if frames run long.
    if (state.drift) {
      frameTimes.push(dt);
      if (frameTimes.length >= 90) {
        const average = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length; frameTimes = [];
        if (average > 0.024 && quality > 0.55) { quality -= 0.15; resize(); }
      }
    }
    const settling = Math.abs(target - camZ) > 0.01 || velocity > 0.05 || Math.abs(roll) > 0.0005;
    if (state.drift || settling) frame = requestAnimationFrame(render); else last = 0;
  }

  const request = () => { if (!frame) frame = requestAnimationFrame(render); };
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); request(); }, 120); }, { passive: true });
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('pointermove', event => { pointer.x = event.clientX / window.innerWidth - 0.5; }, { passive: true });
  document.addEventListener('visibilitychange', request);
  reduced.addEventListener('change', request);
  new MutationObserver(() => { syncPause(); request(); }).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  new ResizeObserver(() => { measureAnchors(); request(); }).observe(document.body);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; fail(new Error('WebGL context lost')); });

  resize(); syncPause(); request(); loadPlanetMaps();
}
