/**
 * The CRT picture model, shared by the 3D screen and the PNG exporter.
 *
 *  - barrel-distorted raster inside a rounded black border
 *  - Gaussian electron-beam scanlines whose width grows with brightness
 *    (bright lines bloom into each other, dark lines stay thin)
 *  - aperture-grille phosphor stripes
 *  - halation (light scattering in the thick glass) from the texture's mip chain
 *  - convergence error, line jitter, a slow rolling hum bar, flicker, grain
 *  - power-on: a dot, a line, then the raster unrolls; power-off collapses
 *
 * Scanline and mask detail are faded by their screen-space frequency
 * (fwidth), so a distant or small screen never shimmers with moire.
 * Output is linear HDR: whites go above 1.0 and feed the bloom pass.
 */
export const CRT_UNIFORMS = () => ({
  tScreen: { value: null as unknown },
  uTime: { value: 0 },
  uPower: { value: 0 },
  uBrightness: { value: 1.8 },
  uLines: { value: 384 },
  uInset: { value: 0.94 },
  uCurve: { value: 0.07 },
  uJitter: { value: 1 },
})

export const CRT_GLSL = /* glsl */ `
  uniform sampler2D tScreen;
  uniform float uTime;
  uniform float uPower;
  uniform float uBrightness;
  uniform float uLines;
  uniform float uInset;
  uniform float uCurve;
  uniform float uJitter;

  float crtHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 crtBarrel(vec2 uv, float k) {
    vec2 c = uv - 0.5;
    return 0.5 + c * (1.0 + k * dot(c, c) * 4.0) / (1.0 + k);
  }

  float crtRoundRect(vec2 p, vec2 halfSize, float r, float soft) {
    vec2 d = abs(p) - halfSize + r;
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    return 1.0 - smoothstep(-soft, soft, dist);
  }

  // Returns linear HDR radiance for the glass at uv (0..1).
  vec3 crtColor(vec2 uv) {
    vec2 p = (uv - 0.5) / uInset + 0.5;
    p = crtBarrel(p, uCurve);
    float mask = crtRoundRect(p - 0.5, vec2(0.5), 0.035, 0.004);

    // Power sequence: 0..0.15 dot, ..0.45 horizontal line, ..1 vertical unroll.
    float pw = clamp(uPower, 0.0, 1.0);
    vec2 q = p - 0.5;
    float beam = 0.0;
    float open = 1.0;
    if (pw < 1.0) {
      float w = smoothstep(0.04, 0.4, pw) * 0.5 + 0.002;
      float h = mix(0.0015, 0.5, smoothstep(0.38, 0.95, pw));
      float inX = 1.0 - smoothstep(w - 0.01, w + 0.01, abs(q.x));
      float dotGlow = exp(-length(q * vec2(1.0, 1.0)) * 90.0) * smoothstep(0.0, 0.08, pw) * (1.0 - smoothstep(0.08, 0.3, pw));
      beam = inX * exp(-abs(q.y) / max(h, 0.0015) * 3.0) * (1.0 - smoothstep(0.6, 1.0, pw)) * 3.0 + dotGlow * 40.0;
      open = step(abs(q.y), h);
      p.y = 0.5 + q.y * 0.5 / max(h, 0.0015);
      p.x = 0.5 + q.x * 0.5 / max(w, 0.05);
    }

    // Line jitter + rolling hum bar (a slow beat between mains and refresh).
    float line = floor(p.y * uLines);
    p.x += (crtHash(vec2(line, floor(uTime * 30.0))) - 0.5) * 0.0007 * uJitter;
    float roll = fract(p.y * 0.8 - uTime * 0.07);
    float hum = 1.0 - 0.045 * uJitter * smoothstep(0.0, 0.25, roll) * (1.0 - smoothstep(0.25, 0.6, roll));

    // Convergence error: red and blue guns land slightly off near the edges.
    vec2 conv = (p - 0.5) * vec2(0.0024, 0.0008);
    vec3 col;
    col.r = texture2D(tScreen, p + conv).r;
    col.g = texture2D(tScreen, p).g;
    col.b = texture2D(tScreen, p - conv).b;

    // Halation from blurry mips.
    vec3 halo = textureLod(tScreen, p, 3.5).rgb * 0.6 + textureLod(tScreen, p, 5.5).rgb * 0.4;

    // Gaussian beam scanlines; the beam fattens on bright content.
    float lineCoord = p.y * uLines;
    float lineAA = clamp(1.4 - fwidth(lineCoord) * 1.6, 0.0, 1.0);
    float f = fract(lineCoord) - 0.5;
    vec3 sigma = mix(vec3(0.16), vec3(0.42), sqrt(clamp(col, 0.0, 1.0)));
    vec3 profile = exp(-(f * f) / (2.0 * sigma * sigma));
    vec3 norm = sigma * 2.5066; // integral of the Gaussian over one line
    vec3 scan = profile / max(norm, 0.4);
    col *= mix(vec3(1.0), scan, lineAA);

    // Aperture grille: vertical RGB phosphor stripes.
    float gx = p.x * uLines * 4.0 / 3.0 * 3.0;
    float gridAA = clamp(1.2 - fwidth(gx) * 1.2, 0.0, 1.0);
    float ph = fract(gx);
    vec3 grille = vec3(
      smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.28, 0.38, ph)),
      smoothstep(0.33, 0.43, ph) * (1.0 - smoothstep(0.61, 0.71, ph)),
      smoothstep(0.66, 0.76, ph) * (1.0 - smoothstep(0.94, 1.0, ph))
    );
    col *= mix(vec3(1.0), grille * 2.4 + 0.18, 0.55 * gridAA);

    col += halo * halo * 0.35 + halo * 0.05;
    col *= hum;

    // Corner falloff of the beam and a touch of phosphor warmth.
    vec2 v = p - 0.5;
    col *= 1.0 - dot(v, v) * 1.1;
    col *= vec3(1.0, 0.985, 0.95);

    // Flicker + grain.
    col *= 1.0 - 0.015 * uJitter * sin(uTime * 61.0) * sin(uTime * 3.7);
    col += (crtHash(uv * 997.0 + fract(uTime * 13.0)) - 0.5) * 0.018 * uJitter;

    col = max(col, 0.0) * uBrightness * open * smoothstep(0.35, 0.7, pw + 0.3 * step(1.0, pw));
    col += vec3(0.75, 0.9, 1.0) * beam;

    // Unlit phosphor coating: dark slate-green glass.
    vec3 glass = vec3(0.010, 0.012, 0.011);
    return glass + col * mask;
  }
`
