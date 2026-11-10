import { getUserFromSession } from '../_lib/session.js';
import { put } from '@vercel/blob';
import crypto from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Strips EXIF APP1 metadata (GPS, camera/device info) from JPEG buffers.
 */
function stripJpegExif(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return buffer;
  }
  const chunks = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    if (marker === 0xDA || marker === 0xD9) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xE1) {
      // Exclude APP1 segment
    } else {
      chunks.push(buffer.subarray(offset, offset + 2 + length));
    }
    offset += 2 + length;
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { fileBase64, contentType } = req.body || {};
    if (!fileBase64) {
      return res.status(400).json({ error: 'fileBase64 is required' });
    }

    let buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'Image exceeds maximum 10 MB limit' });
    }

    const rawMime = String(contentType || 'image/jpeg').toLowerCase();
    if (!rawMime.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are accepted' });
    }

    // Metadata stripping
    buffer = stripJpegExif(buffer);

    // Random unguessable path: 24 random hex bytes (48 chars)
    const randomName = crypto.randomBytes(24).toString('hex');
    const pathname = `journal/inspiration/${randomName}.jpg`;

    const blob = await put(pathname, buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'image/jpeg'
    });

    return res.status(200).json({
      url: blob.url,
      filename: `${randomName}.jpg`,
      size: buffer.length
    });
  } catch (error) {
    console.error('Error uploading inspiration image:', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
