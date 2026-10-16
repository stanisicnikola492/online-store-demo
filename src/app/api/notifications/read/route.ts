import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/auth/session';
import { handleApi } from '@/lib/http';
import { deliverOutboxEvents } from '@/modules/history/history';

export const POST = handleApi(async () => {
  const user = await requireUser();
  await deliverOutboxEvents();
  const updated = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, marked: updated.count });
});
