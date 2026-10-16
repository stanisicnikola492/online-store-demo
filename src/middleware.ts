import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_COOKIE, SESSION_COOKIE } from '@/lib/auth/cookies';

const ROLE_PREFIX: Record<string, string> = {
  '/customer': 'CUSTOMER',
  '/operator': 'OPERATOR',
  '/warehouse': 'WAREHOUSE',
  '/finance': 'FINANCE',
};

/**
 * Presence-only guard: it keeps signed-out users away from the app shell and puts each role in
 * its own workspace. Actual authorisation happens in the route handlers and server components,
 * because the edge middleware cannot read the database.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  // API handlers answer with JSON status codes; only the page shell is redirected to the login form.
  if (pathname.startsWith('/login') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const prefix = Object.keys(ROLE_PREFIX).find((p) => pathname.startsWith(p));
  if (prefix) {
    const role = req.cookies.get(ROLE_COOKIE)?.value;
    if (role && role !== ROLE_PREFIX[prefix]) {
      const url = req.nextUrl.clone();
      url.pathname = `/${role.toLowerCase()}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
