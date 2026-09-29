/**
 * CRT screen shader — tuned for quality *and* speed.
 *
 * Everything here is single-pass so the screen costs one draw call: barrel
 * curvature, rounded-corner mask, aperture-grille phosphor triads, soft
 * scanlines, an 8-tap halation glow, chromatic aberration, rolling
 * interference, film grain, flicker, vignette and a power-on collapse/expand.
 * Multi-pass bloom (postprocessing) was deliberately avoided to protect the
 * frame budget; `glowIntensity` = 0 skips the glow taps entirely (low tier).
 */
export const CRT_CURVATURE = 0.16

const CRTEffectShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    curvature: { value: CRT_CURVATURE },
    power: { value: 1.0 },
    scanlineIntensity: { value: 0.22 },
    scanlineCount: { value: 340.0 },
    maskIntensity: { value: 0.14 },
    aberration: { value: 0.0014 },
    brightness: { value: 1.18 },
    vignetteStrength: { value: 0.9 },
    noiseIntensity: { value: 0.035 },
    flickerIntensity: { value: 0.02 },
    interferenceIntensity: { value: 0.35 },
    glowIntensity: { value: 0.55 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float curvature;
    uniform float power;
    uniform float scanlineIntensity;
    uniform float scanlineCount;
    uniform float maskIntensity;
    uniform float aberration;
    uniform float brightness;
    uniform float vignetteStrength;
    uniform float noiseIntensity;
    uniform float flickerIntensity;
    uniform float interferenceIntensity;
    uniform float glowIntensity;
    varying vec2 vUv;

    // Barrel distortion for CRT glass curvature
    vec2 curveUv(vec2 uv, float amt) {
      vec2 cc = uv - 0.5;
      float dist = dot(cc, cc);
      return uv + cc * dist * amt;
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Rounded-rectangle mask with a soft edge, in curved space
    float screenMask(vec2 uv) {
      vec2 d = abs(uv - 0.5) - vec2(0.5) + 0.012;
      float outside = length(max(d, 0.0));
      return 1.0 - smoothstep(0.0, 0.012, outside);
    }

    void main() {
      vec2 uv = curveUv(vUv, curvature);
      float mask = screenMask(uv);
      if (mask <= 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // Power-on: a bright line blooms out horizontally, then the picture
      // unrolls vertically from it (classic tube warm-up).
      float pw = clamp(power, 0.0, 1.0);
      float lineGlow = 0.0;
      if (pw < 1.0) {
        float hw = smoothstep(0.0, 0.25, pw);
        float vh = mix(0.008, 1.0, smoothstep(0.22, 0.92, pw));
        vec2 q = uv - 0.5;
        float inX = 1.0 - smoothstep(hw * 0.5 - 0.02, hw * 0.5 + 0.02, abs(q.x));
        lineGlow = inX * exp(-abs(q.y) * mix(220.0, 30.0, pw)) * (1.0 - smoothstep(0.55, 0.95, pw));
        if (abs(q.y) > vh * 0.5) {
          gl_FragColor = vec4(vec3(0.55, 0.95, 1.0) * lineGlow * 1.4 * mask, 1.0);
          return;
        }
        uv.y = 0.5 + q.y / vh;
        uv.x = 0.5 + q.x / max(hw, 0.05);
      }

      // Subtle horizontal jitter + occasional rolling interference band
      float band = sin(uv.y * 12.0 - time * 2.2);
      float interference = smoothstep(0.985, 1.0, band) * interferenceIntensity;
      uv.x += interference * 0.004 * sin(time * 60.0 + uv.y * 90.0);
      uv.x += (hash(vec2(time * 7.0, uv.y * 300.0)) - 0.5) * 0.0006;

      // Chromatic aberration, stronger toward the edges
      vec2 cc = uv - 0.5;
      float edge = dot(cc, cc);
      vec2 shift = normalize(cc + 1e-6) * aberration * (0.4 + edge * 4.0);
      float r = texture2D(tDiffuse, uv + shift).r;
      vec4 base = texture2D(tDiffuse, uv);
      float b = texture2D(tDiffuse, uv - shift).b;
      vec3 color = vec3(r, base.g, b);

      // Halation: two rings of taps (near + wide) soften highlights like
      // phosphor bloom. Skipped entirely when glowIntensity is 0.
      if (glowIntensity > 0.0) {
        vec2 gs = vec2(0.0035, 0.0045);
        vec3 near = texture2D(tDiffuse, uv + vec2(gs.x, 0.0)).rgb
                  + texture2D(tDiffuse, uv - vec2(gs.x, 0.0)).rgb
                  + texture2D(tDiffuse, uv + vec2(0.0, gs.y)).rgb
                  + texture2D(tDiffuse, uv - vec2(0.0, gs.y)).rgb;
        vec3 wide = texture2D(tDiffuse, uv + gs * vec2(2.4, 2.4)).rgb
                  + texture2D(tDiffuse, uv + gs * vec2(-2.4, 2.4)).rgb
                  + texture2D(tDiffuse, uv + gs * vec2(2.4, -2.4)).rgb
                  + texture2D(tDiffuse, uv - gs * vec2(2.4, 2.4)).rgb;
        vec3 glow = near * 0.16 + wide * 0.09;
        color += glow * glow * glowIntensity * 0.9 + glow * glowIntensity * 0.08;
      }

      // Soft scanlines — sine profile, intensity dips on bright pixels so
      // highlights read as blooming over the lines
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      float scan = sin(uv.y * scanlineCount * 3.14159265);
      scan = scan * scan;
      color *= 1.0 - scanlineIntensity * scan * (1.0 - luma * 0.5);

      // Aperture grille — vertical RGB phosphor triads
      float px = uv.x * scanlineCount * 2.4;
      vec3 grille = vec3(
        0.5 + 0.5 * sin(px * 6.28318 + 0.0),
        0.5 + 0.5 * sin(px * 6.28318 + 2.0944),
        0.5 + 0.5 * sin(px * 6.28318 + 4.1888)
      );
      color *= mix(vec3(1.0), 0.7 + 0.6 * grille, maskIntensity);

      // Interference brightens its band slightly
      color += interference * 0.06;

      // Film grain
      color += (hash(uv * vec2(521.0, 947.0) + fract(time) * 13.7) - 0.5) * noiseIntensity;

      // Vignette + faint phosphor ambient in the corners
      float vig = 1.0 - dot(cc, cc) * vignetteStrength;
      color *= vig;
      color += vec3(0.012, 0.02, 0.014) * (1.0 - vig);

      // Flicker (mains hum + slow drift)
      color *= 1.0 - flickerIntensity * (0.5 + 0.5 * sin(time * 12.0)) * (0.6 + 0.4 * sin(time * 0.7));

      // Phosphor tint: nudge toward the cyan/blue palette
      color *= vec3(0.94, 1.0, 1.04);

      // Brightness compensation for mask/scanline losses
      color *= brightness;
      color += vec3(0.55, 0.95, 1.0) * lineGlow * 1.2;

      gl_FragColor = vec4(color * mask, 1.0);
    }
  `,
}

export { CRTEffectShader }
