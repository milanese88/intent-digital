import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const config = {
  matcher: ['/dashboard/:path*'] // Only run on dashboard routes
};

async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export default async function middleware(request) {
  // Try to get auth_session cookie
  let sessionCookie;
  
  // Handling different possible request object structures (Next.js Request vs raw Request)
  if (typeof request.cookies?.get === 'function') {
    const cookieObj = request.cookies.get('auth_session');
    sessionCookie = cookieObj?.value;
  } else if (request.headers.get('cookie')) {
    const cookies = request.headers.get('cookie').split(';').reduce((acc, c) => {
      const [key, val] = c.trim().split('=');
      acc[key] = val;
      return acc;
    }, {});
    sessionCookie = cookies['auth_session'];
  }

  const loginUrl = new URL('/login', request.url);

  if (!sessionCookie) {
    return NextResponse.redirect(loginUrl, 307);
  }

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('DATABASE_URL is not set in middleware');
      return NextResponse.redirect(loginUrl, 307);
    }

    const sql = neon(databaseUrl);
    const tokenHash = await hashToken(sessionCookie);

    const sessions = await sql`
      SELECT id, expires_at FROM sessions 
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;

    if (sessions.length === 0) {
      return NextResponse.redirect(loginUrl, 307);
    }

    const session = sessions[0];
    const now = new Date();

    if (new Date(session.expires_at) < now) {
      // Session expired, theoretically we could delete it, but let's just deny access
      return NextResponse.redirect(loginUrl, 307);
    }

    // Session is valid
    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error validating session:', error);
    // On DB error, safer to deny access
    return NextResponse.redirect(loginUrl, 307);
  }
}
