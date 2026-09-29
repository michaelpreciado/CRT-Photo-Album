import { useAppStore } from '../../store/useAppStore'
import { SCREEN_WIDTH } from './constants'
import { PAGE_SIZE, PHOTO_EDGE, cellAt, cursorToOS, overClose, overFolder, overPager } from './layout'

/** A tap / click on the CRT glass, resolved against whatever the OS is showing. */
export function screenClick() {
  const s = useAppStore.getState()
  const p = cursorToOS(s.cursor)

  if (s.viewMode === 'desktop') {
    if (overFolder(p)) s.openGallery()
    return
  }

  if (s.viewMode === 'gallery') {
    if (overClose(p)) return s.closeGallery()
    const onPage = Math.max(0, Math.min(PAGE_SIZE, s.images.length - s.page * PAGE_SIZE))
    if (overPager(p, -1)) return s.setPage(s.page - 1)
    if (overPager(p, 1)) return s.setPage(s.page + 1)
    const i = cellAt(p, onPage)
    if (i >= 0) s.selectPhoto(s.images[s.page * PAGE_SIZE + i])
    return
  }

  // photo
  // While zoomed in, a tap resets the view instead of navigating away.
  if (s.photoView.zoom > 1.05) return s.resetPhotoView()
  const half = SCREEN_WIDTH / 2
  if (s.images.length > 1 && p.x < -half + PHOTO_EDGE) return s.stepPhoto(-1)
  if (s.images.length > 1 && p.x > half - PHOTO_EDGE) return s.stepPhoto(1)
  s.closePhoto()
}
