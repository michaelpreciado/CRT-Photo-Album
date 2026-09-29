import { SCREEN_WIDTH, SCREEN_HEIGHT } from './constants'

// Shared layout + hit-testing for the in-screen OS. Everything is expressed in
// OS-plane units so pointer, touch and keyboard all resolve to the same result.
export const FOLDER_POS = { x: -2.15, y: 1.55 }
export const FOLDER_HIT_RADIUS = 0.5
export const CLOSE_BTN = { x: 2.2, y: 1.5 }
export const CLOSE_HIT_RADIUS = 0.2

export const GRID_COLS = 3
export const PAGE_SIZE = 6
export const CELL_W = 1.5
export const CELL_H = 1.2

export function cellPosition(i) {
  const row = Math.floor(i / GRID_COLS)
  const col = i % GRID_COLS
  return { x: -1.5 + col * CELL_W, y: 0.6 - row * CELL_H }
}

/** Pointer position in OS units from the normalised [-1, 1] cursor. */
export function cursorToOS(cursor) {
  return { x: cursor.x * (SCREEN_WIDTH / 2), y: cursor.y * (SCREEN_HEIGHT / 2) }
}

/** Index (within the page) of the cell under `p`, or -1. */
export function cellAt(p, count, slack = 0) {
  for (let i = 0; i < Math.min(count, PAGE_SIZE); i++) {
    const c = cellPosition(i)
    if (Math.abs(p.x - c.x) < 0.62 + slack && Math.abs(p.y - c.y) < 0.5 + slack) return i
  }
  return -1
}

export function overClose(p, slack = 0) {
  return Math.hypot(p.x - CLOSE_BTN.x, p.y - CLOSE_BTN.y) < CLOSE_HIT_RADIUS + slack
}

export function overFolder(p) {
  return Math.abs(p.x - FOLDER_POS.x) < FOLDER_HIT_RADIUS && Math.abs(p.y - FOLDER_POS.y) < FOLDER_HIT_RADIUS
}

export const PHOTO_EDGE = SCREEN_WIDTH * 0.16 // prev/next click zones in photo view

// Pager row at the bottom of the My Pictures window.
export const PAGER_Y = -1.5
export const PAGER_PREV = { x: -1.9, y: PAGER_Y }
export const PAGER_NEXT = { x: 1.9, y: PAGER_Y }
export const PAGER_HIT = { w: 0.7, h: 0.28 }

export function overPager(p, which) {
  const b = which < 0 ? PAGER_PREV : PAGER_NEXT
  return Math.abs(p.x - b.x) < PAGER_HIT.w && Math.abs(p.y - b.y) < PAGER_HIT.h
}
