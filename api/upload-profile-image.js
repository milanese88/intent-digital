import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  // Authenticate edge request manually
  let sessionCookie;
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, c) => {
      const [key, val] = c.trim().split('=');
      acc[key] = val;
      return acc;
    }, {});
    sessionCookie = cookies['auth_session'];
  }

  if (!sessionCookie) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const tokenHash = await hashToken(sessionCookie);

    const sessions = await sql`
      SELECT user_id, expires_at FROM sessions WHERE token_hash = ${tokenHash} LIMIT 1
    `;

    if (sessions.length === 0 || new Date(sessions[0].expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const userId = sessions[0].user_id;

    // Parse the file
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(file.name, file, { 
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // Update DB
    await sql`
      UPDATE admin_user SET profile_image_url = ${blob.url}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
    `;

    return new Response(JSON.stringify({ url: blob.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return new Response(JSON.stringify({ error: 'Server error during upload' }), { status: 500 });
  }
}
