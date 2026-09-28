// Photoreal bodies for the hero: one WebGL2 pass per body, drawn inside its own scissor box.
// A swarm condenses into a grey protoplanet that flushes with accretion heat, then settles as a real planet: Mercury,
// Venus, Earth, Mars, Jupiter, Saturn, innermost first. Earth, Jupiter and Saturn wear the site's Solar System Scope maps
// (CC BY 4.0, credited in the footer); Mercury, Venus and Mars are generated. Light comes only from the ember or the star,
// because space has no fill light. Returns null without WebGL2, and the caller falls back to vector bodies.
import { mapURL, mapSize } from '../planets.mjs?v=6';

const VERTEX = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uCenter; uniform float uRadius;           // device px, GL origin bottom-left
uniform vec3 uLight; uniform vec3 uLightColor;          // light direction in view space (x right, y up, z toward viewer)
uniform float uMorph, uPlanet, uSpin, uTime, uAlpha, uHeat;
uniform vec2 uPlane;                                    // orbital plane: x = ratio (cos of inclination), y = roll
uniform sampler2D uEarth, uClouds, uJupiter, uSaturn, uRing;
uniform vec4 uHave;                                     // earth, jupiter, saturn, ring maps loaded
out vec4 outColor;
const float PI = 3.14159265;

float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
float fbmLow(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * noise3(p); p = p * 2.1 + vec3(3.3, 1.1, 7.7); a *= 0.5; } return v / 0.875; }
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
// Crater bowls with raised rims, scattered over the sphere (Mercury).
float craters(vec3 p, float seed){
  float h = 0.0;
  for (int k = 0; k < 7; k++){
    float fk = float(k) + seed * 7.13;
    vec3 c = normalize(vec3(hash3(vec3(fk, 1.3, 2.1)) - 0.5, hash3(vec3(2.7, fk, 5.3)) - 0.5, hash3(vec3(4.1, 6.2, fk)) - 0.5));
    float r = 0.16 + 0.24 * hash3(vec3(fk, fk, 3.3));
    float x = acos(clamp(dot(p, c), -1.0, 1.0)) / r;
    h += (x < 1.0 ? -0.5 * (1.0 - x * x) : 0.0) + 0.22 * exp(-pow((x - 1.0) * 4.0, 2.0));
  }
  return h;
}
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 equirect(sampler2D m, vec3 p){ float lon = atan(p.x, p.z), lat = asin(clamp(p.y, -1.0, 1.0)); return texture(m, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI)).rgb; }
vec3 tone(vec3 c){ c = 1.0 - exp(-c * 1.3); return pow(c, vec3(1.0 / 2.2)); }

// Saturn's rings in the orbital plane; returns premultiplied colour. front = the half nearer the viewer.
vec4 rings(vec2 d, bool front){
  float c = cos(-uPlane.y), s = sin(-uPlane.y);
  vec2 r = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  if ((r.y < 0.0) != front) return vec4(0.0);
  float rr = length(vec2(r.x, r.y / max(uPlane.x, 0.08)));
  float u = (rr - 1.24) / 1.06;
  if (u < 0.0 || u > 1.0) return vec4(0.0);
  vec4 t = uHave.w > 0.5 ? texture(uRing, vec2(u, 0.5)) : vec4(vec3(0.8, 0.72, 0.55), 0.6 * (0.6 + 0.4 * sin(u * 60.0)));
  float a = t.a * smoothstep(0.02, 0.4, uMorph) * 0.95;
  vec3 col = tone(lin(t.rgb) * uLightColor * 1.25);
  return vec4(col * a, a);
}

