import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { handleApi } from '@/lib/http';
import { reconcileRefund } from '@/modules/refunds/service';

export const POST = handleApi(async (_req: Request, id: string) => {
  const user = await requireRole('FINANCE');
  await reconcileRefund(user, id);
  return NextResponse.json({ ok: true });
});
