import { parse } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const cookies = parse(req.headers.cookie || '');
  const session = cookies.auth_session;

  if (session === 'authenticated') {
    return res.status(200).json({ loggedIn: true });
  } else {
    return res.status(401).json({ loggedIn: false });
  }
}
