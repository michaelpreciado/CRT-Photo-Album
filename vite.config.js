import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react(), injectSiteUrl()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // three is shared by the lazy scene chunk and the lazy exporter, so it
        // gets its own long-cacheable file; everything else follows the
        // dynamic imports (entry = React + UI, scene = R3F/drei/troika).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/three\//.test(id)) return 'three'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
})
