import { getUserFromSession } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Return non-sensitive fields
  return res.status(200).json({
    user: {
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      profile_image_url: user.profile_image_url
    }
  });
}
