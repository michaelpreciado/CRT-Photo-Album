import { prepareImage, uploadFile, validateFiles, UploadError } from './upload'

const SAMPLE_IMAGES = [1015, 1016, 1018, 1025, 1036, 1039, 1043, 1050, 1057, 1069, 1074, 1084].map(
  (id) => `https://picsum.photos/id/${id}/1200/900`,
)
const CONCURRENCY = 2

export type Notice = { kind: 'error' | 'info' | 'success'; text: string }

export interface AlbumEvents {
  images(urls: string[]): void
  added(urls: string[]): void
  progress(p: { done: number; total: number } | null): void
  notice(n: Notice): void
}

/** Album data + upload flow (API when deployed, local object URLs otherwise). */
export class Album {
  urls: string[] = []
  constructor(private ev: AlbumEvents) {}

  async load() {
    try {
      const get = async () => {
        const r = await fetch('/api/images')
        if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error(`images ${r.status}`)
        return r.json()
      }
      let data = await get()
      if (data.needsInit) {
        await fetch('/api/init-db', { method: 'POST' })
        data = await get()
      }
      this.urls = (data.images as { url: string }[]).map((i) => i.url)
      if (!this.urls.length) this.urls = SAMPLE_IMAGES
    } catch {
      this.urls = SAMPLE_IMAGES
    }
    this.ev.images(this.urls)
  }

  async upload(list: FileList | File[]) {
    const files = Array.from(list || [])
    if (!files.length) return
    const { valid, rejected } = validateFiles(files)
    if (!valid.length) {
      this.ev.notice({ kind: 'error', text: rejected.map((r) => r.reason).slice(0, 2).join(' | ') })
      return
    }
    this.ev.progress({ done: 0, total: valid.length })
    const stored: string[] = []
    const failed: string[] = []
    let offline = false
    let done = 0
    let next = 0
    const worker = async () => {
      while (next < valid.length) {
        const file = valid[next++]
        try {
          stored.push(await uploadFile(await prepareImage(file)))
        } catch (err) {
          const e = err as UploadError
          if (e.network || e.status === 404 || e.status >= 500) {
            offline = true
            stored.push(URL.createObjectURL(file))
          } else failed.push(`${file.name}: ${e.message}`)
        }
        this.ev.progress({ done: ++done, total: valid.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, valid.length) }, worker))
    this.ev.progress(null)
    if (stored.length) {
      this.urls = [...stored, ...this.urls]
      this.ev.added(stored)
    }
    const problems = [...rejected.map((r) => r.reason), ...failed]
    if (problems.length) {
      this.ev.notice({ kind: 'error', text: `${stored.length ? `${stored.length} added. ` : ''}${problems.slice(0, 2).join(' | ')}` })
    } else if (offline) {
      this.ev.notice({ kind: 'info', text: 'Upload service offline - photos stay on this device for this session.' })
    } else {
      this.ev.notice({ kind: 'success', text: `${stored.length} photo${stored.length === 1 ? '' : 's'} added` })
    }
  }
}
