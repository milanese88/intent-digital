import { handleUpload } from '@vercel/blob/client';
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
        // We do not save to a specific database record here because the client
        // will take the returned URL and include it in their blog post payload.
        console.log('Blog cover image uploaded:', blob.url);
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Error in upload-blog-image:', error);
    return res.status(400).json({ error: error.message });
  }
}
