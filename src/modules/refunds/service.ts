import { Prisma } from '@prisma/client';
import type { RefundStatus, RequestStatus } from '@prisma/client';
import { ConflictError, NotFound, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import type { CurrentUser } from '@/lib/auth/session';
import { applyStep } from '@/modules/statemachine/engine';
import {
  REFUND_CLAIMABLE,
  assertRefundClaimable,
  assertRefundTransition,
  assertReconcilable,
  refundStatusFor,
} from '@/modules/statemachine/transitions';
import { fromMinor } from '@/modules/returns/domain';
import { lookupRefund, requestRefund, PROVIDER_TIMEOUT, type ProviderRequest, type ProviderResponse } from '@/modules/refunds/provider-stub';

/**
 * The provider may answer after we gave up waiting. Racing a timeout turns that into an
 * UNCERTAIN outcome instead of pretending the payout never happened.
 */
async function callProvider(req: ProviderRequest): Promise<ProviderResponse> {
  const timeout = new Promise<ProviderResponse>((resolve) => {
    const timer = setTimeout(
      () =>
        resolve({
          outcome: 'UNKNOWN',
          providerRef: null,
          code: 'CLIENT_TIMEOUT',
          message: `The provider did not answer within ${PROVIDER_TIMEOUT} ms. The payout may still have happened.`,
          duplicate: false,
          latencyMs: PROVIDER_TIMEOUT,
        }),
      PROVIDER_TIMEOUT,
    );
    timer.unref?.();
  });
  return Promise.race([requestRefund(req), timeout]);
}

/**
 * A refund row is written durably BEFORE any provider call, and its idempotency key is derived
 * from the request reference, so a second refund for the same request is impossible: the unique
 * index rejects it, and retries always reuse the same key.
 */
export async function createRefundRecord(
  user: CurrentUser,
  requestId: string,
  totalMinor: number,
): Promise<void> {
  const request = await prisma.returnRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { order: true },
  });

  if (totalMinor <= 0) {
    await prisma.$transaction(async (tx) => {
      await applyStep(tx, {
        step: 'no_refund_due',
        request,
        actor: user,
        reason: 'Inspection left nothing refundable',
        detail: { totalMinor },
      });
      await applyStep(tx, {
        step: 'close',
        request: { id: requestId, status: 'NO_REFUND_DUE' },
        actor: user,
        actorLabel: 'system',
      });
    });
    return;
  }

  const idempotencyKey = `RFN-${request.reference}`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          returnRequestId: requestId,
          orderId: request.orderId,
          amount: fromMinor(totalMinor),
          currency: request.order.currency,
          paymentMethod: request.order.paymentMethod,
          idempotencyKey,
          status: 'PENDING',
        },
      });
      await applyStep(tx, {
        step: 'refund_queue',
        request,
        actor: user,
        detail: { amountMinor: totalMinor, paymentMethod: request.order.paymentMethod, idempotencyKey },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A refund record already exists for this request');
    }
    throw err;
  }
}

export async function initiateRefund(user: CurrentUser, refundId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { returnRequest: { include: { order: true } }, attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });
  if (!refund) throw new NotFound('Refund not found');
  assertRefundClaimable(refund.status);

  // Atomic claim: only one finance user can move PENDING/FAILED -> PROCESSING.
  const claimed = await prisma.refund.updateMany({
    where: { id: refundId, status: { in: REFUND_CLAIMABLE } },
    data: {
      status: 'PROCESSING',
      initiatedById: user.id,
      initiatedAt: new Date(),
      failureReason: null,
    },
  });
  if (claimed.count === 0) throw new ConflictError('Another attempt started first; reload the queue');

  await applyStep(prisma, { step: 'payout_start', request: refund.returnRequest, actor: user });

  // The provider call happens outside any transaction: a DB rollback cannot undo money movement,
  // so the local state is written first and the outcome is recorded afterwards.
  let response: ProviderResponse;
  try {
    response = await callProvider({
      idempotencyKey: refund.idempotencyKey,
      amountMinor: Math.round(Number(refund.amount) * 100),
      paymentMethod: refund.paymentMethod,
      originalPaymentRef: refund.returnRequest.order.originalPaymentRef,
    });
  } catch (err) {
    await settleRefund(user, { ...refund, status: 'PROCESSING' }, 'REFUND_PROCESSING', {
      outcome: 'UNKNOWN',
      providerRef: null,
      code: 'CLIENT_EXCEPTION',
      message: err instanceof Error ? err.message : 'Provider call threw',
      duplicate: false,
      latencyMs: null,
    });
    throw err;
  }

  await settleRefund(user, { ...refund, status: 'PROCESSING' }, 'REFUND_PROCESSING', response);
}

