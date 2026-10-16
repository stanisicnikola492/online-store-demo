import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { createDraft } from '@/modules/returns/service';

const schema = z.object({
  orderId: z.string().min(1),
  notes: z.string().max(1000).nullish(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().min(1),
        reason: z.enum(['CHANGED_MIND', 'WRONG_ITEM', 'DEFECTIVE', 'DAMAGED_IN_TRANSIT', 'NOT_AS_DESCRIBED']),
      }),
    )
    .min(1, 'Select at least one item'),
});

export const POST = handleApi(async (req: NextRequest, orderId: string) => {
  const user = await requireRole('CUSTOMER');
  const body = schema.parse({ ...(await readJson(req)), orderId });
  const request = await createDraft(user, body);
  return NextResponse.json({ ok: true, id: request.id, redirectTo: `/customer/requests/${request.id}` });
});
