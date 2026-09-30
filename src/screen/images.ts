/**
 * Photo decoding for the screen. Each album entry gets a square thumbnail
 * (cover-cropped, for the grid and polaroids) and a fitted "full" image for
 * the viewer, both pre-scaled on a canvas once so drawing them every frame is
 * a plain blit. Loads run through a small priority queue.
 */
export type Pic = HTMLCanvasElement | ImageBitmap

export interface Item {
  url: string
  thumb?: Pic
  full?: Pic
  state: 'idle' | 'loading' | 'ready' | 'error'
  fullState: 'idle' | 'loading' | 'ready' | 'error'
}

const THUMB = 256
const FULL = 1400
const CONCURRENCY = 4

async function decode(url: string): Promise<ImageBitmap | HTMLImageElement> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    // Fall back to an <img> (still needs CORS so the canvas stays untainted).
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('decode failed'))
      img.src = url
    })
  }
}

function sizeOf(src: ImageBitmap | HTMLImageElement) {
  return src instanceof HTMLImageElement ? [src.naturalWidth, src.naturalHeight] : [src.width, src.height]
}

function toCanvas(src: ImageBitmap | HTMLImageElement, w: number, h: number, sx = 0, sy = 0, sw?: number, sh?: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const [iw, ih] = sizeOf(src)
  ctx.drawImage(src, sx, sy, sw ?? iw, sh ?? ih, 0, 0, c.width, c.height)
  return c
}

export class ImageStore {
  items: Item[] = []
  private queue: { item: Item; full: boolean; prio: number }[] = []
  private active = 0
  onChange: () => void = () => {}

  setUrls(urls: string[]) {
    const old = new Map(this.items.map((i) => [i.url, i]))
    this.items = urls.map((url) => old.get(url) ?? { url, state: 'idle', fullState: 'idle' })
    this.onChange()
  }

  prepend(urls: string[]) {
    this.setUrls([...urls, ...this.items.map((i) => i.url)])
  }

  request(item: Item, full: boolean, prio = 0) {
    if (full ? item.fullState !== 'idle' : item.state !== 'idle') return
    if (full) item.fullState = 'loading'
    else item.state = 'loading'
    this.queue.push({ item, full, prio })
    this.pump()
  }

  /** Drop full-size images outside a window around the viewed index (mobile memory). */
  trimFull(center: number, keep = 2) {
    this.items.forEach((it, i) => {
      if (Math.abs(i - center) > keep && it.full) {
        it.full = undefined
        it.fullState = 'idle'
      }
    })
  }

  private pump() {
    this.queue.sort((a, b) => b.prio - a.prio)
    while (this.active < CONCURRENCY && this.queue.length) {
      const job = this.queue.shift()!
      this.active++
      this.run(job.item, job.full).finally(() => {
        this.active--
        this.pump()
      })
    }
  }

  private async run(item: Item, full: boolean) {
    try {
      const src = await decode(item.url)
      const [w, h] = sizeOf(src)
      if (!item.thumb) {
        const s = Math.min(w, h)
        item.thumb = toCanvas(src, THUMB, THUMB, (w - s) / 2, (h - s) / 2, s, s)
        item.state = 'ready'
      }
      if (full) {
        const k = Math.min(1, FULL / Math.max(w, h))
        item.full = toCanvas(src, w * k, h * k)
        item.fullState = 'ready'
      }
      if ('close' in src) src.close()
    } catch {
      if (full) item.fullState = 'error'
      item.state = item.thumb ? 'ready' : 'error'
    }
    this.onChange()
  }
}
