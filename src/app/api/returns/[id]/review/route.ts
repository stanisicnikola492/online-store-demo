import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { handleApi } from '@/lib/http';
import { startReview } from '@/modules/returns/decisions';

export const POST = handleApi(async (_req: Request, id: string) => {
  const user = await requireRole('OPERATOR');
  await startReview(user, id);
  return NextResponse.json({ ok: true });
});
