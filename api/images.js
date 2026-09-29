import { sql } from '@vercel/postgres'
import { handleCors } from './_cors.js'

export default async function handler(req, res) {
    if (handleCors(req, res)) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { rows } = await sql`
            SELECT id, url, filename, uploaded_at
            FROM images
            ORDER BY uploaded_at DESC
            LIMIT 500
        `
        res.setHeader('Cache-Control', 'no-store')
        return res.status(200).json({ success: true, images: rows })
    } catch (error) {
        console.error('Fetch error:', error)

        if (String(error?.message).includes('does not exist')) {
            return res.status(200).json({ success: true, images: [], needsInit: true })
        }

        return res.status(500).json({ error: 'Failed to fetch images' })
    }
}
