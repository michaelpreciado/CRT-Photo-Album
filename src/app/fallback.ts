import { Album } from './album'

/** Plain, accessible album for browsers without WebGL2. */
export function startFallback(host: HTMLElement) {
  host.innerHTML = `
    <main class="fallback">
      <header><h1>CRT <em>Album</em></h1>
      <p>Your browser can't run the 3D room, so here is the album on its own.</p>
      <label class="pill add">Add photos<input type="file" accept="image/*" multiple hidden></label></header>
      <p class="toast" role="status" aria-live="polite"></p>
      <ul class="grid"></ul>
    </main>`
  const grid = host.querySelector('.grid')!
  const toast = host.querySelector('.fallback .toast') as HTMLElement
  const render = (urls: string[]) => {
    grid.innerHTML = urls
      .map((u, i) => `<li><a href="${encodeURI(u)}" target="_blank" rel="noopener"><img src="${encodeURI(u)}" alt="Photo ${i + 1}" loading="lazy"></a></li>`)
      .join('')
  }
  const album = new Album({
    images: render,
    added: () => render(album.urls),
    progress: (p) => (toast.textContent = p ? `Uploading ${p.done}/${p.total}` : ''),
    notice: (n) => (toast.textContent = n.text),
  })
  host.querySelector('input')!.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement
    if (input.files) album.upload(input.files)
  })
  album.load()
}
