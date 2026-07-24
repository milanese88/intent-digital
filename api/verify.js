import { getUserFromSession } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = await getUserFromSession(req);

  if (user) {
    // Return only safe fields
    const { id, email, username, full_name, profile_image_url } = user;
    return res.status(200).json({ 
      loggedIn: true, 
      user: { id, email, username, full_name, profile_image_url } 
    });
  } else {
    return res.status(401).json({ loggedIn: false });
  }
}
