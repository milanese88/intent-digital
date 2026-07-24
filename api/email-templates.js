import { getUserFromSession } from './_lib/session.js';
import { getDb } from './_lib/db.js';

export default async function handler(req, res) {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql = getDb();

  if (req.method === 'GET') {
    try {
      const templates = await sql`
        SELECT id, name, category, subject, body, is_active, created_at, updated_at
        FROM email_templates
        ORDER BY category ASC, name ASC
      `;
      return res.status(200).json({ templates });
    } catch (error) {
      console.error('Error fetching email templates:', error);
      return res.status(500).json({ error: 'Server error fetching templates' });
    }
  }

  if (req.method === 'POST') {
    const { action, id, name, subject, body, category } = req.body;

    if (!action || !id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      if (action === 'save') {
        await sql`
          UPDATE email_templates
          SET name = ${name}, subject = ${subject}, body = ${body}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id}
        `;
        return res.status(200).json({ success: true });
      }

      if (action === 'activate') {
        if (!category) {
          return res.status(400).json({ error: 'Category required for activation' });
        }
        
        // Execute both queries in a transaction
        await sql.transaction([
          sql`UPDATE email_templates SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE category = ${category}`,
          sql`UPDATE email_templates SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
        ]);
        
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      console.error(`Error performing action ${action} on templates:`, error);
      return res.status(500).json({ error: 'Server error updating template' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
