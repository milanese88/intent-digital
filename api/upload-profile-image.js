import { handleUpload } from '@vercel/blob/client';
import { neon } from '@neondatabase/serverless';
import { getUserFromSession } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: typeof req.body === 'string' ? JSON.parse(req.body) : req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Authenticate using the standard session validation
        const user = await getUserFromSession(req);
        if (!user) throw new Error('Unauthorized');

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          tokenPayload: JSON.stringify({ userId: user.id }),
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
