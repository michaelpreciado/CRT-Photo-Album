# CRT Interactive Album

A 3D photo album inside a glowing CRT monitor, in a matrix-blue glass room. Upload photos, browse them in a retro "My Pictures" window, zoom in, and export any photo as a PNG with the CRT look baked in.

Built by Michael Preciado / Preciado Tech. React 19, React Three Fiber, Three.js, Vite. Deploys to Vercel (Postgres for metadata, Blob for files).

![React](https://img.shields.io/badge/React-19-61dafb) ![Three.js](https://img.shields.io/badge/Three.js-0.181-black) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## Highlights

- **CRT shader** in a single pass: barrel curvature, aperture-grille phosphor triads, scanlines, 8-tap halation glow, chromatic aberration, interference, grain, flicker and a power-on collapse/expand.
- **Glass room**: procedural studio reflections (no HDR download), curved glass over the tube with soft-box and rim reflections, screen light spilling on the desk, dust motes drifting in the glow, a matrix glyph field, cursor-reactive lighting.
- **Boot and power-on**: boot log, then the tube warms up with a bright line that unrolls into the desktop.
- **Windowing**: the My Pictures window pops open with a small overshoot and shrinks away on close.
- **Gallery**: paged grid (6 per page), keyboard focus ring, swipe to change page, per-image loading placeholders and error tiles.
- **Photo viewer**: eased wheel / pinch / keyboard zoom anchored on the pointer, drag to pan, swipe or arrows to browse, on-screen prev/next zones, DOM toolbar for accessibility.
- **Save with CRT effect**: full-resolution offscreen render of the shader, downloaded as PNG.
- **Sound (optional)**: WebAudio-synthesised power-on, clicks and hum. Muted by default; the toggle (top right) remembers your choice.
- **Resilient**: error boundary, WebGL-unavailable fallback (a plain accessible album with lightbox), GL context-loss notice, reduced-motion support, mobile layout.

## Controls

| Where | Mouse | Touch | Keyboard |
| --- | --- | --- | --- |
| Desktop | Click the folder; drag to orbit | Tap the folder; drag to orbit | `Enter` / `O` opens My Pictures |
| Gallery | Click a photo, `< prev` / `next >` | Tap a photo, swipe left/right for pages | Arrows move focus, `Enter` opens, `PageUp`/`PageDown` or `[` `]` change page, `Home`/`End`, `Esc` closes |
| Photo | Wheel zoom, drag pan, click to go back, click screen edges for prev/next | Pinch zoom, drag pan, swipe to browse, tap to go back | `Left`/`Right` browse (pan when zoomed), `+` `-` zoom, `0` reset, `S` save, `Esc` back |

Drag and drop images anywhere on the page to upload them.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run build      # production build in dist/
npm run preview
```

Without the API the app still works: it shows sample photos and keeps uploads in memory for the session.

### With the database and storage (optional)

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
npm run vercel-dev # serves the app and /api together
```

### URL parameters

- `?quality=low|medium|high` pins the render quality tier (default: adaptive).

## Performance

What was done, and the numbers behind it.

**Bundle / loading**

| | Before | After |
| --- | --- | --- |
| JS on the critical path (raw / gzip) | ~1.29 MB / ~381 KB | ~224 KB / ~72 KB (+3 KB CSS) |
| 3D stack | in the entry path | lazy chunks (`SceneCanvas` 397 KB + `three` 719 KB raw), fetched in parallel while the boot screen plays |
| Exporter | in the entry path | lazy, loaded on first "Save" |
| Dependencies | `postprocessing` (unused), `styled-components` | both removed; UI is plain CSS |

**Render cost**

- One draw call for the CRT screen and one for the wallpaper; about 30 draw calls in total.
- Adaptive quality via drei `PerformanceMonitor` steps between three tiers (render scale, OS render-target size 1216x1024 / 1024x862 / 768x646, MSAA 4 / 2 / 0, shadows, dust motes, reflections, glow taps). Touch devices start at the middle tier.
- Shadow map is re-rendered every 6th frame; contact shadows are baked once; the reflection cube map is rendered once.
- The pointer is written to a mutable store and read in `useFrame`, so pointer movement never re-renders React. Upload UI state lives outside the 3D tree.
- Frame deltas are clamped so a hitch never skips an animation.

**Textures**

- Photos are downscaled on a 2D canvas before upload to the GPU: 512 px for gallery thumbnails, 2048 px for the viewer, with mipmaps and anisotropic filtering.
- Textures are cached and reference-counted; unused ones are disposed after a few seconds so large albums stay flat in memory.
- Uploads are resized client-side (max 2560 px, WebP/JPEG) so phone photos stay under serverless body limits.

## Accessibility and motion

- `prefers-reduced-motion`: no camera flights, no window animation, frozen glyph rain, dust and wallpaper, no flicker or interference, instant power-on.
- All controls have DOM equivalents (photo toolbar, hint bar, screen-reader announcements); focus rings are visible.
- If WebGL is unavailable or the scene crashes, a 2D album with a keyboard-friendly lightbox takes over.

## API

All routes are Vercel serverless functions in `api/`. The contract is unchanged; errors are now consistent JSON: `{ "success": false, "code": "...", "error": "human readable" }`.

| Route | Description |
| --- | --- |
| `GET /api/images` | List images (newest first, max 500). Returns `needsInit: true` if the table does not exist yet. |
| `POST /api/upload` | Body `{ image: "data:image/...;base64,...", filename }`. Returns `{ success: true, url }`. |
| `POST /api/init-db` | Create the table and seed sample images (protect with `INIT_SECRET`). |

Upload validation: 400 `no_image` / `bad_body` / `empty`, 413 `too_large` (over 10 MB decoded), 415 `unsupported_type` / `signature_mismatch` (magic bytes must match the declared type), 502 `storage_failed`, 500 `db_failed` (the uploaded blob is deleted so nothing is orphaned). Blob names get a random suffix so identical filenames never collide.

Note: Vercel caps request bodies at about 4.5 MB. The web client resizes large images before sending; direct API users should stay under that.

## Configuration

Copy `.env.example`. Vercel Postgres and Blob variables are set automatically when attached.

| Variable | Purpose |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access |
| `POSTGRES_*` | Vercel Postgres |
| `APP_URL` | Extra allowed CORS origin |
| `INIT_SECRET` | Require `X-Init-Secret` on `/api/init-db` |
| `VITE_SITE_URL` | Absolute site URL for canonical / Open Graph tags (falls back to Vercel's production URL) |

## Project structure

```
api/                  Serverless routes (upload, images, init-db, CORS)
public/               Icons, manifest, OG image, pixel font
src/
  App.jsx             Shell: boot, lazy scene, error boundary, UI
  hooks/              useAlbum (data + upload flow), useReducedMotion
  store/              Zustand store (view mode, paging, focus, photo zoom)
  components/
    SceneCanvas.jsx   Canvas, adaptive quality, input bridge (keys, wheel, pinch)
    Scene.jsx         Camera rig, lighting, reflections, room
    CRTMonitor.jsx    Monitor, screen material, power-on
    ScreenGlass.jsx   Curved glass reflections
    DustMotes.jsx, GlyphField.jsx, GlowPlane.jsx
    OS/               In-screen desktop, window, photo viewer, layout + hit testing
    shaders/          CRT shader (also used by the exporter)
    ui/               Upload card, hint bar, photo toolbar, sound toggle
  utils/              textures, upload, sound, export, webgl detection
```

## Icons, meta and PWA

`public/` ships an SVG favicon, 192/512 PNG icons, a maskable icon, an Apple touch icon, a web manifest and a 1200x630 Open Graph image (a capture of the scene). `index.html` carries Open Graph and Twitter tags; the site URL is injected at build time (see `VITE_SITE_URL`).

## License

MIT
