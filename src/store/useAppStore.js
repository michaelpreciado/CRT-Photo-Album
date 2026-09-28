import { create } from 'zustand'

/**
 * Global app state.
 *
 * `viewMode` drives the camera rig and room lighting:
 *   'desktop' — full view of the room, orbit controls enabled
 *   'gallery' — the My Pictures window is open, camera eases toward the screen
 *   'photo'   — a photo is open fullscreen, camera zooms in close and the
 *               room outside the CRT frame dims
 *
 * `cursor` is intentionally a mutable object (not React state) — it is written
 * on every pointer move and read inside useFrame loops, so routing it through
 * setState would re-render the whole screen scene at pointer frequency.
 */
export const useAppStore = create((set) => ({
  viewMode: 'desktop',
  selectedImage: null,
  images: [],
  saving: false,
  booted: false,

  cursor: { x: 0, y: 0 },

  setImages: (images) => set({ images }),
  addImages: (urls) => set((s) => ({ images: [...s.images, ...urls] })),

  openGallery: () => set({ viewMode: 'gallery' }),
  closeGallery: () => set({ viewMode: 'desktop', selectedImage: null }),

  selectPhoto: (url) => set({ viewMode: 'photo', selectedImage: url }),
  closePhoto: () => set({ viewMode: 'gallery', selectedImage: null }),

  setSaving: (saving) => set({ saving }),
  setBooted: () => set({ booted: true }),
}))

// Handy for debugging and end-to-end tests.
if (typeof window !== 'undefined') {
  window.crtAlbumStore = useAppStore
}
