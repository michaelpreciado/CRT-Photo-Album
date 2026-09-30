import { defineConfig } from 'vite'

// Absolute URLs are required for og:image / canonical. Prefer an explicit
// VITE_SITE_URL, else the Vercel-provided production/deployment host, else
// fall back to root-relative paths (fine for local previews).
function siteUrl(env) {
  if (env.VITE_SITE_URL) return env.VITE_SITE_URL.replace(/\/$/, '')
  const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
  return host ? `https://${host}` : ''
}

const injectSiteUrl = () => ({
  name: 'inject-site-url',
  transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl(process.env)),
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [injectSiteUrl()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // three gets its own long-cacheable chunk; the entry (intro + UI)
        // stays tiny and paints while the 3D stack downloads.
        manualChunks(id) {
          if (/node_modules\/three\//.test(id)) return 'three'
        },
      },
    },
  },
})
