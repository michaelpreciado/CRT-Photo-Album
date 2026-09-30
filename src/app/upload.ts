// Client-side upload helpers: validation with per-file reasons, and
// resize/re-encode so phone photos fit comfortably under serverless body
// limits (Vercel caps request bodies at ~4.5 MB; base64 adds 33%).
export const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB input cap (matches the API)
export const MAX_DIMENSION = 2560
const TARGET_BYTES = 3.1 * 1024 * 1024 // raw bytes that stay < 4.5 MB once base64-encoded

const mb = (n: number) => (n / 1024 / 1024).toFixed(1)

/** Split a FileList into uploadable files and human-readable rejections. */
export function validateFiles(files: File[]) {
  const valid: File[] = []
  const rejected: { name: string; reason: string }[] = []
  for (const f of files) {
    if (!ALLOWED_TYPES.has(f.type)) {
      rejected.push({ name: f.name, reason: `${f.name}: unsupported format (use JPG, PNG, GIF, WebP or AVIF)` })
    } else if (f.size === 0) {
      rejected.push({ name: f.name, reason: `${f.name}: file is empty` })
    } else if (f.size > MAX_FILE_SIZE) {
      rejected.push({ name: f.name, reason: `${f.name}: ${mb(f.size)} MB exceeds the 10 MB limit` })
    } else if (f.type === 'image/gif' && f.size > TARGET_BYTES) {
      // animated GIFs can't be re-encoded without losing the animation
      rejected.push({ name: f.name, reason: `${f.name}: GIFs must be under ${mb(TARGET_BYTES)} MB` })
    } else {
      valid.push(f)
    }
  }
  return { valid, rejected }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Downscale to MAX_DIMENSION and re-encode when the file is large or huge.
 * Small files and GIFs pass through untouched. Falls back to the original
 * file if anything about decoding/encoding fails.
 */
export async function prepareImage(file: File): Promise<File> {
  if (file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const longest = Math.max(bmp.width, bmp.height)
    if (file.size <= TARGET_BYTES && longest <= MAX_DIMENSION) {
      bmp.close?.()
      return file
    }
    let scale = Math.min(1, MAX_DIMENSION / longest)
    let quality = 0.88
    let best: Blob | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const w = Math.max(1, Math.round(bmp.width * scale))
      const h = Math.max(1, Math.round(bmp.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bmp, 0, 0, w, h)
      // WebP keeps alpha; Safari can't encode it and silently returns PNG, so check.
      let blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (!blob) break
      best = blob
      if (blob.size <= TARGET_BYTES) break
      quality = Math.max(0.6, quality - 0.08)
      scale *= 0.85
    }
    bmp.close?.()
    if (!best || best.size >= file.size) return file
    const ext = best.type === 'image/webp' ? 'webp' : 'jpg'
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([best], `${base}.${ext}`, { type: best.type })
  } catch {
    return file
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

export class UploadError extends Error {
  status: number
  network: boolean
  constructor(message: string, { status = 0, network = false } = {}) {
    super(message)
    this.status = status
    this.network = network
  }
}

/** POST one image to /api/upload. Resolves with the stored URL. */
export async function uploadFile(file: File): Promise<string> {
  const image = await fileToDataUrl(file)
  let response
  try {
    response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, filename: file.name }),
    })
  } catch {
    throw new UploadError('Network error', { network: true })
  }
  let data: { url?: string; error?: string } | null = null
  try {
    data = await response.json()
  } catch {
    /* non-JSON body (e.g. platform error page) */
  }
  if (!response.ok || !data?.url) {
    throw new UploadError(data?.error || `Upload failed (${response.status})`, { status: response.status })
  }
  return data.url
}
