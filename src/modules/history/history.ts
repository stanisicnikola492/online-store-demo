import { Prisma } from '@prisma/client';
import type { RequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type tx = Prisma.TransactionClient;

type HistoryInput = {
  returnRequestId: string;
  actorId?: string | null;
  actorLabel: string;
  action: string;
  fromStatus?: RequestStatus | null;
  toStatus?: RequestStatus | null;
  reason?: string | null;
  detail?: Prisma.InputJsonValue;
};

/**
 * Every business event is written to request_history (the audit trail) and mirrored to
 * outbox_events (the notification queue). The notification worker turns an outbox row into
 * an in-app notification, so a failed notification never rolls back business state.
 */
export async function recordHistory(tx: tx, input: HistoryInput): Promise<void> {
  await tx.requestHistory.create({
    data: {
      returnRequestId: input.returnRequestId,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      reason: input.reason ?? null,
      detail: input.detail === undefined ? Prisma.DbNull : input.detail,
    },
  });

  await tx.outboxEvent.create({
    data: {
      returnRequestId: input.returnRequestId,
      type: `request.${input.action}`,
      payload: {
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        actorLabel: input.actorLabel,
        reason: input.reason ?? null,
      },
    },
  });
}

export async function deliverOutboxEvents(limit = 50): Promise<number> {
  const pending = await prisma.outboxEvent.findMany({
    where: { processedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { returnRequest: { include: { customer: true, order: true } } },
  });

  for (const event of pending) {
    const request = event.returnRequest;
    const affectedUserIds: string[] = [];
    if (request) affectedUserIds.push(request.customerId);
    if (request?.reviewedById) affectedUserIds.push(request.reviewedById);
    if (event.type.includes('refund') || event.type.includes('appeal')) {
      const staff = await prisma.user.findMany({
        where: { role: { in: ['OPERATOR', 'FINANCE', 'WAREHOUSE'] } },
        select: { id: true },
      });
      affectedUserIds.push(...staff.map((s) => s.id));
    }

    for (const userId of new Set(affectedUserIds)) {
      await prisma.notification.create({
        data: {
          userId,
          returnRequestId: event.returnRequestId,
          title: describeEvent(event.type, request?.reference ?? ''),
          body: buildBody(event, request),
        },
      });
    }

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  return pending.length;
}

function describeEvent(type: string, reference: string): string {
  const human = type.replace('request.', '').replace(/_/g, ' ');
  return `${reference}: ${human}`;
}

function buildBody(event: { payload: unknown }, request: { status: RequestStatus } | null): string {
  const payload = event.payload as { reason?: string | null; toStatus?: string | null };
  // The event's own status, not the request's live status: a queued event can be delivered after
  // later transitions have already moved the request on.
  const status = payload?.toStatus ?? request?.status ?? null;
  const parts = [
    status ? `Status is now ${human(status)}` : null,
    payload?.reason ? `Reason: ${payload.reason}` : null,
  ].filter(Boolean);
  return parts.join(' — ') || 'No further details';
}

function human(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}
