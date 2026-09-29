import { create } from 'zustand'
import { sfx } from '../utils/sound'
import { PAGE_SIZE, GRID_COLS } from '../components/OS/layout'

/**
 * Global app state.
 *
 * `viewMode` drives the camera rig and room lighting:
 *   'desktop' — full view of the room, orbit controls enabled
 *   'gallery' — the My Pictures window is open, camera eases toward the screen
 *   'photo'   — a photo is open fullscreen, camera zooms in close and the
 *               room outside the CRT frame dims
 *
 * `cursor` and `photoView` are intentionally mutable objects (not React
 * state) — they are written on every pointer move / wheel tick and read inside
 * useFrame loops, so routing them through setState would re-render the whole
 * screen scene at input frequency.
 */
const WINDOW_CLOSE_MS = 260
let closeTimer = 0

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export const useAppStore = create((set, get) => ({
  viewMode: 'desktop',
  selectedImage: null,
  images: [],
  imagesLoaded: false,
  saving: false,
  booted: false,
  sceneReady: false,
  bootProgress: 0,
  contextLost: false,

  // Gallery paging + keyboard focus
  page: 0,
  focusIndex: 0, // index within the current page
  kb: false, // true while the keyboard (not the pointer) is driving focus
  windowMounted: false, // stays true during the close animation

  cursor: { x: 0, y: 0 },
  photoView: { zoom: 1, x: 0, y: 0 }, // *target* zoom/pan; the view eases to it

  setImages: (images) => set({ images, imagesLoaded: true }),
  addImages: (urls) => set((s) => ({ images: [...s.images, ...urls] })),

  openGallery: () => {
    clearTimeout(closeTimer)
    sfx.open()
    set({ viewMode: 'gallery', windowMounted: true })
  },
  closeGallery: () => {
    sfx.close()
    set({ viewMode: 'desktop', selectedImage: null })
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (get().viewMode === 'desktop') set({ windowMounted: false })
    }, WINDOW_CLOSE_MS)
  },

  selectPhoto: (url) => {
    const i = get().images.indexOf(url)
    sfx.select()
    const pv = get().photoView
    pv.zoom = 1
    pv.x = 0
    pv.y = 0
    set({
      viewMode: 'photo',
      selectedImage: url,
      page: i >= 0 ? Math.floor(i / PAGE_SIZE) : get().page,
      focusIndex: i >= 0 ? i % PAGE_SIZE : 0,
    })
  },
  closePhoto: () => {
    sfx.close()
    set({ viewMode: 'gallery', selectedImage: null })
  },

  /** Step through photos while one is open (wraps around). */
  stepPhoto: (dir) => {
    const { images, selectedImage } = get()
    if (!selectedImage || images.length < 2) return
    const i = images.indexOf(selectedImage)
    const next = images[(i + dir + images.length) % images.length]
    sfx.tick()
    get().selectPhoto(next)
  },

  setPage: (page) => {
    const pages = Math.max(1, Math.ceil(get().images.length / PAGE_SIZE))
    const p = clamp(page, 0, pages - 1)
    if (p === get().page) return
    sfx.tick()
    set({ page: p, focusIndex: 0 })
  },

  /** Arrow-key focus movement inside the gallery grid. */
  moveFocus: (dx, dy) => {
    const { images, page, focusIndex } = get()
    const onPage = Math.min(PAGE_SIZE, images.length - page * PAGE_SIZE)
    if (onPage <= 0) return
    const pages = Math.ceil(images.length / PAGE_SIZE)
    let i = focusIndex + dx + dy * GRID_COLS
    if (dx !== 0 && (i < 0 || i >= onPage)) {
      // run off the end of a page — flip to the neighbour
      const np = page + Math.sign(dx)
      if (np >= 0 && np < pages) {
        sfx.tick()
        set({ page: np, focusIndex: dx > 0 ? 0 : Math.min(PAGE_SIZE, images.length - np * PAGE_SIZE) - 1, kb: true })
      }
      return
    }
    if (i < 0 || i >= onPage) i = clamp(i, 0, onPage - 1)
    if (i !== focusIndex) sfx.tick()
    set({ focusIndex: i, kb: true })
  },
  setKb: (kb) => {
    if (get().kb !== kb) set({ kb })
  },

  /** Wheel / pinch / keyboard zoom on the open photo, anchored at (ax, ay). */
  zoomPhoto: (factor, ax = 0, ay = 0) => {
    const pv = get().photoView
    const z = clamp(pv.zoom * factor, 1, 6)
    const k = z / pv.zoom
    pv.x = z === 1 ? 0 : (ax - (ax - pv.x) * k)
    pv.y = z === 1 ? 0 : (ay - (ay - pv.y) * k)
    pv.zoom = z
  },
  resetPhotoView: () => {
    const pv = get().photoView
    pv.zoom = 1
    pv.x = 0
    pv.y = 0
  },

  setSaving: (saving) => set({ saving }),
  setBooted: () => set({ booted: true }),
  setSceneReady: () => set({ sceneReady: true }),
  setBootProgress: (bootProgress) => set({ bootProgress }),
  setContextLost: (contextLost) => set({ contextLost }),
}))

// Handy for debugging and end-to-end tests.
if (typeof window !== 'undefined') {
  window.crtAlbumStore = useAppStore
}
