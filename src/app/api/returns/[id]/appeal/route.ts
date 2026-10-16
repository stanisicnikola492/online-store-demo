import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { submitAppeal } from '@/modules/appeals/service';

const schema = z.object({ comment: z.string().min(10).max(2000) });

export const POST = handleApi(async (req: NextRequest, id: string) => {
  const user = await requireRole('CUSTOMER');
  const { comment } = schema.parse(await readJson(req));
  await submitAppeal(user, id, comment);
  return NextResponse.json({ ok: true });
});
