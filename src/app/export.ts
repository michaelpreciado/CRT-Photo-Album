import {
  Camera,
  Mesh,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  CanvasTexture,
  WebGLRenderTarget,
  LinearMipmapLinearFilter,
  type WebGLRenderer,
} from 'three'
import { CRT_GLSL, CRT_UNIFORMS } from '../screen/crtShader'

const MAX = 2048

/**
 * Renders a photo through the same CRT model as the tube (flat, full frame)
 * using the live renderer, then shares (mobile) or downloads it as PNG.
 */
export async function exportCRT(renderer: WebGLRenderer, url: string) {
  const res = await fetch(url, { mode: 'cors' })
  const bmp = await createImageBitmap(await res.blob())
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  // Go through a canvas: UNPACK_FLIP_Y is honoured for canvases everywhere,
  // unlike ImageBitmaps.
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  src.getContext('2d')!.drawImage(bmp, 0, 0, w, h)

  const tex = new CanvasTexture(src)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearMipmapLinearFilter
  tex.needsUpdate = true

  const uniforms = CRT_UNIFORMS()
  uniforms.tScreen.value = tex
  uniforms.uPower.value = 1
  uniforms.uTime.value = 1.7
  uniforms.uJitter.value = 0.25
  uniforms.uInset.value = 1.0
  uniforms.uCurve.value = 0.04
  uniforms.uBrightness.value = 1.35
  uniforms.uLines.value = Math.min(540, Math.round(h / 2.6))
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      ${CRT_GLSL}
      void main() {
        vec3 c = crtColor(vUv);
        c = c / (1.0 + c * 0.15); // gentle shoulder instead of clipping
        gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
      }`,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), mat)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  const rt = new WebGLRenderTarget(w, h)
  const prev = renderer.getRenderTarget()
  try {
    renderer.setRenderTarget(rt)
    renderer.render(scene, new Camera())
    const px = new Uint8Array(w * h * 4)
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(w, h)
    // GL rows are bottom-up
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('encode failed'))), 'image/png'))
    const file = new File([blob], `crt-photo-${Date.now()}.png`, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (matchMedia('(pointer: coarse)').matches && nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'CRT photo' }).catch(() => {})
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }
  } finally {
    renderer.setRenderTarget(prev)
    rt.dispose()
    tex.dispose()
    mat.dispose()
    quad.geometry.dispose()
    bmp.close()
  }
}
