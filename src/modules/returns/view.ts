import { notFound } from 'next/navigation';
import type { CurrentUser } from '@/lib/auth/session';
import type { UserRole } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { loadRequestForActor } from '@/modules/returns/service';

/** One loader for every role workspace; access control is enforced by loadRequestForActor. */
export async function loadRequestView(requestId: string, user: CurrentUser, roles: UserRole[]) {
  let request: Awaited<ReturnType<typeof loadRequestForActor>>;
  try {
    request = await loadRequestForActor(requestId, user, roles);
  } catch (err) {
    // Another customer's request must look like it does not exist, not like a server crash.
    if (err instanceof AppError && (err.status === 403 || err.status === 404)) notFound();
    throw err;
  }

  return {
    id: request.id,
    reference: request.reference,
    status: request.status,
    overallReason: request.overallReason,
    shippingPaidBy: request.shippingPaidBy,
    returnShippingCost: Number(request.returnShippingCost),
    notes: request.notes,
    createdAt: request.createdAt,
    submittedAt: request.submittedAt,
    reviewedByName: request.reviewedBy?.displayName ?? null,
    reviewedById: request.reviewedById,
    orderId: request.orderId,
    order: {
      orderNumber: request.order.orderNumber,
      paymentMethod: request.order.paymentMethod,
      currency: request.order.currency,
      deliveredAt: request.order.deliveredAt,
    },
    customerName: request.customer.displayName,
    customerId: request.customerId,
    items: request.items.map((i) => ({
      id: i.id,
      orderItemId: i.orderItemId,
      productName: i.productName,
      requestedQuantity: i.requestedQuantity,
      reason: i.reason,
      decision: i.decision,
      approvedQuantity: i.approvedQuantity,
      decisionReason: i.decisionReason,
      receiptStatus: i.receiptStatus,
      inspectionResult: i.inspectionResult,
      refundPercentage: i.refundPercentage,
      unitPrice: Number(i.orderItem.unitPrice),
      finalRefundAmount: i.finalRefundAmount === null ? null : Number(i.finalRefundAmount),
      inspectionComment: i.inspectionComment,
    })),
    refunds: request.refunds.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      paymentMethod: r.paymentMethod,
      currency: r.currency,
      status: r.status,
      idempotencyKey: r.idempotencyKey,
      providerRef: r.providerRef,
      failureReason: r.failureReason,
      createdAt: r.createdAt,
      attempts: r.attempts.map((a) => ({
        attemptNumber: a.attemptNumber,
        outcome: a.outcome,
        providerCode: a.providerCode,
        providerMessage: a.providerMessage,
        latencyMs: a.latencyMs,
        createdAt: a.createdAt,
      })),
    })),
    appeals: request.appeals.map((a) => ({
      id: a.id,
      comment: a.comment,
      status: a.status,
      reviewReason: a.reviewReason,
      createdAt: a.createdAt,
      reviewerName: a.reviewedBy?.displayName ?? null,
    })),
    history: request.history.map((h) => ({
      id: h.id,
      actorLabel: h.actorLabel,
      action: h.action,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason,
      detail: h.detail,
      createdAt: h.createdAt,
    })),
  };
}
