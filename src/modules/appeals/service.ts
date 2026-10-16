import { ConflictError, NotFound, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import type { CurrentUser } from '@/lib/auth/session';
import { applyStep } from '@/modules/statemachine/engine';
import { appealRules, assertIndependentReviewer, statusAfterDecision } from '@/modules/returns/domain';
import { loadRequestForActor } from '@/modules/returns/service';

export async function submitAppeal(user: CurrentUser, requestId: string, comment: string): Promise<void> {
  const request = await loadRequestForActor(requestId, user, ['CUSTOMER']);
  appealRules({
    status: request.status,
    appealCount: request.appeals.length,
    rejectedBy: request.reviewedById,
    actorId: user.id,
  });
  if (!comment.trim() || comment.trim().length < 10) {
    throw new ValidationError('Explain the appeal in at least 10 characters');
  }

  await prisma.$transaction(async (tx) => {
    await tx.appeal.create({
      data: { returnRequestId: requestId, customerId: user.id, comment: comment.trim() },
    });
    await applyStep(tx, {
      step: 'appeal_submit',
      request,
      actor: user,
      reason: comment.trim(),
    });
  });
}

export async function reviewAppeal(
  user: CurrentUser,
  appealId: string,
  input: { overturn: boolean; itemIds: string[]; reason: string },
): Promise<void> {
  const appeal = await prisma.appeal.findUnique({
    where: { id: appealId },
    include: { returnRequest: { include: { items: true, appeals: true } } },
  });
  if (!appeal) throw new NotFound('Appeal not found');
  if (appeal.status !== 'PENDING') throw new ConflictError('This appeal was already reviewed');

  const request = appeal.returnRequest;
  assertIndependentReviewer(request.reviewedById, user.id);
  if (!input.reason.trim()) throw new ValidationError('A review reason is required');

  const rejectedItems = request.items.filter((i) => i.decision === 'REJECTED');
  const now = new Date();

  if (input.overturn) {
    if (input.itemIds.length === 0) {
      throw new ValidationError('Select at least one rejected item to approve');
    }
    const unknown = input.itemIds.filter((id) => !rejectedItems.some((i) => i.id === id));
    if (unknown.length > 0) throw new ValidationError('Only rejected items can be overturned');
  }

  await prisma.$transaction(async (tx) => {
    for (const item of rejectedItems) {
      const overturn = input.overturn && input.itemIds.includes(item.id);
      if (overturn) {
        await tx.returnItem.update({
          where: { id: item.id },
          data: {
            decision: 'APPROVED',
            approvedQuantity: item.requestedQuantity,
            decisionReason: `Appeal overturned: ${input.reason.trim()}`,
            receiptStatus: 'AWAITING',
            finalRefundAmount: null,
          },
        });
      }
    }

    const projected = request.items.map((i) => ({
      decision: input.overturn && input.itemIds.includes(i.id) ? ('APPROVED' as const) : i.decision,
    }));

    const nextStatus = input.overturn ? statusAfterDecision(projected) : 'APPEAL_REJECTED';
    await tx.appeal.update({
      where: { id: appealId },
      data: {
        status: input.overturn ? 'OVERTURNED' : 'UPHELD',
        reviewedById: user.id,
        reviewReason: input.reason.trim(),
        reviewedAt: now,
      },
    });

    await applyStep(tx, {
      step: input.overturn ? 'appeal_overturn' : 'appeal_uphold',
      request,
      to: nextStatus,
      actor: user,
      set: { reviewedById: user.id, reviewedAt: now },
      reason: input.reason.trim(),
      detail: { overturnedItemIds: input.itemIds },
    });
  });
}