/** Finance resolves an UNCERTAIN payout by asking the provider what actually happened. */
export async function reconcileRefund(user: CurrentUser, refundId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { returnRequest: { include: { order: true } }, attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });
  if (!refund) throw new NotFound('Refund not found');
  assertReconcilable(refund.status);

  const response = await lookupRefund(refund.idempotencyKey);
  await settleRefund(user, refund, 'REFUND_PROCESSING', response);
}

type SettledRefund = {
  id: string;
  returnRequestId: string;
  idempotencyKey: string;
  /** The refund state the attempt is settling from: PROCESSING for a payout, UNCERTAIN for a reconciliation. */
  status: RefundStatus;
  attempts: Array<{ attemptNumber: number }>;
};

async function settleRefund(
  user: CurrentUser,
  refund: SettledRefund,
  requestStatus: RequestStatus,
  response: ProviderResponse,
): Promise<void> {
  const attemptNumber = (refund.attempts[0]?.attemptNumber ?? 0) + 1;
  const nextStatus = refundStatusFor(response.outcome);
  assertRefundTransition(refund.status, nextStatus);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    try {
      await tx.refundAttempt.create({
        data: {
          refundId: refund.id,
          attemptNumber,
          requestKey: refund.idempotencyKey,
          outcome: response.outcome,
          providerCode: response.code,
          providerMessage: response.message,
          latencyMs: response.latencyMs ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('This provider response was already recorded');
      }
      throw err;
    }

    await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: nextStatus,
        providerRef: response.providerRef,
        failureReason: response.outcome === 'SUCCEEDED' ? null : response.message,
        settledAt: response.outcome === 'SUCCEEDED' ? now : null,
      },
    });

    if (response.outcome === 'SUCCEEDED') {
      await applyStep(tx, {
        step: 'payout_succeeded',
        request: { id: refund.returnRequestId, status: requestStatus },
        actor: user,
        reason: response.message,
        detail: { providerRef: response.providerRef, duplicate: response.duplicate, attemptNumber },
      });
      await applyStep(tx, {
        step: 'close',
        request: { id: refund.returnRequestId, status: 'REFUNDED' },
        actor: user,
        actorLabel: 'system',
      });
    } else if (response.outcome === 'FAILED') {
      await applyStep(tx, {
        step: 'payout_failed',
        request: { id: refund.returnRequestId, status: requestStatus },
        actor: user,
        reason: `${response.code}: ${response.message}`,
        detail: { attemptNumber },
      });
    } else {
      await applyStep(tx, {
        step: 'payout_uncertain',
        request: { id: refund.returnRequestId, status: requestStatus },
        actor: user,
        reason: `${response.code}: ${response.message}`,
        detail: { attemptNumber, idempotencyKey: refund.idempotencyKey },
      });
    }
  });
}

export function assertFinanceInput(value: unknown): asserts value is { refundId: string } {
  if (!value || typeof value !== 'object' || typeof (value as { refundId?: unknown }).refundId !== 'string') {
    throw new ValidationError('refundId is required');
  }
}
