import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { recordReceipt } from '@/modules/inspection/service';

const schema = z.object({
  receipts: z
    .array(z.object({ itemId: z.string().min(1), received: z.boolean() }))
    .min(1, 'Register at least one line'),
});

export const POST = handleApi(async (req: NextRequest, id: string) => {
  const user = await requireRole('WAREHOUSE');
  const { receipts } = schema.parse(await readJson(req));
  await recordReceipt(user, id, receipts);
  return NextResponse.json({ ok: true });
});
