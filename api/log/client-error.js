/**
 * api/log/client-error.js
 *
 * Receives client-side React error-boundary reports and writes them to the server log.
 * Accepts only bounded technical fields (section, message, stacks, path) — no property
 * or owner data is stored anywhere; nothing is written to the database.
 */

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const entry = {
      section: clip(body.section, 80),
      message: clip(body.message, 500),
      stack: clip(body.stack, 4000),
      componentStack: clip(body.componentStack, 4000),
      url: clip(body.url, 200),
      at: clip(body.at, 40)
    };
    console.error('[client-error]', JSON.stringify(entry));
    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
}

