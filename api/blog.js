import { neon } from '@neondatabase/serverless';
import { getUserFromSession } from './_lib/session.js';

const generateSlug = (title) => {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Strip accents
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumerics with hyphens
    .replace(/-+/g, '-') // Collapse repeats
    .replace(/^-|-$/g, ''); // Trim
};

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const sql = neon(process.env.DATABASE_URL);
    const { action } = req.method === 'GET' ? req.query : req.body;

    if (req.method === 'GET') {
      if (req.query.id) {
        const posts = await sql`SELECT * FROM blog_posts WHERE id = ${req.query.id}`;
        if (!posts.length) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(posts[0]);
      } else {
        const posts = await sql`SELECT * FROM blog_posts ORDER BY created_at DESC`;
        return res.status(200).json(posts);
      }
    }

    if (req.method === 'POST') {
      if (action === 'create') {
        const posts = await sql`
          INSERT INTO blog_posts (title, status, created_at, updated_at) 
          VALUES ('Untitled Draft', 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
          RETURNING *
        `;
        return res.status(200).json(posts[0]);
      }

      if (action === 'update') {
        const { id, title, excerpt, content, cover_image_url } = req.body;
        
        let baseSlug = generateSlug(title || 'untitled-draft');
        if (!baseSlug) baseSlug = 'untitled-draft';

        let slug = baseSlug;
        let counter = 1;
        let success = false;
        let updatedPost = null;

        // Retry loop for unique constraint violation on slug
        while (!success && counter < 100) {
          try {
            const posts = await sql`
              UPDATE blog_posts 
              SET title = ${title}, 
                  slug = ${slug}, 
                  excerpt = ${excerpt}, 
                  content = ${content}, 
                  cover_image_url = ${cover_image_url}, 
                  updated_at = CURRENT_TIMESTAMP 
              WHERE id = ${id} 
              RETURNING *
            `;
            if (posts.length) {
              updatedPost = posts[0];
              success = true;
            } else {
              throw new Error('Post not found');
            }
          } catch (err) {
            // Check if it's a unique constraint violation on slug (Postgres error code 23505)
            // Wait, for neon serverless the error code is exposed as err.code.
            if (err.code === '23505' && err.message.includes('slug')) {
              counter++;
              slug = `${baseSlug}-${counter}`;
            } else {
              throw err;
            }
          }
        }

        if (!success) throw new Error('Failed to generate a unique slug');
        return res.status(200).json(updatedPost);
      }

      if (action === 'publish') {
        const { id } = req.body;
        // Sets status to 'published' and published_at = now() if it is currently null
        // Clears scheduled_for when forcing publish
        const posts = await sql`
          UPDATE blog_posts 
          SET status = 'published', 
              published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
              scheduled_for = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id}
          RETURNING *
        `;
        return res.status(200).json(posts[0]);
      }

      if (action === 'schedule') {
        const { id, scheduled_for } = req.body;
        if (!scheduled_for || new Date(scheduled_for) <= new Date()) {
          return res.status(400).json({ error: 'Scheduled time must be in the future.' });
        }
        
        const posts = await sql`
          UPDATE blog_posts 
          SET status = 'scheduled',
              scheduled_for = ${scheduled_for},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id}
          RETURNING *
        `;
        return res.status(200).json(posts[0]);
      }

      if (action === 'unschedule') {
        const { id } = req.body;
        const posts = await sql`
          UPDATE blog_posts 
          SET status = 'draft',
              scheduled_for = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id}
          RETURNING *
        `;
        return res.status(200).json(posts[0]);
      }

      if (action === 'unpublish') {
        const { id } = req.body;
        const posts = await sql`
          UPDATE blog_posts 
          SET status = 'draft',
              scheduled_for = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id}
          RETURNING *
        `;
        return res.status(200).json(posts[0]);
      }
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`DELETE FROM blog_posts WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Blog API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
