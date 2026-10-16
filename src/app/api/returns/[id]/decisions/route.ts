import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { submitDecisions } from '@/modules/returns/decisions';

const schema = z.object({
  decisions: z
    .array(
      z.object({
        itemId: z.string().min(1),
        decision: z.enum(['APPROVED', 'REJECTED']),
        approvedQuantity: z.number().int().min(0).nullish(),
        reason: z.string().max(1000).nullish(),
      }),
    )
    .min(1, 'Record a decision for every line'),
});

export const POST = handleApi(async (req: NextRequest, id: string) => {
  const user = await requireRole('OPERATOR');
  const { decisions } = schema.parse(await readJson(req));
  await submitDecisions(user, id, decisions);
  return NextResponse.json({ ok: true });
});
