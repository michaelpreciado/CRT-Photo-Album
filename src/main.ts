import './styles.css'
import { Album } from './app/album'
import { sfx, unlockAudio } from './app/sound'
import { Overlay } from './ui/overlay'

function hasWebGL2() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

async function loadPixelFont() {
  // VT323 is a faithful DEC VT320 terminal face; fall back to monospace.
  try {
    const timeout = new Promise<never>((_, fail) => setTimeout(() => fail(new Error('timeout')), 4000))
    const faces = await Promise.race([document.fonts.load('32px "VT323"'), timeout])
    if (faces.length) return { family: '"VT323", monospace', scale: 1.32 }
  } catch {
    /* offline or blocked */
  }
  return { family: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', scale: 0.92 }
}

async function main() {
  const host = document.getElementById('app')!

  if (!hasWebGL2()) {
    const { startFallback } = await import('./app/fallback')
    startFallback(host)
    return
  }

  type Exp = import('./app/experience').Experience
  let exp: Exp | null = null
  let pendingUrls: string[] | null = null

  const album = new Album({
    images: (urls) => {
      if (exp) exp.store.setUrls(urls)
      else pendingUrls = urls
    },
    added: (urls) => {
      if (!exp) return
      exp.store.prepend(urls)
      exp.os?.showNewest(urls.length)
    },
    progress: (p) => {
      if (exp?.os) exp.os.uploading = p
    },
    notice: (n) => {
      overlay.notice(n)
      if (n.kind === 'error') sfx.error()
      else if (n.kind === 'success') sfx.select()
    },
  })

  const overlay = new Overlay(host, {
    start: () => {
      unlockAudio()
      exp?.powerUp()
    },
    back: () => {
      if (!exp) return
      if (!exp.os.back()) exp.setView('room')
    },
    upload: (files) => album.upload(files),
    save: () => {
      const it = exp?.os.current()
      if (it) save(it.url)
    },
  })

  const save = (url: string) => {
    overlay.notice({ kind: 'info', text: 'Developing your CRT print…' })
    exp
      ?.exportPhoto(url)
      .then(() => overlay.notice({ kind: 'success', text: 'Saved with the CRT look' }))
      .catch(() => overlay.notice({ kind: 'error', text: 'Could not export this photo (the host may block cross-origin access).' }))
  }

  // Load the album and the 3D stack in parallel with the intro.
  album.load()
  const [font, mod] = await Promise.all([loadPixelFont(), import('./app/experience')])
  try {
    exp = new mod.Experience(host, {
      progress: (p) => overlay.progress(p * 0.98 + (p >= 1 ? 0.02 : 0)),
      view: (v) => overlay.setView(v),
      mode: (m) => overlay.setMode(m),
      upload: () => overlay.pickFiles(),
      save,
      contextLost: () => overlay.notice({ kind: 'error', text: 'The graphics context was lost. Reload the page to continue.' }),
    })
    await exp.init()
    exp.os.setFont(font.family, font.scale)
    if (pendingUrls) exp.store.setUrls(album.urls)
    if (location.search.includes('capture')) (window as unknown as { __exp: unknown }).__exp = exp
  } catch (err) {
    console.error(err)
    const { startFallback } = await import('./app/fallback')
    host.innerHTML = ''
    startFallback(host)
  }
}

main()
