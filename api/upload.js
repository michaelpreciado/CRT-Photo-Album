import { put, del } from '@vercel/blob'
import { sql } from '@vercel/postgres'
import { handleCors } from './_cors.js'

// Vercel Functions cap request bodies at ~4.5 MB. The web client downsizes
// large photos before sending; the limits below are the server-side backstop.
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
}

const MAX_BYTES = 10 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
])

/** Error helper — every failure returns { error, code } with a useful status. */
function fail(res, status, code, error) {
    return res.status(status).json({ success: false, code, error })
}

function parseDataUrl(value) {
    if (typeof value !== 'string') return null
    const match = value.match(/^data:(image\/[\w+.-]+);base64,/)
    if (!match) return null
    const mimeType = match[1].toLowerCase()
    if (!ALLOWED_MIME_TYPES.has(mimeType)) return null
    return { mimeType, base64: value.slice(match[0].length) }
}

/** Confirm the bytes really are the image type that was claimed. */
function matchesSignature(mimeType, buf) {
    if (buf.length < 12) return false
    const ascii = (start, end) => buf.toString('latin1', start, end)
    switch (mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
        case 'image/png':
            return buf[0] === 0x89 && ascii(1, 4) === 'PNG'
        case 'image/gif':
            return ascii(0, 4) === 'GIF8'
        case 'image/webp':
            return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
        case 'image/avif':
            return ascii(4, 8) === 'ftyp' && /avif|avis|mif1|msf1/.test(ascii(8, 32))
        default:
            return false
    }
}

const EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
}

function safeName(filename, mimeType) {
    const fallback = `image-${Date.now()}.${EXTENSIONS[mimeType]}`
    if (typeof filename !== 'string' || !filename.trim()) return fallback
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 100) || fallback
}

export default async function handler(req, res) {
    if (handleCors(req, res)) return

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS')
        return fail(res, 405, 'method_not_allowed', 'Method not allowed')
    }

    const body = req.body
    if (!body || typeof body !== 'object') {
        return fail(res, 400, 'bad_body', 'Expected a JSON body with an "image" data URL')
    }

    const { image, filename } = body
    if (!image) {
        return fail(res, 400, 'no_image', 'No image provided')
    }

    const parsed = parseDataUrl(image)
    if (!parsed) {
        return fail(res, 415, 'unsupported_type', 'Invalid or unsupported image format (use JPG, PNG, GIF, WebP or AVIF)')
    }

    const buffer = Buffer.from(parsed.base64, 'base64')
    if (buffer.length === 0) {
        return fail(res, 400, 'empty', 'The image is empty')
    }
    if (buffer.length > MAX_BYTES) {
        return fail(res, 413, 'too_large', 'Image exceeds the 10 MB limit')
    }
    if (!matchesSignature(parsed.mimeType, buffer)) {
        return fail(res, 415, 'signature_mismatch', 'File contents do not match the declared image type')
    }

    const name = safeName(filename, parsed.mimeType)

    let blob
    try {
        blob = await put(name, buffer, {
            access: 'public',
            contentType: parsed.mimeType,
            addRandomSuffix: true, // same filename twice must not collide
        })
    } catch (error) {
        console.error('Blob upload error:', error)
        return fail(res, 502, 'storage_failed', 'Could not store the image')
    }

    try {
        await sql`
            INSERT INTO images (url, filename, uploaded_at)
            VALUES (${blob.url}, ${name}, NOW())
        `
    } catch (error) {
        console.error('Database insert error:', error)
        // Don't leave an orphaned blob behind.
        await del(blob.url).catch(() => {})
        return fail(res, 500, 'db_failed', 'Could not save the image record')
    }

    return res.status(200).json({ success: true, url: blob.url })
}
