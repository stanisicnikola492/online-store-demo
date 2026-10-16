import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { reviewAppeal } from '@/modules/appeals/service';

const schema = z.object({
  overturn: z.boolean(),
  itemIds: z.array(z.string().min(1)).default([]),
  reason: z.string().min(3).max(2000),
});

export const POST = handleApi(async (req: NextRequest, id: string) => {
  const user = await requireRole('OPERATOR');
  const body = schema.parse(await readJson(req));
  await reviewAppeal(user, id, body);
  return NextResponse.json({ ok: true });
});
