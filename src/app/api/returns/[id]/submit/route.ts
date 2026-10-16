import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { submitRequest } from '@/modules/returns/service';

export const POST = handleApi(async (_req: NextRequest, id: string) => {
  const user = await requireRole('CUSTOMER');
  await submitRequest(user, id);
  return NextResponse.json({ ok: true });
});
