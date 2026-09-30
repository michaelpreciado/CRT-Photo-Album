import {
  Camera,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'

/**
 * GPU texture baking. Every surface texture in the room is procedural: a
 * fragment shader describes height / albedo / roughness once, and it is
 * rendered into mipmapped textures at load. Zero image downloads, and the
 * resolution follows the quality tier.
 */

export const NOISE_GLSL = /* glsl */ `
  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // Tileable gradient noise: lattice wraps every "per" cells.
  float gnoise(vec2 p, vec2 per) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 i00 = mod(i, per), i10 = mod(i + vec2(1, 0), per);
    vec2 i01 = mod(i + vec2(0, 1), per), i11 = mod(i + vec2(1, 1), per);
    float a = dot(hash22(i00), f);
    float b = dot(hash22(i10), f - vec2(1, 0));
    float c = dot(hash22(i01), f - vec2(0, 1));
    float d = dot(hash22(i11), f - vec2(1, 1));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p, vec2 per, int oct) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 8; i++) {
      if (i >= oct) break;
      s += a * gnoise(p, per);
      p *= 2.0; per *= 2.0; a *= 0.5;
    }
    return s;
  }
  // Cellular noise (tileable) - returns distance to nearest feature point.
  float cell(vec2 p, vec2 per) {
    vec2 i = floor(p), f = fract(p);
    float d = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(x, y);
      vec2 h = hash22(mod(i + o, per)) * 0.5 + 0.5;
      d = min(d, length(o + h - f));
    }
    return d;
  }
`

export type BakeMode = 'albedo' | 'normal' | 'rough'

/**
 * `body` must define:
 *   float height(vec2 uv);  vec3 albedo(vec2 uv);  float rough(vec2 uv);
 * uv is 0..1 over the texture. `normalStrength` scales the derived normal.
 */
export class Baker {
  private scene = new Scene()
  private camera = new Camera()
  private quad = new Mesh(new PlaneGeometry(2, 2))
  constructor(private renderer: WebGLRenderer) {
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  bake(body: string, mode: BakeMode, w: number, h: number, normalStrength = 1): Texture {
    const material = new ShaderMaterial({
      uniforms: { uTexel: { value: [1 / w, 1 / h] }, uStrength: { value: normalStrength } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform vec2 uTexel;
        uniform float uStrength;
        ${NOISE_GLSL}
        ${body}
        void main() {
          ${
            mode === 'albedo'
              ? 'gl_FragColor = vec4(albedo(vUv), 1.0);'
              : mode === 'rough'
                ? 'gl_FragColor = vec4(1.0, clamp(rough(vUv), 0.02, 1.0), 0.0, 1.0);'
                : `
            float hL = height(vUv - vec2(uTexel.x, 0.0));
            float hR = height(vUv + vec2(uTexel.x, 0.0));
            float hD = height(vUv - vec2(0.0, uTexel.y));
            float hU = height(vUv + vec2(0.0, uTexel.y));
            vec3 n = normalize(vec3((hL - hR) * uStrength, (hD - hU) * uStrength, 1.0));
            gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);`
          }
        }`,
      depthTest: false,
      depthWrite: false,
    })
    const rt = new WebGLRenderTarget(w, h, {
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      colorSpace: mode === 'albedo' ? SRGBColorSpace : LinearSRGBColorSpace,
    })
    rt.texture.wrapS = rt.texture.wrapT = RepeatWrapping
    rt.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    this.quad.material = material
    const prev = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(rt)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(prev)
    material.dispose()
    return rt.texture
  }

  set(body: string, w: number, h: number, normalStrength = 1) {
    return {
      map: this.bake(body, 'albedo', w, h),
      normalMap: this.bake(body, 'normal', w, h, normalStrength),
      roughnessMap: this.bake(body, 'rough', w, h),
    }
  }

  dispose() {
    this.quad.geometry.dispose()
  }
}
