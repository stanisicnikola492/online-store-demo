import type { InspectionResult } from '@prisma/client';
import { ConflictError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import type { CurrentUser } from '@/lib/auth/session';
import { applyStep, assertStep } from '@/modules/statemachine/engine';
import {
  calculateItemRefundMinor,
  calculateRequestRefundMinor,
  toMinor,
  fromMinor,
} from '@/modules/returns/domain';
import { createRefundRecord } from '@/modules/refunds/service';

export type ReceiptInput = { itemId: string; received: boolean };
export type InspectionInput = {
  itemId: string;
  result: InspectionResult;
  percentage?: number | null;
  comment?: string | null;
};

/** Warehouse step 1: record which approved units physically came back. */
export async function recordReceipt(user: CurrentUser, requestId: string, receipts: ReceiptInput[]): Promise<void> {
  const request = await loadWarehouseRequest(requestId);
  assertStep({ step: 'receive_goods', request, actor: user });

  const awaiting = request.items.filter((i) => i.decision === 'APPROVED' && i.receiptStatus === 'AWAITING');
  if (awaiting.length === 0) throw new ConflictError('All expected goods are already registered');

  const byId = new Map(awaiting.map((i) => [i.id, i]));
  const unknown = receipts.filter((r) => !byId.has(r.itemId));
  if (receipts.length === 0 || unknown.length > 0) {
    throw new ValidationError('Every expected line must be marked received or not received');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const receipt of receipts) {
      const item = byId.get(receipt.itemId)!;
      await tx.returnItem.update({
        where: { id: item.id },
        data: receipt.received
          ? { receiptStatus: 'RECEIVED' }
          : {
              receiptStatus: 'NOT_RECEIVED',
              inspectionResult: 'NOT_RECEIVED',
              refundPercentage: 0,
              finalRefundAmount: 0,
              inspectedById: user.id,
              inspectedAt: now,
              inspectionComment: 'Goods never arrived at the warehouse',
            },
      });
    }

    await applyStep(tx, {
      step: 'receive_goods',
      request,
      actor: user,
      detail: receipts.map((r) => ({ item: byId.get(r.itemId)!.productName, received: r.received })),
    });
  });

  await finaliseIfEverythingSettled(requestId, user);
}

/** Warehouse step 2: inspection verdict per received unit, which drives the refund amount. */
export async function recordInspection(user: CurrentUser, requestId: string, results: InspectionInput[]): Promise<void> {
  const request = await loadWarehouseRequest(requestId);
  assertStep({ step: 'inspect', request, actor: user });

  const inspectable = request.items.filter(
    (i) => i.decision === 'APPROVED' && i.receiptStatus === 'RECEIVED' && i.inspectionResult === 'PENDING',
  );
  const byId = new Map(inspectable.map((i) => [i.id, i]));
  if (results.length === 0 || results.some((r) => !byId.has(r.itemId))) {
    throw new ValidationError('Only items that were received and not yet inspected can be recorded');
  }

  const now = new Date();
  const calculations: Array<{ itemId: string; minor: number; percentage: number | null }> = [];

  for (const result of results) {
    const item = byId.get(result.itemId)!;
    if (item.decision !== 'APPROVED') throw new ValidationError('Rejected items are not inspected');
    if (result.result !== 'AS_DECLARED' && result.result !== 'WORSE_THAN_DECLARED' && result.result !== 'NOT_RECEIVED') {
      throw new ValidationError('Inspection result must be as_declared, worse_than_declared or not_received');
    }

    let percentage: number | null = null;
    if (result.result === 'AS_DECLARED') percentage = 100;
    else if (result.result === 'NOT_RECEIVED') percentage = 0;
    else {
      if (result.percentage === null || result.percentage === undefined) {
        throw new ValidationError('A refund percentage is required for worse_than_declared items');
      }
      if (result.percentage < 0 || result.percentage > 100) {
        throw new ValidationError('Refund percentage must be between 0 and 100');
      }
      percentage = result.percentage;
    }

    const minor = calculateItemRefundMinor({
      approvedQuantity: item.approvedQuantity ?? 0,
      unitPriceMinor: toMinor(item.orderItem.unitPrice),
      inspectionResult: result.result,
      manualPercentage: percentage,
    });

    calculations.push({ itemId: item.id, minor, percentage });
  }

  await prisma.$transaction(async (tx) => {
    for (const calc of calculations) {
      const item = byId.get(calc.itemId)!;
      const result = results.find((r) => r.itemId === calc.itemId)!;
      await tx.returnItem.update({
        where: { id: calc.itemId },
        data: {
          inspectionResult: result.result,
          refundPercentage: calc.percentage,
          receiptStatus: result.result === 'NOT_RECEIVED' ? 'NOT_RECEIVED' : item.receiptStatus,
          inspectionComment: result.comment?.trim() || null,
          inspectedById: user.id,
          inspectedAt: now,
          refundableBase: fromMinor(item.approvedQuantity! * toMinor(item.orderItem.unitPrice)),
          estimatedRefund: fromMinor(item.approvedQuantity! * toMinor(item.orderItem.unitPrice)),
          finalRefundAmount: fromMinor(calc.minor),
        },
      });
    }

    const allSettled = request.items
      .filter((i) => i.decision === 'APPROVED')
      .every(
        (i) =>
          calculations.some((c) => c.itemId === i.id) ||
          i.inspectionResult !== 'PENDING' ||
          i.receiptStatus !== 'RECEIVED',
      );

    await applyStep(tx, {
      step: 'inspect',
      request,
      to: allSettled ? 'INSPECTION_COMPLETE' : 'INSPECTING',
      actor: user,
      detail: calculations.map((c) => ({
        item: byId.get(c.itemId)!.productName,
        result: results.find((r) => r.itemId === c.itemId)!.result,
        percentage: c.percentage,
        refundMinor: c.minor,
      })),
    });
  });

  await finaliseIfEverythingSettled(requestId, user);
}

/** Moves a fully inspected request to REFUND_PENDING (or straight to CLOSED when nothing is due). */
export async function finaliseIfEverythingSettled(requestId: string, user: CurrentUser): Promise<void> {
  const request = await prisma.returnRequest.findUnique({
    where: { id: requestId },
    include: { items: { include: { orderItem: true } } },
  });
  if (!request) return;
  if (request.status !== 'RECEIVED' && request.status !== 'INSPECTION_COMPLETE') return;

  const approved = request.items.filter((i) => i.decision === 'APPROVED');
  const settled = approved.every((i) => i.inspectionResult !== 'PENDING' && i.finalRefundAmount !== null);
  if (!settled || approved.length === 0) return;

  if (request.status === 'RECEIVED') {
    await applyStep(prisma, { step: 'inspection_complete', request, actor: user });
  }

  const totalMinor = calculateRequestRefundMinor(
    approved.map((i) => ({
      decision: i.decision,
      approvedQuantity: i.approvedQuantity,
      finalRefundAmountMinor: i.finalRefundAmount === null ? null : toMinor(i.finalRefundAmount),
    })),
    request.shippingPaidBy,
    toMinor(request.returnShippingCost),
  );

  await createRefundRecord(user, requestId, totalMinor);
}

async function loadWarehouseRequest(requestId: string) {
  const request = await prisma.returnRequest.findUnique({
    where: { id: requestId },
    include: { items: { include: { orderItem: true } } },
  });
  if (!request) throw new ConflictError('Return request not found');
  return request;
}
