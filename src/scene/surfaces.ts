// Procedural surface descriptions baked by core/bake.ts. Each body defines
// height(), albedo() (linear RGB) and rough() over uv 0..1.

/** Walnut desk top, lacquered, with worn smudges and an old mug ring. 1.6 x 0.85 m. */
export const WALNUT = /* glsl */ `
  const vec2 SIZE = vec2(1.6, 0.85);
  float pores(vec2 m) {
    float n = gnoise(m * vec2(9.0, 230.0), vec2(1e4));
    float n2 = gnoise(m * vec2(4.0, 110.0) + 17.0, vec2(1e4));
    return smoothstep(0.28, 0.55, n) * 0.7 + smoothstep(0.35, 0.6, n2) * 0.5;
  }
  // Glued-up top of four flat-sawn boards. Each board is a slice through a
  // log whose axis wanders slightly in depth, which draws the arched
  // "cathedral" figure; latewood lines are thin and dark.
  const float BOARD = 0.2125;
  float board(vec2 m) { return floor(m.y / BOARD); }
  float ringField(vec2 m) {
    float b = board(m);
    float ly = fract(m.y / BOARD) * BOARD;
    float h = hash12(vec2(b, 3.1));
    float center = 0.04 + h * 0.13;
    float warp = fbm(m * vec2(1.4, 11.0) + b * 7.0, vec2(1e4), 4) * 0.01;
    float depth = 0.012 + 0.07 * (0.5 + 0.5 * gnoise(vec2(m.x * 0.8 + b * 3.7, b * 1.3), vec2(1e4)));
    float rr = length(vec2(ly - center + warp, depth));
    return rr * 190.0 + fbm(m * vec2(2.0, 40.0) + b, vec2(1e4), 3) * 0.6;
  }
  float seam(vec2 m) {
    float f = fract(m.y / BOARD) * BOARD;
    float e = min(f, BOARD - f);
    return 1.0 - smoothstep(0.0002, 0.0009, e);
  }
  float mugRing(vec2 m) {
    float d = abs(length(m - vec2(1.285, 0.345)) - 0.041);
    float broken = smoothstep(-0.2, 0.3, gnoise(m * 60.0, vec2(1e4)));
    return exp(-d * d / 0.0000035) * broken;
  }
  float height(vec2 uv) {
    vec2 m = uv * SIZE;
    float r = fract(ringField(m));
    return -pores(m) * 0.55 + smoothstep(0.6, 0.95, r) * 0.12 + fbm(m * 40.0, vec2(1e4), 3) * 0.05 - seam(m) * 1.5;
  }
  vec3 albedo(vec2 uv) {
    vec2 m = uv * SIZE;
    float r = fract(ringField(m));
    float late = smoothstep(0.72, 0.9, r) * (1.0 - smoothstep(0.93, 1.0, r));
    float b = board(m);
    float hb = hash12(vec2(b, 9.7));
    vec3 early = mix(vec3(0.075, 0.041, 0.022), vec3(0.105, 0.060, 0.032), hb);
    vec3 lateC = vec3(0.022, 0.011, 0.0065);
    vec3 c = mix(early, lateC, late * 0.85);
    // figure / chatoyance streaks and slow tonal drift
    float figure = fbm(m * vec2(1.5, 26.0) + b * 5.0, vec2(1e4), 4) * 0.5 + 0.5;
    c *= 0.75 + 0.5 * figure;
    c *= 0.85 + 0.3 * (fbm(m * vec2(0.5, 2.0) + 9.0, vec2(1e4), 3) * 0.5 + 0.5);
    c *= 1.0 - pores(m) * 0.45;
    c *= 1.0 - seam(m) * 0.7;
    c = mix(c, c * vec3(0.55, 0.5, 0.45), mugRing(m) * 0.6);
    return c;
  }
  float rough(vec2 uv) {
    vec2 m = uv * SIZE;
    float smudge = fbm(m * 2.2 + 4.0, vec2(1e4), 5) * 0.5 + 0.5;
    float wipes = fbm(vec2(m.x * 1.2 + m.y * 3.0, m.y * 18.0), vec2(1e4), 3) * 0.5 + 0.5;
    float r = 0.11 + smoothstep(0.45, 0.85, smudge) * 0.22 + wipes * 0.05;
    r += pores(m) * 0.25;
    // hands rest at the front edge: worn, satin
    r += smoothstep(0.62, 0.9, uv.y < 0.5 ? 1.0 - uv.y * 2.0 : 0.0) * 0.12;
    r += mugRing(m) * 0.25;
    return r;
  }
`

/** Aged ABS plastic, orange-peel texture. Tile ~8 cm. Albedo is a near-white multiplier. */
export const PLASTIC = /* glsl */ `
  float height(vec2 uv) {
    float peel = fbm(uv * 24.0, vec2(24.0), 3);
    float c = cell(uv * 40.0, vec2(40.0));
    return peel * 0.6 + c * 0.35;
  }
  vec3 albedo(vec2 uv) {
    float m = fbm(uv * 4.0 + 2.0, vec2(4.0), 4) * 0.5 + 0.5;
    float speck = step(0.93, hash12(floor(uv * 512.0)));
    return vec3(1.0, 0.985, 0.955) * (0.9 + 0.12 * m) - speck * 0.05;
  }
  float rough(vec2 uv) {
    return 0.42 + fbm(uv * 8.0 + 7.0, vec2(8.0), 4) * 0.12 + height(uv) * 0.05;
  }
`

/** Hand-trowelled plaster, deep blue-grey. Tile ~1.2 m. */
export const PLASTER = /* glsl */ `
  float height(vec2 uv) {
    float trowel = fbm(uv * vec2(3.0, 5.0), vec2(3.0, 5.0), 5);
    float grit = fbm(uv * 90.0, vec2(90.0), 2);
    return trowel * 0.9 + grit * 0.18;
  }
  vec3 albedo(vec2 uv) {
    float t = fbm(uv * 2.0 + 5.0, vec2(2.0), 5) * 0.5 + 0.5;
    float stain = smoothstep(0.55, 0.85, fbm(uv * vec2(1.0, 3.0) + 11.0, vec2(1.0, 3.0), 4) * 0.5 + 0.5);
    vec3 c = mix(vec3(0.030, 0.034, 0.042), vec3(0.052, 0.056, 0.066), t);
    return c * (1.0 - stain * 0.3);
  }
  float rough(vec2 uv) { return 0.78 + fbm(uv * 6.0, vec2(6.0), 3) * 0.12; }
`

/** Brushed aluminium (floppy shutters, lamp fittings). */
export const BRUSHED = /* glsl */ `
  float streak(vec2 uv) { return fbm(vec2(uv.x * 2.0, uv.y * 300.0), vec2(2.0, 300.0), 3); }
  float height(vec2 uv) { return streak(uv) * 0.3; }
  vec3 albedo(vec2 uv) { return vec3(0.85 + streak(uv) * 0.12); }
  float rough(vec2 uv) { return 0.28 + streak(uv) * 0.15; }
`

/** Powder-coated enamel for the lamp shade. */
export const ENAMEL = /* glsl */ `
  float height(vec2 uv) { return fbm(uv * 30.0, vec2(30.0), 3) * 0.5; }
  vec3 albedo(vec2 uv) { return vec3(0.95 + fbm(uv * 3.0, vec2(3.0), 3) * 0.08); }
  float rough(vec2 uv) { return 0.36 + fbm(uv * 10.0 + 3.0, vec2(10.0), 3) * 0.1; }
`
