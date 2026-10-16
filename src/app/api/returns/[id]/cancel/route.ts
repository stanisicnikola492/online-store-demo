import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { cancelRequest } from '@/modules/returns/service';

const schema = z.object({ reason: z.string().min(3).max(500) });

export const POST = handleApi(async (req: NextRequest, id: string) => {
  const user = await requireRole('CUSTOMER');
  const { reason } = schema.parse(await readJson(req));
  await cancelRequest(user, id, reason);
  return NextResponse.json({ ok: true });
});
