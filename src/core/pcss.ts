import { ShaderChunk } from 'three'

/**
 * Percentage-closer soft shadows for the overhead spot light.
 *
 * Three's PCF gives a constant blur; real shadows are sharp where an object
 * touches the desk and soften with distance from it (contact hardening).
 * PCSS estimates the average blocker depth, derives a penumbra width from the
 * lamp's physical size and filters with a rotated Poisson disk.
 *
 * The spot light's shadow camera is a perspective camera, so depths are
 * linearised with its near/far planes before the penumbra estimate.
 */
export function installPCSS(samples: number, near: number, far: number, lightSize: number) {
  if (samples <= 0) return
  const f = (n: number) => n.toFixed(5)
  const pars = /* glsl */ `
  #define PCSS_SAMPLES ${samples}
  #define PCSS_NEAR ${f(near)}
  #define PCSS_FAR ${f(far)}
  #define PCSS_LIGHT_UV ${f(lightSize)}

  float pcssLinear(float d) {
    return (PCSS_NEAR * PCSS_FAR) / (PCSS_FAR - d * (PCSS_FAR - PCSS_NEAR));
  }

  vec2 pcssDisk(int i, float rot) {
    // golden-angle spiral: even coverage with any sample count
    float fi = float(i) + 0.5;
    float r = sqrt(fi / float(PCSS_SAMPLES));
    float a = fi * 2.39996323 + rot;
    return vec2(cos(a), sin(a)) * r;
  }

  float PCSS(sampler2D shadowMap, vec4 coords) {
    vec2 uv = coords.xy;
    float zRecv = pcssLinear(coords.z);
    float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;

    // 1. blocker search
    float search = PCSS_LIGHT_UV * 1.5;
    float sum = 0.0;
    float count = 0.0;
    for (int i = 0; i < PCSS_SAMPLES; i++) {
      float d = unpackRGBAToDepth(texture2D(shadowMap, uv + pcssDisk(i, rot) * search));
      if (d < coords.z) { sum += pcssLinear(d); count += 1.0; }
    }
    if (count < 0.5) return 1.0;
    float zBlock = sum / count;

    // 2. penumbra from similar triangles (lamp size, blocker/receiver distance)
    float pen = clamp((zRecv - zBlock) / zBlock, 0.0, 1.0);
    float radius = mix(PCSS_LIGHT_UV * 0.06, PCSS_LIGHT_UV, pen);

    // 3. filter
    float lit = 0.0;
    for (int i = 0; i < PCSS_SAMPLES; i++) {
      float d = unpackRGBAToDepth(texture2D(shadowMap, uv + pcssDisk(i, rot + 1.3) * radius));
      lit += step(coords.z, d);
    }
    return lit / float(PCSS_SAMPLES);
  }
  `
  let chunk = ShaderChunk.shadowmap_pars_fragment
  if (chunk.includes('PCSS(')) return
  chunk = chunk.replace('#ifdef USE_SHADOWMAP', '#ifdef USE_SHADOWMAP\n' + pars)
  chunk = chunk.replace(
    '#if defined( SHADOWMAP_TYPE_PCF )',
    'return mix( 1.0, PCSS( shadowMap, shadowCoord ), shadowIntensity );\n#if defined( SHADOWMAP_TYPE_PCF )',
  )
  ShaderChunk.shadowmap_pars_fragment = chunk
}