void main(){
  vec2 d = (gl_FragCoord.xy - uCenter) / uRadius;
  float rho = length(d);
  float aa = 1.5 / uRadius, inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rho);

  // The star (or the ember before it ignites): an emissive disc with limb darkening.
  if (uPlanet < -0.5){
    float mu = sqrt(max(1.0 - rho * rho, 0.0));
    vec3 hot = mix(vec3(1.0, 0.32, 0.12), vec3(1.0, 0.93, 0.8), uHeat);
    vec3 col = hot * (0.35 + 2.2 * uHeat) * mix(0.55, 1.0, pow(mu, 0.45));
    outColor = vec4(tone(col) * inside, inside) * uAlpha;
    return;
  }

  bool saturn = uPlanet > 4.5;
  vec4 back = saturn ? rings(d, false) : vec4(0.0), front = saturn ? rings(d, true) : vec4(0.0);
  vec4 body = vec4(0.0);
  if (inside > 0.0){
    vec3 n = normalize(vec3(d, sqrt(max(1.0 - dot(d, d), 0.0))));
    vec3 p = rotY(n, uSpin);
    vec3 L = normalize(uLight);
    float m = smoothstep(0.0, 1.0, uMorph);

    // A young protoplanet: grey rock with fbm relief, turned into a bumped normal with screen-space derivatives.
    float h = fbm3((p * 2.2 + (0.2 + uPlanet * 1.37) * 13.0) * 1.6) * 0.6 + craters(p, 0.2 + uPlanet * 1.37) * 0.45;
    vec2 g = vec2(dFdx(h), dFdy(h)) * uRadius;
    vec3 nb = normalize(n - vec3(g * 0.2, 0.0));
    vec3 rock = vec3(0.28, 0.26, 0.24);

    // Planets, innermost to outermost.
    vec3 surface; float atmo = 0.0; vec3 air = vec3(0.0); float giant = 0.0; float lat = p.y;
    if (uPlanet < 0.5){
      surface = mix(vec3(0.26, 0.24, 0.22), vec3(0.47, 0.44, 0.40), fbm3(p * 3.0 + 2.0)) * (1.0 + 0.4 * craters(p, 3.7));
    } else if (uPlanet < 1.5){
      surface = mix(vec3(0.78, 0.64, 0.40), vec3(0.93, 0.83, 0.60), fbm3(vec3(p.x * 1.5, p.y * 7.0, p.z * 1.5) + 4.0)); atmo = 0.9; air = vec3(1.0, 0.88, 0.62);
    } else if (uPlanet < 2.5){
      surface = uHave.x > 0.5 ? lin(equirect(uEarth, p)) : mix(vec3(0.02, 0.07, 0.2), vec3(0.18, 0.26, 0.1), step(0.55, fbm3(p * 2.0)));
      float cloud = uHave.x > 0.5 ? equirect(uClouds, rotY(p, uTime * 0.004)).r : smoothstep(0.55, 0.8, fbm3(p * 3.0));
      surface = mix(surface, vec3(0.86), cloud * 0.9); atmo = 0.6; air = vec3(0.32, 0.58, 1.0);
    } else if (uPlanet < 3.5){
      surface = mix(vec3(0.55, 0.23, 0.1), vec3(0.28, 0.14, 0.08), smoothstep(0.45, 0.7, fbm3(p * 2.4 + 8.0)));
      surface = mix(surface, vec3(0.9, 0.88, 0.85), smoothstep(0.86, 0.93, abs(lat))); atmo = 0.15; air = vec3(1.0, 0.6, 0.4);
    } else if (uPlanet < 4.5){
      surface = uHave.y > 0.5 ? lin(equirect(uJupiter, p)) : mix(vec3(0.72, 0.6, 0.45), vec3(0.5, 0.36, 0.26), 0.5 + 0.5 * sin(lat * 25.0)); giant = 1.0;
    } else {
      surface = uHave.z > 0.5 ? lin(equirect(uSaturn, p)) : mix(vec3(0.84, 0.75, 0.54), vec3(0.68, 0.58, 0.4), 0.5 + 0.5 * sin(lat * 20.0)); giant = 1.0;
    }

    vec3 albedo = mix(rock, surface, m);
    vec3 nn = normalize(mix(nb, n, m * (uPlanet < 0.5 ? 0.6 : 1.0)));
    float ndl = dot(nn, L);
    float diffuse = max(ndl, 0.0);
    diffuse = mix(diffuse, smoothstep(-0.14, 0.4, ndl) * max(ndl + 0.14, 0.0) / 1.14, atmo * m);   // atmospheres soften the terminator
    vec3 col = albedo * diffuse * uLightColor * 2.3;
    col *= mix(1.0, mix(0.55, 1.0, pow(n.z, 0.35)), giant * m);                                        // gas giant limb darkening
    float rim = pow(1.0 - n.z, 3.0) * atmo * m;
    col += air * rim * max(dot(normalize(vec3(d, 0.3)), L) + 0.25, 0.0) * uLightColor * 0.7;
    // Accretion heat: as it forms, the body flushes and glows along fissures, then cools.
    float heat = sin(PI * clamp(uMorph, 0.0, 1.0)) * 0.9;
    float vein = 1.0 - smoothstep(0.0, 0.03, abs(fbmLow(p * 1.6 + (0.2 + uPlanet * 1.37) * 4.0) - 0.5));
    col += vec3(1.0, 0.34, 0.08) * vein * heat * 1.15 + vec3(1.0, 0.42, 0.16) * heat * 0.025;
    body = vec4(tone(col) * inside, inside);
  }
  vec4 result = body + back * (1.0 - body.a);
  result = front + result * (1.0 - front.a);
  outColor = result * uAlpha;
}`;

export function createBodyRenderer(canvas, { onReady } = {}) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.warn('Hero: realistic bodies unavailable, using the vector fallback.', error);
    return null;
  }
  const u = {};
  for (let i = 0, count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i < count; i++) {
    const { name } = gl.getActiveUniform(program, i);
    u[name] = gl.getUniformLocation(program, name);
  }
  const vao = gl.createVertexArray();
  gl.useProgram(program);
  const UNITS = { uEarth: 0, uClouds: 1, uJupiter: 2, uSaturn: 3, uRing: 4 };
  Object.entries(UNITS).forEach(([name, unit]) => gl.uniform1i(u[name], unit));
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  const textures = { uEarth: blank, uClouds: blank, uJupiter: blank, uSaturn: blank, uRing: blank };
  const have = [0, 0, 0, 0];
  // The same map size the flight behind the page uses, so each file downloads once and both read it from the cache.
  const size = mapSize({ cssWidth: window.innerWidth });
  async function load(name, key, slot) {
    const image = new Image();
    image.src = mapURL(key, size);
    await image.decode();
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, key === 'saturnRing' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textures[name] = texture;
    if (slot >= 0) have[slot] = 1;
    onReady?.();
  }
  Promise.all([load('uEarth', 'earthDay', -1), load('uClouds', 'earthClouds', -1)]).then(() => { have[0] = 1; onReady?.(); }, () => {});
  load('uJupiter', 'jupiter', 1).catch(() => {});
  load('uSaturn', 'saturn', 2).catch(() => {});
  load('uRing', 'saturnRing', 3).catch(() => {});

  return {
    // items: { star, x, y, r, heat } or { x, y, r, morph, planet, spin, light:[x,y,z], lightColor:[r,g,b] }, in draw order.
    // Coordinates are in the plate's units; `scale` converts to device px; the plate is `plateHeight` units tall.
    draw({ items, scale, plateHeight, time, plane }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.SCISSOR_TEST);
      gl.useProgram(program); gl.bindVertexArray(vao);
      Object.entries(UNITS).forEach(([name, unit]) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[name]); });
      gl.uniform4f(u.uHave, have[0], have[1], have[2], have[3]);
      gl.uniform1f(u.uTime, time); gl.uniform2f(u.uPlane, plane.ratio, plane.roll);
      for (const item of items) {
        const r = item.r * scale;
        if (r < 0.6 || item.alpha <= 0.001) continue;
        const cx = item.x * scale, cy = (plateHeight - item.y) * scale;
        const reach = r * (item.planet === 5 && item.morph > 0.01 ? 2.45 : 1.35) + 2;
        const x0 = Math.max(0, Math.floor(cx - reach)), y0 = Math.max(0, Math.floor(cy - reach));
        const x1 = Math.min(canvas.width, Math.ceil(cx + reach)), y1 = Math.min(canvas.height, Math.ceil(cy + reach));
        if (x1 <= x0 || y1 <= y0) continue;
        gl.scissor(x0, y0, x1 - x0, y1 - y0);
        gl.uniform2f(u.uCenter, cx, cy); gl.uniform1f(u.uRadius, r); gl.uniform1f(u.uAlpha, item.alpha ?? 1);
        if (item.star) {
          gl.uniform1f(u.uPlanet, -1); gl.uniform1f(u.uHeat, item.heat);
        } else {
          gl.uniform1f(u.uPlanet, item.planet); gl.uniform1f(u.uMorph, item.morph); gl.uniform1f(u.uSpin, item.spin);
          gl.uniform3fv(u.uLight, item.light); gl.uniform3fv(u.uLightColor, item.lightColor);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    },
  };
}
