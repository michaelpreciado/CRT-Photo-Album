import {
  Color,
  Matrix4,
  ShaderMaterial,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type SpotLight,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'

/**
 * Raymarched volumetric light for the pendant lamp.
 *
 * For every pixel the view ray is marched through the air between the camera
 * and the scene depth. Each sample tests the spot cone and the lamp's own
 * shadow map, so the haze is lit only where light actually travels: the
 * monitor casts a dark shaft through the beam, and the cone fades softly at
 * its penumbra. Interleaved-gradient jitter + film grain hide the step count.
 */
export class VolumetricPass extends Pass {
  private quad: FullScreenQuad
  readonly material: ShaderMaterial
  private tmp = new Vector3()

  constructor(
    private camera: PerspectiveCamera,
    private light: SpotLight,
    steps: number,
  ) {
    super()
    this.material = new ShaderMaterial({
      defines: { STEPS: steps },
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tShadow: { value: null },
        uProjInv: { value: new Matrix4() },
        uCamWorld: { value: new Matrix4() },
        uShadowMatrix: { value: new Matrix4() },
        uCamPos: { value: new Vector3() },
        uLightPos: { value: new Vector3() },
        uLightDir: { value: new Vector3() },
        uColor: { value: new Color() },
        uCosOuter: { value: 0 },
        uCosInner: { value: 0 },
        uDensity: { value: 0.05 },
        uTime: { value: 0 },
        uFrame: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse, tDepth, tShadow;
        uniform mat4 uProjInv, uCamWorld, uShadowMatrix;
        uniform vec3 uCamPos, uLightPos, uLightDir, uColor;
        uniform float uCosOuter, uCosInner, uDensity, uTime, uFrame;
        varying vec2 vUv;

        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

        vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
          vec3 inv = 1.0 / rd;
          vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
          vec3 tmin = min(t0, t1), tmax = max(t0, t1);
          return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
        }

        float haze(vec3 p) {
          float t = uTime * 0.05;
          return 0.72 + 0.28 * sin(p.x * 7.0 + t * 3.0 + sin(p.y * 5.0 - t)) * sin(p.z * 6.0 - t * 2.0 + sin(p.x * 4.0));
        }

        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          float depth = texture2D(tDepth, vUv).x;
          vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec3 end = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
          vec3 ro = uCamPos;
          vec3 rd = end - ro;
          float len = length(rd);
          rd /= len;
          vec2 hit = boxHit(ro, rd, vec3(-1.4, -0.03, -0.56), vec3(1.4, 0.95, 1.1));
          float t0 = max(hit.x, 0.0);
          float t1 = min(hit.y, len);
          if (t1 <= t0) { gl_FragColor = base; return; }

          float stepLen = (t1 - t0) / float(STEPS);
          float t = t0 + stepLen * ign(gl_FragCoord.xy + uFrame * 5.588238);
          float acc = 0.0;
          for (int i = 0; i < STEPS; i++) {
            vec3 p = ro + rd * t;
            vec3 L = p - uLightPos;
            float d2 = dot(L, L);
            float cone = smoothstep(uCosOuter, uCosInner, dot(L * inversesqrt(d2), uLightDir));
            if (cone > 0.001) {
              vec4 sc = uShadowMatrix * vec4(p, 1.0);
              sc.xyz /= sc.w;
              float lit = 1.0;
              if (sc.z < 1.0 && all(greaterThan(sc.xy, vec2(0.0))) && all(lessThan(sc.xy, vec2(1.0)))) {
                lit = step(sc.z - 0.0015, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
              }
              acc += cone * lit * haze(p) / (d2 + 0.03);
            }
            t += stepLen;
          }
          // Henyey-Greenstein, mildly forward scattering
          float g = 0.35;
          float mu = dot(-rd, uLightDir);
          float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
          vec3 scatter = uColor * acc * stepLen * uDensity * phase;
          gl_FragColor = vec4(base.rgb + scatter, base.a);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    const u = this.material.uniforms
    const shadowMap = this.light.shadow.map
    u.tDiffuse.value = readBuffer.texture
    u.tDepth.value = readBuffer.depthTexture
    u.tShadow.value = shadowMap ? shadowMap.texture : null
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse)
    u.uCamWorld.value.copy(this.camera.matrixWorld)
    u.uShadowMatrix.value.copy(this.light.shadow.matrix)
    u.uCamPos.value.setFromMatrixPosition(this.camera.matrixWorld)
    this.light.getWorldPosition(u.uLightPos.value)
    this.light.target.getWorldPosition(this.tmp)
    u.uLightDir.value.subVectors(this.tmp, u.uLightPos.value).normalize()
    u.uColor.value.copy(this.light.color).multiplyScalar(this.light.intensity)
    u.uCosOuter.value = Math.cos(this.light.angle)
    u.uCosInner.value = Math.cos(this.light.angle * (1 - this.light.penumbra))
    u.uFrame.value = (u.uFrame.value + 1) % 64
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.quad.dispose()
  }
}

/** Display-space finishing: lens chromatic aberration, vignette, grain, dither. */
export class FinalPass extends Pass {
  private quad: FullScreenQuad
  readonly material: ShaderMaterial

  constructor() {
    super()
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uRes: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uGrain: { value: 0.045 },
        uVignette: { value: 1 },
        uFade: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uRes;
        uniform float uTime, uGrain, uVignette, uFade;
        varying vec2 vUv;
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          vec2 c = vUv - 0.5;
          float aspect = uRes.x / uRes.y;
          vec2 ca = c * vec2(aspect, 1.0) / max(aspect, 1.0);
          float r2 = dot(ca, ca);
          vec2 off = c * r2 * 0.018;
          vec3 col = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
          float vig = smoothstep(0.9, 0.12, sqrt(r2) * 1.18);
          col *= mix(1.0, vig, uVignette);
          float n = hash(vUv * uRes + fract(uTime * 7.13) * 91.0) - 0.5;
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col += n * uGrain * (0.35 + 0.65 * (1.0 - lum));
          col += (hash(vUv * uRes + 3.1) - 0.5) / 255.0;
          gl_FragColor = vec4(col * uFade, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  setSize(w: number, h: number) {
    this.material.uniforms.uRes.value.set(w, h)
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.quad.dispose()
  }
}
