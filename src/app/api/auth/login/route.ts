import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, homePathForRole } from '@/lib/auth/session';
import { fail, handleApi, readJson } from '@/lib/http';
import { Unauthorized } from '@/lib/errors';

const body = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const POST = handleApi(async (req: NextRequest) => {
  const { username, password } = body.parse(await readJson(req));

  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Unauthorized('Username or password is incorrect');
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true, role: user.role, redirectTo: homePathForRole(user.role) });
});

export const GET = () => fail(405, 'Use POST');
