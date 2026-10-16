import { ConflictError, Forbidden } from '@/lib/errors';
import type { InspectionResult, ItemDecision, RequestStatus, ReturnReason, ShippingPayer } from '@prisma/client';

export const STANDARD_RETURN_DAYS = 14;
export const DEFECTIVE_RETURN_MONTHS = 24;
export const RETURN_SHIPPING_COSTMinor = 499;
export const REASONS: ReturnReason[] = [
  'CHANGED_MIND',
  'WRONG_ITEM',
  'DEFECTIVE',
  'DAMAGED_IN_TRANSIT',
  'NOT_AS_DESCRIBED',
];

export const ACTIVE_REQUEST_STATUSES: RequestStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'APPEALED',
  'RECEIVED',
  'INSPECTING',
  'INSPECTION_COMPLETE',
  'REFUND_PENDING',
  'REFUND_PROCESSING',
];

export const TERMINAL_REQUEST_STATUSES: RequestStatus[] = [
  'REFUNDED',
  'NO_REFUND_DUE',
  'CLOSED',
  'CANCELLED',
  'APPEAL_REJECTED',
  'FULLY_REJECTED',
];

/**
 * The status graph lives in `@/modules/statemachine/transitions` now, together with the per-event
 * rules every role obeys. These re-exports keep this module's public surface unchanged.
 */
export { assertTransition, canTransition } from '@/modules/statemachine/transitions';

type Decimalish = number | string | { toNumber(): number };

export function toMinor(amount: Decimalish): number {
  const value = typeof amount === 'object' && amount !== null ? amount.toNumber() : Number(amount);
  return Math.round(value * 100);
}

export function fromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function formatMoney(minor: number, currency = 'EUR'): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

export type EligibilityInput = {
  deliveredAt: Date | null;
  warrantyMonths: number;
  now: Date;
  reason: ReturnReason;
  requestedQuantity: number;
  availableQuantity: number;
};

export type EligibilityResult = { ok: boolean; errors: string[] };

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const errors: string[] = [];
  const { reason, deliveredAt, now, warrantyMonths, requestedQuantity, availableQuantity } = input;

  if (requestedQuantity <= 0) errors.push('Requested quantity must be at least 1');
  if (requestedQuantity > availableQuantity) {
    errors.push(
      `Only ${availableQuantity} unit(s) of this item are still returnable (requested ${requestedQuantity})`,
    );
  }

  if (!deliveredAt) {
    errors.push('Order is not marked as delivered, so it cannot be returned yet');
    return { ok: false, errors };
  }

  const monthsSinceDelivery = monthsBetween(deliveredAt, now);
  if (reason === 'DEFECTIVE') {
    if (monthsSinceDelivery > warrantyMonths) {
      errors.push(
        `Defective returns are accepted within ${warrantyMonths} months of delivery; this item was delivered ${monthsSinceDelivery} month(s) ago`,
      );
    }
  } else {
    const days = daysBetween(deliveredAt, now);
    if (days > STANDARD_RETURN_DAYS) {
      errors.push(
        `${reason} returns must be requested within ${STANDARD_RETURN_DAYS} days of delivery; ${days} days have passed. Choose DEFECTIVE if the item is faulty.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? months - 1 : months;
}

/** Customer pays return shipping only for 'changed mind' returns. */
export function shippingPayerFor(reasons: ReturnReason[]): ShippingPayer {
  return reasons.every((r) => r === 'CHANGED_MIND') ? 'CUSTOMER' : 'STORE';
}

export const REFUND_PERCENT: Record<InspectionResult, number | null> = {
  PENDING: null,
  AS_DECLARED: 100,
  WORSE_THAN_DECLARED: null,
  NOT_RECEIVED: 0,
};

export type ItemCalcInput = {
  approvedQuantity: number;
  unitPriceMinor: number;
  inspectionResult: InspectionResult;
  manualPercentage?: number | null;
};

export function calculateItemRefundMinor(input: ItemCalcInput): number {
  const base = input.approvedQuantity * input.unitPriceMinor;
  if (input.inspectionResult === 'NOT_RECEIVED') return 0;
  const pct =
    input.inspectionResult === 'AS_DECLARED'
      ? 100
      : input.inspectionResult === 'WORSE_THAN_DECLARED'
        ? normalisePercentage(input.manualPercentage)
        : 0;
  return Math.round((base * pct) / 100);
}

export function normalisePercentage(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    throw new Error('A refund percentage between 0 and 100 is required for worse_than_declared items');
  }
  if (value < 0 || value > 100) {
    throw new Error('Refund percentage must be between 0 and 100');
  }
  return value;
}

export type SettledItem = {
  decision: ItemDecision;
  approvedQuantity: number | null;
  finalRefundAmountMinor: number | null;
};

export function calculateRequestRefundMinor(
  items: SettledItem[],
  payer: ShippingPayer,
  returnShippingMinor: number,
): number {
  const gross = items
    .filter((i) => i.decision === 'APPROVED')
    .reduce((sum, i) => sum + (i.finalRefundAmountMinor ?? 0), 0);
  const shipping = payer === 'CUSTOMER' ? returnShippingMinor : 0;
  return Math.max(0, gross - shipping);
}

export type DecisionSummary = {
  approvedItems: number;
  rejectedItems: number;
  pendingItems: number;
};

export function summariseDecisions(items: { decision: ItemDecision }[]): DecisionSummary {
  return {
    approvedItems: items.filter((i) => i.decision === 'APPROVED').length,
    rejectedItems: items.filter((i) => i.decision === 'REJECTED').length,
    pendingItems: items.filter((i) => i.decision === 'PENDING').length,
  };
}

export function statusAfterDecision(items: { decision: ItemDecision }[]): RequestStatus {
  const s = summariseDecisions(items);
  if (s.approvedItems === 0) return 'FULLY_REJECTED';
  return s.rejectedItems > 0 ? 'PARTIALLY_APPROVED' : 'APPROVED';
}

/** Inspection may not be recorded for rejected items, and editing stops once inspection started. */
export function isInspectionStarted(item: {
  inspectionResult: InspectionResult;
  receiptStatus: string;
}): boolean {
  return item.inspectionResult !== 'PENDING' || item.receiptStatus !== 'AWAITING';
}

export function requestIsEditable(items: {
  inspectionResult: InspectionResult;
  receiptStatus: string;
}[]): boolean {
  return !items.some((i) => isInspectionStarted(i));
}

export type AppealRulesInput = {
  status: RequestStatus;
  appealCount: number;
  rejectedBy: string | null;
  actorId: string;
};

/** The operator who rejected a request may not decide its appeal. */
export function assertIndependentReviewer(rejectedBy: string | null, actorId: string): void {
  if (rejectedBy !== null && rejectedBy === actorId) {
    throw new Forbidden('The operator who rejected this request cannot review its appeal');
  }
}

/** A request can be appealed once, only after a full rejection, and by an independent reviewer. */
export function appealRules(input: AppealRulesInput): void {
  if (input.status !== 'FULLY_REJECTED') {
    throw new ConflictError('Only a fully rejected request can be appealed');
  }
  if (input.appealCount > 0) {
    throw new ConflictError('This request has already used its one appeal');
  }
  assertIndependentReviewer(input.rejectedBy, input.actorId);
}
