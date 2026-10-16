import type { ItemDecision } from '@prisma/client';
import { ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import type { CurrentUser } from '@/lib/auth/session';
import { applyStep, assertStep } from '@/modules/statemachine/engine';
import { statusAfterDecision } from '@/modules/returns/domain';
import { loadRequestForActor } from '@/modules/returns/service';

export type ItemDecisionInput = {
  itemId: string;
  decision: ItemDecision;
  approvedQuantity?: number | null;
  reason?: string | null;
};

export async function startReview(user: CurrentUser, requestId: string): Promise<void> {
  const request = await loadRequestForActor(requestId, user, ['OPERATOR']);
  assertStep({ step: 'review_start', request, actor: user });

  await prisma.$transaction(async (tx) => {
    await applyStep(tx, {
      step: 'review_start',
      request,
      actor: user,
      set: { reviewedById: user.id, reviewedAt: new Date() },
    });
  });
}

export async function submitDecisions(
  user: CurrentUser,
  requestId: string,
  decisions: ItemDecisionInput[],
): Promise<void> {
  const request = await loadRequestForActor(requestId, user, ['OPERATOR']);
  assertStep({ step: 'decisions', request, actor: user });

  const byId = new Map(request.items.map((i) => [i.id, i]));
  if (decisions.length !== byId.size || decisions.some((d) => !byId.has(d.itemId))) {
    throw new ValidationError('Every line item must be approved or rejected in one submission');
  }

  for (const decision of decisions) {
    const item = byId.get(decision.itemId)!;
    if (decision.decision === 'APPROVED') {
      const qty = decision.approvedQuantity ?? item.requestedQuantity;
      if (qty < 1 || qty > item.requestedQuantity) {
        throw new ValidationError(
          `Approved quantity for ${item.productName} must be between 1 and ${item.requestedQuantity}`,
        );
      }
    }
    if (decision.decision === 'REJECTED' && !decision.reason?.trim()) {
      throw new ValidationError(`A rejection reason is required for ${item.productName}`);
    }
  }

  const now = new Date();
  const projected = request.items.map((item) => {
    const d = decisions.find((x) => x.itemId === item.id)!;
    return { ...item, decision: d.decision };
  });
  const nextStatus = statusAfterDecision(projected);

  await prisma.$transaction(async (tx) => {
    for (const d of decisions) {
      const item = byId.get(d.itemId)!;
      const approvedQuantity =
        d.decision === 'APPROVED' ? (d.approvedQuantity ?? item.requestedQuantity) : null;
      await tx.returnItem.update({
        where: { id: d.itemId },
        data: {
          decision: d.decision,
          approvedQuantity,
          decisionReason: d.decision === 'REJECTED' ? d.reason?.trim() : null,
          decidedById: user.id,
          decidedAt: now,
          receiptStatus: d.decision === 'APPROVED' ? 'AWAITING' : 'NOT_APPLICABLE',
          // Rejected lines never reach inspection or refund.
          finalRefundAmount: d.decision === 'REJECTED' ? 0 : item.finalRefundAmount,
        },
      });
    }

    await applyStep(tx, {
      step: 'decisions',
      request,
      to: nextStatus,
      actor: user,
      set: { reviewedById: user.id, reviewedAt: now },
      reason: decisions.find((d) => d.decision === 'REJECTED')?.reason ?? null,
      detail: decisions.map((d) => ({
        item: byId.get(d.itemId)!.productName,
        decision: d.decision,
        approvedQuantity: d.approvedQuantity ?? byId.get(d.itemId)!.requestedQuantity,
        reason: d.reason ?? null,
      })),
    });
  });
}
