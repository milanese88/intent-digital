import { getUserFromSession } from '../_lib/session.js';
import {
  isPinterestHost,
  resolvePinterestShortLink,
  validateAndParsePinterestBoardUrl
} from '../../src/utils/pinterest.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const rawUrl = req.method === 'POST' ? req.body?.url : req.query?.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'Please enter a Pinterest URL to resolve.' });
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Please enter a Pinterest URL to resolve.' });
    }

    // Verify initial hostname is Pinterest or pin.it
    let initialHost = '';
    try {
      const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
      initialHost = new URL(withProto).hostname.toLowerCase();
    } catch {
      return res.status(400).json({ error: 'Please enter a valid URL.' });
    }

    if (!isPinterestHost(initialHost)) {
      return res.status(400).json({
        error: 'This is not a Pinterest link. Please provide a pinterest.com or pin.it link.'
      });
    }

    // Resolve redirect manually (Location header only, no scraping)
    const resolvedUrl = await resolvePinterestShortLink(trimmed);
    if (!resolvedUrl) {
      return res.status(400).json({
        error: 'Could not resolve Pinterest short link. Please provide the full board URL.'
      });
    }

    // Validate the resolved URL
    const parsed = validateAndParsePinterestBoardUrl(resolvedUrl);
    if (!parsed.valid) {
      return res.status(400).json({
        error: parsed.error || 'The resolved link is not a valid Pinterest board.',
        resolvedUrl
      });
    }

    return res.status(200).json({
      success: true,
      originalUrl: trimmed,
      resolvedUrl,
      normalizedUrl: parsed.normalizedUrl,
      kind: parsed.kind || 'board',
      user: parsed.user,
      board: parsed.board,
      section: parsed.section
    });
  } catch (error) {
    console.error('Error in /api/designer/pinterest-resolve:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
