import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Validate cron secret
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    const result = await sql`
      UPDATE blog_posts 
      SET status = 'published', 
          published_at = COALESCE(published_at, scheduled_for),
          scheduled_for = NULL
      WHERE status = 'scheduled' AND scheduled_for <= CURRENT_TIMESTAMP
      RETURNING id
    `;

    return res.status(200).json({ published_count: result.length });
  } catch (error) {
    console.error('Publish Scheduled Cron Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
