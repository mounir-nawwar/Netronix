// Upload handling (SEC-008).
//
// What this replaces:
//
//     const storage = multer.diskStorage({
//         filename: (req, file, cb) => cb(null, file.originalname)
//     })
//     const upload = multer({ storage })
//
// Three separate problems in five lines. The client's filename became the name
// of a file on the server's disk, so `../../etc/passwd` was a traversal
// attempt. No `destination` was set, so multer wrote into `os.tmpdir()`. There
// was no `fileFilter` and no `limits`, so any MIME type and any size was
// accepted — and `addProduct` uploaded the temp file to Cloudinary and never
// unlinked it.
//
// Memory storage removes all of it at once. A buffer has no name, so there is
// no path to traverse; nothing touches the filesystem, so there is no temp file
// to leak and no ephemeral-disk limit to exhaust on a serverless host; and the
// buffer streams straight to Cloudinary.

import multer from 'multer'

/** 5 MiB per image. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Four images per product — the four fields the form actually offers. */
export const MAX_FILES = 4

/**
 * Accepted image types.
 *
 * Checked against the declared MIME type, which a client controls, so this is
 * a first filter rather than a guarantee. The real guarantee is downstream:
 * Cloudinary is asked for `resource_type: 'image'` and rejects anything that is
 * not one. What the allowlist buys is that a 5 MB PDF is refused *here*, before
 * it is sent to a paid third-party service.
 */
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const fileFilter = (req, file, callback) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return callback(null, true)

    // A `MulterError` rather than a bare Error, so the central handler maps it
    // to a 400 with a client-safe sentence instead of a 500.
    const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname)
    error.message = 'Only PNG, JPEG and WebP images are accepted'
    callback(error)
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_BYTES,
        files: MAX_FILES,
        fields: 20,
        parts: 30,
    },
    fileFilter,
})

/** Verify enough container structure to reject magic-prefix spoofing. */
function isPng(buffer) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return false
    let offset = 8
    let sawHeader = false
    let sawData = false
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset)
        const end = offset + 12 + length
        if (end > buffer.length) return false
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
        if (!sawHeader && (type !== 'IHDR' || length !== 13)) return false
        if (type === 'IHDR') sawHeader = true
        if (type === 'IDAT') sawData = true
        if (type === 'IEND') return length === 0 && sawHeader && sawData
        offset = end
    }
    return false
}

function isJpeg(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return false
    // A complete JPEG ends at EOI. Requiring both boundaries rejects a claimed
    // JPEG that is only the three-byte magic prefix plus arbitrary content;
    // the image provider remains the final decoder.
    return buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9
}

function isWebp(buffer) {
    if (buffer.length < 20
        || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
        || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return false
    const declaredEnd = buffer.readUInt32LE(4) + 8
    const chunkType = buffer.subarray(12, 16).toString('ascii')
    const chunkEnd = 20 + buffer.readUInt32LE(16)
    return declaredEnd <= buffer.length
        && chunkEnd <= declaredEnd
        && ['VP8 ', 'VP8L', 'VP8X'].includes(chunkType)
}

function hasImageStructure(buffer) {
    return Buffer.isBuffer(buffer) && (isPng(buffer) || isJpeg(buffer) || isWebp(buffer))
}

export function validateImageContent(req, _res, next) {
    const files = Object.values(req.files ?? {}).flat()
    const invalid = files.find((file) => !hasImageStructure(file.buffer))
    if (!invalid) return next()
    const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', invalid.fieldname)
    error.message = 'Uploaded content is not a supported image'
    return next(error)
}

export default upload
