import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { slug } = req.query;

    if (slug) {
      // Fetch a specific published post by slug
      const posts = await sql`
        SELECT id, title, slug, excerpt, content, cover_image_url, published_at
        FROM blog_posts
        WHERE slug = ${slug} AND status = 'published'
      `;
      if (!posts.length) {
        return res.status(404).json({ error: 'Not found or not published' });
      }
      return res.status(200).json(posts[0]);
    } else {
      // Fetch all published posts (excluding content for list view)
      const posts = await sql`
        SELECT id, title, slug, excerpt, cover_image_url, published_at
        FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC
      `;
      return res.status(200).json(posts);
    }
  } catch (error) {
    console.error('News API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
