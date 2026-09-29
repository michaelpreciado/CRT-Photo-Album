import { useEffect, useState } from 'react'
import { Texture, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter } from 'three'

/**
 * Image -> GPU texture pipeline.
 *
 *  - Gallery thumbnails are downscaled on a 2D canvas to <= THUMB_SIZE px so a
 *    12 MP upload costs ~0.5 MB of VRAM instead of ~64 MB.
 *  - The fullscreen view uses <= FULL_SIZE px (with mipmaps + anisotropy so
 *    zooming out never shimmers).
 *  - Textures are cached by url+size and ref-counted; when nothing uses one
 *    for a few seconds it is disposed, so paging through a big album stays
 *    flat in memory.
 *  - Load failures resolve to an `error` status instead of throwing, so one
 *    broken URL can never take the scene down.
 */
export const THUMB_SIZE = 512
export const FULL_SIZE = 2048

const cache = new Map() // key -> { entry }
const DISPOSE_DELAY = 4000

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${url}`))
    img.src = url
  })
}

async function build(url, maxSize) {
  const img = await loadImage(url)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const width = Math.max(1, Math.round(w * scale))
  const height = Math.max(1, Math.round(h * scale))
  // Always go through a 2D canvas: it caps the size and gives WebGL a
  // fully-decoded bitmap (uploading a still-decoding <img> can yield black).
  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  const ctx = source.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  const tex = new Texture(source)
  tex.colorSpace = SRGBColorSpace
  tex.generateMipmaps = true
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.anisotropy = 4
  tex.needsUpdate = true
  return { texture: tex, aspect: w / h }
}

function acquire(url, maxSize) {
  const key = `${maxSize}|${url}`
  let e = cache.get(key)
  if (!e) {
    e = { key, refs: 0, timer: 0, status: 'loading', result: null, promise: null }
    e.promise = build(url, maxSize).then(
      (r) => {
        e.result = r
        e.status = 'ready'
      },
      () => {
        e.status = 'error'
      },
    )
    cache.set(key, e)
  }
  clearTimeout(e.timer)
  e.refs++
  return e
}

function release(e) {
  e.refs--
  if (e.refs > 0) return
  e.timer = setTimeout(() => {
    if (e.refs > 0) return
    e.result?.texture.dispose()
    cache.delete(e.key)
  }, DISPOSE_DELAY)
}

/** { status: 'loading' | 'ready' | 'error', texture, aspect } */
export function useImageTexture(url, maxSize = THUMB_SIZE) {
  const [state, setState] = useState({ url: null, status: 'loading', texture: null, aspect: 1 })

  useEffect(() => {
    if (!url) return
    const e = acquire(url, maxSize)
    let live = true
    const apply = () => {
      if (!live) return
      setState(
        e.status === 'ready'
          ? { url, status: 'ready', texture: e.result.texture, aspect: e.result.aspect }
          : { url, status: 'error', texture: null, aspect: 1 },
      )
    }
    if (e.status === 'loading') e.promise.then(apply)
    else apply()
    return () => {
      live = false
      release(e)
    }
  }, [url, maxSize])

  // A url change shows 'loading' until the new texture resolves.
  return state.url === url ? state : { url, status: 'loading', texture: null, aspect: 1 }
}
