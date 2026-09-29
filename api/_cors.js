/**
 * CORS utility for Vercel serverless functions.
 * Restricts origins to the deployment URL and localhost dev server.
 */

function getAllowedOrigin(req) {
    const origin = req.headers.origin ?? ''
    const allowed = new Set([
        'http://localhost:5173',
        'http://localhost:3000',
        process.env.APP_URL,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
        process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    ].filter(Boolean))
    return allowed.has(origin) ? origin : null
}

/**
 * Sets CORS headers and handles OPTIONS preflight.
 * @returns {boolean} true if the request was a preflight and is fully handled.
 */
export function handleCors(req, res) {
    const origin = getAllowedOrigin(req)
    res.setHeader('Vary', 'Origin')
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    if (req.method === 'OPTIONS') {
        res.status(200).end()
        return true
    }
    return false
}
