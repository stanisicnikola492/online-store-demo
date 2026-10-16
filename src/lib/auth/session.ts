import { createHash, randomBytes } from 'node:crypto';
import type { UserRole } from '@prisma/client';
import { cookies } from 'next/headers';
import { ROLE_COOKIE, SESSION_COOKIE } from '@/lib/auth/cookies';
import { Forbidden, Unauthorized } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { role: true },
  });

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  });
  // Readable by middleware for workspace routing only; never trusted as authorisation.
  store.set(ROLE_COOKIE, user.role, { path: '/', expires: expiresAt, sameSite: 'lax' });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(ROLE_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  return {
    id: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Unauthorized();
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Forbidden(`This action requires one of: ${roles.join(', ')}`);
  }
  return user;
}

export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'CUSTOMER':
      return '/customer';
    case 'OPERATOR':
      return '/operator';
    case 'WAREHOUSE':
      return '/warehouse';
    case 'FINANCE':
      return '/finance';
  }
}
