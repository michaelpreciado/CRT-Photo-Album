// Tiny 2D-canvas glyph rain used behind the boot overlay. Cheap: one canvas,
// ~20fps, stops when the overlay unmounts.
export function startGlyphRain(canvas) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const glyphs = 'アイウエオカキクケコ01ABCDEF<>/{}=+*'.split('')
  const size = 16
  let cols = 0
  let drops = []
  const resize = () => {
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    cols = Math.ceil(canvas.width / size)
    drops = Array.from({ length: cols }, () => Math.random() * -40)
  }
  resize()
  window.addEventListener('resize', resize)
  let raf
  let last = 0
  const tick = (t) => {
    raf = requestAnimationFrame(tick)
    if (t - last < 50) return
    last = t
    ctx.fillStyle = 'rgba(4,6,10,0.14)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = `${size}px monospace`
    for (let i = 0; i < cols; i++) {
      const y = drops[i] * size
      ctx.fillStyle = Math.random() > 0.96 ? '#e9f2f7' : i % 5 ? '#2ba7c4' : '#5ce1f2'
      ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y)
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0
      drops[i] += 1
    }
  }
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
  }
}
