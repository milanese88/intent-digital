export const config = {
  matcher: ['/dashboard/:path*'] // Only run on dashboard routes
};

export default async function middleware(request) {
  // Try to get auth_session cookie
  let sessionCookie;
  
  if (request.headers.get('cookie')) {
    const cookies = request.headers.get('cookie').split(';').reduce((acc, c) => {
      const [key, val] = c.trim().split('=');
      acc[key] = val;
      return acc;
    }, {});
    sessionCookie = cookies['auth_session'];
  }

  const loginUrl = new URL('/login', request.url).toString();

  // Basic structural check. Real database validation happens in the API routes 
  // and the dashboard layout's server-side /api/auth-status check.
  if (!sessionCookie) {
    return Response.redirect(loginUrl, 307);
  }

  return;
}
