import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { handleApi, readJson } from '@/lib/http';
import { getProviderMode, resetProviderLedger, setProviderMode, type ProviderMode } from '@/modules/refunds/provider-stub';

const MODES: ProviderMode[] = ['SUCCESS', 'SLOW', 'FAILURE', 'UNCERTAIN', 'DUPLICATE'];

export const GET = handleApi(async () => {
  await requireRole('FINANCE');
  return NextResponse.json({ mode: getProviderMode(), modes: MODES });
});

const schema = z.object({ mode: z.enum(MODES as [ProviderMode, ...ProviderMode[]]), clearLedger: z.boolean().default(false) });

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireRole('FINANCE');
  const { mode, clearLedger } = schema.parse(await readJson(req));
  if (clearLedger) resetProviderLedger();
  setProviderMode(mode);
  return NextResponse.json({ ok: true, mode, actor: user.displayName });
});
