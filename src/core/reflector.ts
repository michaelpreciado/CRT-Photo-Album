import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  UnsignedByteType,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type MeshPhysicalMaterial,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'

/**
 * Planar reflection for the lacquered desk top.
 *
 * The scene is rendered from the camera mirrored in the desk plane (with an
 * oblique near plane so nothing under the desk leaks in) into a mipmapped HDR
 * target. The desk's physical material samples it in screen-projected space,
 * picks a mip level from its roughness map - glossy lacquer stays sharp, worn
 * patches go soft - and weights it by Fresnel, so reflections are strongest at
 * grazing angles, exactly like a real finished wood surface.
 */
export class PlanarReflection {
  readonly target: WebGLRenderTarget
  readonly textureMatrix = new Matrix4()
  private cam = new PerspectiveCamera()
  private plane = new Plane()
  private n = new Vector3()
  private p = new Vector3()
  private camPos = new Vector3()
  private look = new Vector3()
  private tgt = new Vector3()
  private rot = new Matrix4()
  private clip = new Vector4()
  private q = new Vector4()
  private frame = 0
  every = 1

  constructor(
    private renderer: WebGLRenderer,
    private surface: Object3D,
    width: number,
    height: number,
  ) {
    const halfFloat = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float')
    this.target = new WebGLRenderTarget(width, height, {
      type: halfFloat ? HalfFloatType : UnsignedByteType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    })
  }

  setSize(w: number, h: number) {
    this.target.setSize(Math.max(64, Math.round(w)), Math.max(64, Math.round(h)))
  }

  /** Patch a physical material so it blends in the reflection. */
  apply(material: MeshPhysicalMaterial, strength = 1) {
    const uniforms = {
      tReflect: { value: this.target.texture },
      uReflectMatrix: { value: this.textureMatrix },
      uReflectStrength: { value: strength },
    }
    material.userData.reflectUniforms = uniforms
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uReflectMatrix;\nvarying vec4 vReflUv;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = uReflectMatrix * vec4(transformed, 1.0);')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D tReflect;\nuniform float uReflectStrength;\nvarying vec4 vReflUv;',
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          {
            vec3 V = normalize(vViewPosition);
            float NoV = clamp(dot(normal, V), 0.0, 1.0);
            // Normal-map ripples warp the reflection like a real wood surface.
            vec3 nView = normal - nonPerturbedNormal;
            vec2 ruv = vReflUv.xy / vReflUv.w + nView.xy * 0.035;
            float r = roughnessFactor;
            float lod = clamp(r * r * 14.0, 0.0, 7.0);
            vec2 px = vec2(0.0018, 0.0012) * (1.0 + lod * 1.6);
            vec3 refl = textureLod(tReflect, ruv, lod).rgb * 0.4
              + textureLod(tReflect, ruv + vec2(px.x, px.y), lod).rgb * 0.15
              + textureLod(tReflect, ruv + vec2(-px.x, px.y), lod).rgb * 0.15
              + textureLod(tReflect, ruv + vec2(px.x, -px.y), lod).rgb * 0.15
              + textureLod(tReflect, ruv + vec2(-px.x, -px.y), lod).rgb * 0.15;
            float fres = 0.045 + 0.955 * pow(1.0 - NoV, 5.0);
            float gloss = (1.0 - r) * (1.0 - r);
            outgoingLight += refl * fres * gloss * uReflectStrength;
          }
          #include <opaque_fragment>`,
        )
    }
    material.customProgramCacheKey = () => 'planar-reflection'
    material.needsUpdate = true
  }

  update(scene: Scene, camera: PerspectiveCamera) {
    if (this.frame++ % this.every !== 0) return
    const { cam, n, p, camPos, look, tgt, rot, plane, clip, q } = this
    this.surface.updateMatrixWorld()
    p.setFromMatrixPosition(this.surface.matrixWorld)
    rot.extractRotation(this.surface.matrixWorld)
    n.set(0, 0, 1).applyMatrix4(rot)
    camPos.setFromMatrixPosition(camera.matrixWorld)
    const view = tgt.subVectors(p, camPos)
    if (view.dot(n) > 0) return
    view.reflect(n).negate().add(p)
    cam.position.copy(view)

    rot.extractRotation(camera.matrixWorld)
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos)
    tgt.subVectors(p, look).reflect(n).negate().add(p)
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n)
    cam.lookAt(tgt)
    cam.far = camera.far
    cam.updateMatrixWorld()
    cam.projectionMatrix.copy(camera.projectionMatrix)

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(this.surface.matrixWorld)

    // Oblique near plane (Lengyel) clips everything below the desk.
    plane.setFromNormalAndCoplanarPoint(n, p).applyMatrix4(cam.matrixWorldInverse)
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const e = cam.projectionMatrix.elements
    q.x = (Math.sign(clip.x) + e[8]) / e[0]
    q.y = (Math.sign(clip.y) + e[9]) / e[5]
    q.z = -1
    q.w = (1 + e[10]) / e[14]
    clip.multiplyScalar(2 / clip.dot(q))
    e[2] = clip.x
    e[6] = clip.y
    e[10] = clip.z + 1 - 0.002
    e[14] = clip.w

    const r = this.renderer
    const prevTarget = r.getRenderTarget()
    const prevVisible = this.surface.visible
    this.surface.visible = false
    scene.userData.reflecting = true
    r.setRenderTarget(this.target)
    r.clear()
    r.render(scene, cam)
    r.setRenderTarget(prevTarget)
    scene.userData.reflecting = false
    this.surface.visible = prevVisible
  }
}
