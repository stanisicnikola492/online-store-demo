import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { recordInspection } from '@/modules/inspection/service';

const schema = z.object({
  results: z
    .array(
      z.object({
        itemId: z.string().min(1),
        result: z.enum(['AS_DECLARED', 'WORSE_THAN_DECLARED', 'NOT_RECEIVED']),
        percentage: z.number().int().min(0).max(100).nullish(),
        comment: z.string().max(1000).nullish(),
      }),
    )
    .min(1, 'Record at least one inspection result'),
});

export const POST = handleApi(async (req: NextRequest, id: string) => {
  const user = await requireRole('WAREHOUSE');
  const { results } = schema.parse(await readJson(req));
  await recordInspection(user, id, results);
  return NextResponse.json({ ok: true });
});
