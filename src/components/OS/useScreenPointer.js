import { useMemo, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { CRT_CURVATURE } from '../shaders/CRTEffectShader'
import { SCREEN_WIDTH } from './constants'
import { PAGE_SIZE } from './layout'
import { screenClick } from './actions'

const TAP_SLOP = 0.02 // uv units a pointer may travel and still count as a tap
const SWIPE_MIN = 0.16

// The CRT shader samples the OS texture through barrel distortion, so a
// pointer at screen position `s` must be drawn at curve(s) for the cursor to
// appear exactly under the finger/mouse.
function toTextureUv(uv) {
  const cx = uv.x - 0.5
  const cy = uv.y - 0.5
  const d = cx * cx + cy * cy
  return { x: uv.x + cx * d * CRT_CURVATURE, y: uv.y + cy * d * CRT_CURVATURE }
}

function writeCursor(uv) {
  const t = toTextureUv(uv)
  const { cursor } = useAppStore.getState()
  cursor.x = (t.x - 0.5) * 2
  cursor.y = (t.y - 0.5) * 2
}

/**
 * Pointer handlers for the CRT glass. Distinguishes tap / drag-pan / swipe so
 * mouse, touch and pen all behave, and never re-renders React.
 */
export function useScreenPointer() {
  const drag = useRef(null)

  return useMemo(
    () => ({
      onPointerMove(e) {
        if (!e.uv) return
        writeCursor(e.uv)
        const s = useAppStore.getState()
        if (e.pointerType === 'mouse') s.setKb(false)
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const dx = e.uv.x - d.lx
        const dy = e.uv.y - d.ly
        d.lx = e.uv.x
        d.ly = e.uv.y
        d.moved += Math.abs(dx) + Math.abs(dy)
        // Drag-to-pan while zoomed into a photo
        if (s.viewMode === 'photo' && s.photoView.zoom > 1.02 && !s.photoView.pinching) {
          s.photoView.x += dx * SCREEN_WIDTH
          s.photoView.y += dy * SCREEN_WIDTH
        }
      },
      onPointerDown(e) {
        e.stopPropagation()
        if (!e.uv) return
        writeCursor(e.uv)
        drag.current = { id: e.pointerId, sx: e.uv.x, sy: e.uv.y, lx: e.uv.x, ly: e.uv.y, moved: 0 }
        try {
          e.target.setPointerCapture?.(e.pointerId)
        } catch {
          /* capture is best-effort */
        }
      },
      onPointerUp(e) {
        const d = drag.current
        drag.current = null
        if (!d || d.id !== e.pointerId) return
        const ux = e.uv ? e.uv.x : d.lx // fall back to the last move if the hit test missed
        const uy = e.uv ? e.uv.y : d.ly
        const s = useAppStore.getState()
        if (s.photoView.pinching) return
        const dx = ux - d.sx
        const dy = uy - d.sy
        const zoomed = s.viewMode === 'photo' && s.photoView.zoom > 1.02

        if (d.moved < TAP_SLOP) {
          screenClick()
        } else if (!zoomed && Math.abs(dx) > SWIPE_MIN && Math.abs(dy) < Math.abs(dx) * 0.8) {
          const dir = dx < 0 ? 1 : -1 // swipe left -> next
          if (s.viewMode === 'photo') s.stepPhoto(dir)
          else if (s.viewMode === 'gallery' && s.images.length > PAGE_SIZE) s.setPage(s.page + dir)
        }
      },
      onPointerCancel() {
        drag.current = null
      },
    }),
    [],
  )
}
