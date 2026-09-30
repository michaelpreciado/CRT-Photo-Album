import { isSoundOn, onSoundChange, setSoundOn } from '../app/sound'
import type { Notice } from '../app/album'

const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>',
  soundOn:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>',
}

export interface OverlayHooks {
  start(): void
  back(): void
  upload(files: FileList | File[]): void
  save(): void
}

/** All DOM chrome around the canvas: intro, HUD, hints, toasts, drop zone. */
export class Overlay {
  readonly root: HTMLElement
  private intro: HTMLElement
  private bar: HTMLElement
  private startBtn: HTMLButtonElement
  private backBtn: HTMLButtonElement
  private saveBtn: HTMLButtonElement
  private soundBtn: HTMLButtonElement
  private hint: HTMLElement
  private toast: HTMLElement
  private live: HTMLElement
  private file: HTMLInputElement
  private toastTimer = 0
  private hintTimer = 0

  constructor(host: HTMLElement, hooks: OverlayHooks) {
    host.insertAdjacentHTML(
      'beforeend',
      `
      <div class="hud" data-view="room">
        <div class="hud-left">
          <button class="pill back" type="button" aria-label="Back to the room">${ICON.back}<span>Room</span></button>
          <div class="brand" aria-hidden="true"><i></i>CRT&nbsp;Album</div>
        </div>
        <div class="hud-right">
          <button class="pill icon save" type="button" aria-label="Save photo with CRT effect">${ICON.save}</button>
          <button class="pill add" type="button" aria-label="Add photos">${ICON.plus}<span>Add photos</span></button>
          <button class="pill icon sound" type="button"></button>
        </div>
      </div>
      <p class="hint" aria-hidden="true"></p>
      <div class="toast" role="status" aria-live="polite"></div>
      <div class="drop" aria-hidden="true"><div>Drop to add to the album</div></div>
      <div class="intro">
        <div class="intro-inner">
          <p class="kicker">Preciado Tech</p>
          <h1>CRT <em>Album</em></h1>
          <p class="tag">A desk, a lamp, and a tube full of memories.</p>
          <div class="load"><span></span></div>
          <button class="start" type="button" disabled>Loading the room…</button>
          <p class="fine">Best with sound · drag to look around · tap the screen</p>
        </div>
      </div>
      <input class="file" type="file" accept="image/*" multiple hidden />
      <div class="sr-only" aria-live="polite"></div>`,
    )
    this.root = host
    const $ = <T extends HTMLElement>(s: string) => host.querySelector(s) as T
    this.intro = $('.intro')
    this.bar = $('.load span')
    this.startBtn = $('.start')
    this.backBtn = $('.back')
    this.saveBtn = $('.save')
    this.soundBtn = $('.sound')
    this.hint = $('.hint')
    this.toast = $('.toast')
    this.live = $('.sr-only')
    this.file = $('.file')

    this.startBtn.addEventListener('click', () => {
      this.startBtn.disabled = true
      this.intro.classList.add('gone')
      setTimeout(() => this.intro.remove(), 1800)
      document.querySelector('.hud')!.classList.add('on')
      hooks.start()
    })
    this.backBtn.addEventListener('click', () => hooks.back())
    this.saveBtn.addEventListener('click', () => hooks.save())
    $('.add').addEventListener('click', () => this.pickFiles())
    this.file.addEventListener('change', () => {
      if (this.file.files?.length) hooks.upload(this.file.files)
      this.file.value = ''
    })
    this.soundBtn.addEventListener('click', () => setSoundOn(!isSoundOn()))
    const paintSound = () => {
      this.soundBtn.innerHTML = isSoundOn() ? ICON.soundOn : ICON.soundOff
      this.soundBtn.setAttribute('aria-label', isSoundOn() ? 'Mute sound' : 'Turn sound on')
      this.soundBtn.setAttribute('aria-pressed', String(isSoundOn()))
    }
    paintSound()
    onSoundChange(paintSound)

    // drag & drop anywhere
    let depth = 0
    const drop = $('.drop')
    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth++
      drop.classList.add('on')
    })
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1)
      if (!depth) drop.classList.remove('on')
    })
    window.addEventListener('dragover', (e) => e.preventDefault())
    window.addEventListener('drop', (e) => {
      e.preventDefault()
      depth = 0
      drop.classList.remove('on')
      if (e.dataTransfer?.files.length) hooks.upload(e.dataTransfer.files)
    })
  }

  pickFiles() {
    this.file.click()
  }

  progress(p: number) {
    this.bar.style.transform = `scaleX(${p})`
    if (p >= 1) {
      this.startBtn.disabled = false
      this.startBtn.textContent = 'Turn on the lamp'
      this.startBtn.focus({ preventScroll: true })
    }
  }

  setView(view: 'room' | 'screen') {
    document.querySelector('.hud')!.setAttribute('data-view', view)
    this.showHint(
      view === 'room'
        ? matchMedia('(pointer: coarse)').matches
          ? 'Drag to look around · pinch to move closer · tap the screen'
          : 'Drag to look around · scroll to move closer · click the screen'
        : matchMedia('(pointer: coarse)').matches
          ? 'Swipe to scroll · tap a photo · tap outside the glass to step back'
          : 'Scroll · click a photo · arrows browse · Esc steps back',
    )
    this.announce(view === 'room' ? 'Room view' : 'Screen view. Photo album.')
  }

  setMode(mode: string) {
    document.querySelector('.hud')!.setAttribute('data-mode', mode)
    if (mode === 'viewer')
      this.showHint(
        matchMedia('(pointer: coarse)').matches
          ? 'Swipe to browse · pinch or double-tap to zoom · swipe down to close'
          : 'Arrows browse · wheel zooms · drag to pan · Esc closes',
      )
  }

  showHint(text: string) {
    this.hint.textContent = text
    this.hint.classList.add('on')
    clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => this.hint.classList.remove('on'), 5200)
  }

  notice(n: Notice) {
    this.toast.textContent = n.text
    this.toast.dataset.kind = n.kind
    this.toast.classList.add('on')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('on'), n.kind === 'error' ? 7000 : 4000)
  }

  announce(text: string) {
    this.live.textContent = text
  }
}
