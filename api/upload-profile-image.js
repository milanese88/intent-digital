import { handleUpload } from '@vercel/blob/client';
import { neon } from '@neondatabase/serverless';
import cookie from 'cookie';
const { parse } = cookie;
import crypto from 'crypto';

async function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: typeof req.body === 'string' ? JSON.parse(req.body) : req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Authenticate
        const cookies = parse(req.headers.cookie || '');
        const sessionCookie = cookies['auth_session'];
        if (!sessionCookie) throw new Error('Unauthorized');

        const sql = neon(process.env.DATABASE_URL);
        const tokenHash = await hashToken(sessionCookie);

        const sessions = await sql`
          SELECT user_id, expires_at FROM sessions WHERE token_hash = ${tokenHash} LIMIT 1
        `;

        if (sessions.length === 0 || new Date(sessions[0].expires_at) < new Date()) {
          throw new Error('Unauthorized');
        }

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          tokenPayload: JSON.stringify({ userId: sessions[0].user_id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Update database using the payload we passed
        const payload = JSON.parse(tokenPayload);
        const sql = neon(process.env.DATABASE_URL);
        await sql`
          UPDATE admin_user SET profile_image_url = ${blob.url}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${payload.userId}
        `;
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Error in upload-profile-image:', error);
    return res.status(400).json({ error: error.message });
  }
}
