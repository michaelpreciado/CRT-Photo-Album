import { BufferGeometry, Float32BufferAttribute, Shape, Vector2 } from 'three'

/** Points around a rounded rectangle (counter-clockwise), `seg` per corner. */
export function roundedRectPoints(w: number, h: number, r: number, seg: number): Vector2[] {
  const pts: Vector2[] = []
  const hw = w / 2
  const hh = h / 2
  r = Math.min(r, hw, hh)
  const corners: [number, number, number][] = [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
    [hw - r, -hh + r, (3 * Math.PI) / 2],
  ]
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push(new Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
    }
  }
  return pts
}

export function roundedRectShape(w: number, h: number, r: number, seg = 8, ox = 0, oy = 0): Shape {
  const pts = roundedRectPoints(w, h, r, seg).map((p) => p.add(new Vector2(ox, oy)))
  return new Shape(pts)
}

export interface LoftRing {
  w: number
  h: number
  r: number
  z: number
  y?: number
}

/**
 * Lofts a rounded rectangle through a series of rings (along -z) and caps the
 * last ring. Used for the tapered CRT housing: a boxy front section that
 * narrows toward the electron-gun neck.
 */
export function loftRoundedRect(rings: LoftRing[], seg = 6, capBack = true): BufferGeometry {
  const profiles = rings.map((ring) => roundedRectPoints(ring.w, ring.h, ring.r, seg))
  const n = profiles[0].length
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  // arc-length u coordinate from the first ring
  const arc: number[] = [0]
  for (let i = 1; i <= n; i++) arc.push(arc[i - 1] + profiles[0][i % n].distanceTo(profiles[0][i - 1]))
  const total = arc[n]
  rings.forEach((ring, ri) => {
    for (let i = 0; i <= n; i++) {
      const p = profiles[ri][i % n]
      pos.push(p.x, p.y + (ring.y ?? 0), ring.z)
      uv.push((arc[i] / total) * 4, ri / (rings.length - 1))
    }
  })
  const stride = n + 1
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let i = 0; i < n; i++) {
      const a = ri * stride + i
      const b = a + 1
      const c = a + stride
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  const geo = new BufferGeometry()
  if (capBack) {
    const last = rings[rings.length - 1]
    const center = pos.length / 3
    pos.push(0, last.y ?? 0, last.z)
    uv.push(0.5, 1)
    const start = pos.length / 3
    for (let i = 0; i < n; i++) {
      const p = profiles[rings.length - 1][i]
      pos.push(p.x, p.y + (last.y ?? 0), last.z)
      uv.push(p.x * 2 + 0.5, p.y * 2 + 0.5)
    }
    for (let i = 0; i < n; i++) idx.push(center, start + ((i + 1) % n), start + i)
  }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}
