import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { validateFiles, prepareImage, uploadFile } from '../utils/upload'
import { sfx } from '../utils/sound'

const SAMPLE_IMAGES = [10, 11, 12, 13, 14].map((id) => `https://picsum.photos/id/${id}/800/600`)
const CONCURRENCY = 2

/**
 * Album data + upload flow, kept out of the 3D tree so status changes here
 * (uploading, notices) can never re-render the scene.
 */
export function useAlbum() {
  const setImages = useAppStore((s) => s.setImages)
  const addImages = useAppStore((s) => s.addImages)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(null) // { done, total } | null
  const [notice, setNotice] = useState(null) // { kind: 'error' | 'info' | 'success', text }
  const localUrls = useRef([])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), notice.kind === 'error' ? 7000 : 4500)
    return () => clearTimeout(t)
  }, [notice])

  // Revoke object URLs (offline-mode uploads) when the page goes away.
  useEffect(() => {
    const urls = localUrls.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  useEffect(() => {
    let live = true
    const ac = new AbortController()
    ;(async () => {
      try {
        const get = async () => {
          const r = await fetch('/api/images', { signal: ac.signal })
          if (!r.ok) throw new Error(`images ${r.status}`)
          return r.json()
        }
        let data = await get()
        if (data.needsInit) {
          await fetch('/api/init-db', { method: 'POST', signal: ac.signal })
          data = await get()
        }
        if (live) setImages(data.images.map((img) => img.url))
      } catch {
        if (live && !ac.signal.aborted) setImages(SAMPLE_IMAGES)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
      ac.abort()
    }
  }, [setImages])

  const upload = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || [])
      if (!files.length) return
      const { valid, rejected } = validateFiles(files)

      if (!valid.length) {
        sfx.error()
        setNotice({ kind: 'error', text: rejected.map((r) => r.reason).slice(0, 2).join(' | ') + (rejected.length > 2 ? ` (+${rejected.length - 2} more)` : '') })
        return
      }

      setNotice(null)
      setProgress({ done: 0, total: valid.length })
      const stored = []
      const failed = []
      let offline = false
      let done = 0
      let next = 0

      const worker = async () => {
        while (next < valid.length) {
          const file = valid[next++]
          try {
            const prepared = await prepareImage(file)
            stored.push(await uploadFile(prepared))
          } catch (err) {
            // Network failures / missing backend: keep the file locally.
            if (err.network || err.status === 404 || err.status >= 500) {
              offline = true
              const url = URL.createObjectURL(file)
              localUrls.current.push(url)
              stored.push(url)
            } else {
              failed.push(`${file.name}: ${err.message}`)
            }
          }
          setProgress({ done: ++done, total: valid.length })
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, valid.length) }, worker))

      if (stored.length) addImages(stored)
      setProgress(null)

      const problems = [...rejected.map((r) => r.reason), ...failed]
      if (problems.length) {
        sfx.error()
        setNotice({
          kind: 'error',
          text: `${stored.length ? `${stored.length} added. ` : ''}${problems.slice(0, 2).join(' | ')}${problems.length > 2 ? ` (+${problems.length - 2} more)` : ''}`,
        })
      } else if (offline) {
        setNotice({ kind: 'info', text: 'Upload service unavailable - photos are shown locally for this session only.' })
      } else {
        sfx.select()
        setNotice({ kind: 'success', text: `${stored.length} photo${stored.length === 1 ? '' : 's'} added.` })
      }
    },
    [addImages],
  )

  return { loading, progress, notice, dismiss: () => setNotice(null), upload, setNotice }
}
