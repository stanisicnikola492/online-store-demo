import { describe, expect, it } from 'vitest';
import {
  appealRules,
  assertTransition,
  calculateItemRefundMinor,
  calculateRequestRefundMinor,
  checkEligibility,
  shippingPayerFor,
  statusAfterDecision,
} from '@/modules/returns/domain';

const DAY = 86_400_000;
const now = new Date('2026-06-15T12:00:00Z');

function eligibility(overrides: Partial<Parameters<typeof checkEligibility>[0]> = {}) {
  return checkEligibility({
    deliveredAt: now,
    warrantyMonths: 24,
    now,
    reason: 'CHANGED_MIND',
    requestedQuantity: 1,
    availableQuantity: 5,
    ...overrides,
  });
}

describe('return windows', () => {
  it('accepts a standard return on day 14', () => {
    expect(eligibility({ deliveredAt: new Date(now.getTime() - 14 * DAY) }).ok).toBe(true);
  });

  it('rejects a standard return on day 15', () => {
    const result = eligibility({ deliveredAt: new Date(now.getTime() - 15 * DAY) });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/within 14 days/);
  });

  it('rejects a return on an order that was not delivered', () => {
    expect(eligibility({ deliveredAt: null }).ok).toBe(false);
  });

  it('accepts a defective item 13 months after delivery (2 year window)', () => {
    const delivered = new Date(now.getFullYear() - 1, now.getMonth() - 1, now.getDate(), 12);
    expect(eligibility({ reason: 'DEFECTIVE', deliveredAt: delivered }).ok).toBe(true);
  });

  it('rejects a defective item after the warranty in months', () => {
    const delivered = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate(), 12);
    const result = eligibility({ reason: 'DEFECTIVE', deliveredAt: delivered, warrantyMonths: 24 });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/24 months/);
  });

  it('a late change-of-mind reason fails even when a defective reason for the same delivery passes', () => {
    const delivered = new Date(now.getTime() - 30 * DAY);
    expect(eligibility({ deliveredAt: delivered, reason: 'CHANGED_MIND' }).ok).toBe(false);
    expect(eligibility({ deliveredAt: delivered, reason: 'DEFECTIVE' }).ok).toBe(true);
  });
});

describe('quantity limits', () => {
  it('blocks a request above the still-returnable quantity', () => {
    const result = eligibility({ requestedQuantity: 6, availableQuantity: 5 });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Only 5 unit/);
  });

  it('blocks a zero quantity', () => {
    expect(eligibility({ requestedQuantity: 0 }).ok).toBe(false);
  });
});

describe('return shipping', () => {
  it('charges the customer only for a pure change-of-mind return', () => {
    expect(shippingPayerFor(['CHANGED_MIND'])).toBe('CUSTOMER');
    expect(shippingPayerFor(['CHANGED_MIND', 'CHANGED_MIND'])).toBe('CUSTOMER');
    expect(shippingPayerFor(['CHANGED_MIND', 'DEFECTIVE'])).toBe('STORE');
    expect(shippingPayerFor(['WRONG_ITEM'])).toBe('STORE');
  });
});

describe('refund calculation', () => {
  it('refunds 100% for as_declared', () => {
    expect(
      calculateItemRefundMinor({ approvedQuantity: 2, unitPriceMinor: 8999, inspectionResult: 'AS_DECLARED' }),
    ).toBe(17998);
  });

  it('refunds the operator percentage for worse_than_declared', () => {
    expect(
      calculateItemRefundMinor({
        approvedQuantity: 1,
        unitPriceMinor: 5900,
        inspectionResult: 'WORSE_THAN_DECLARED',
        manualPercentage: 60,
      }),
    ).toBe(3540);
  });

  it('refunds nothing when the goods were not received', () => {
    expect(
      calculateItemRefundMinor({
        approvedQuantity: 3,
        unitPriceMinor: 1500,
        inspectionResult: 'NOT_RECEIVED',
        manualPercentage: 0,
      }),
    ).toBe(0);
  });

  it('refuses a worse_than_declared item without a percentage', () => {
    expect(() =>
      calculateItemRefundMinor({ approvedQuantity: 1, unitPriceMinor: 1000, inspectionResult: 'WORSE_THAN_DECLARED' }),
    ).toThrow(/percentage/);
  });

  it('refuses percentages outside 0..100', () => {
    expect(() =>
      calculateItemRefundMinor({
        approvedQuantity: 1,
        unitPriceMinor: 1000,
        inspectionResult: 'WORSE_THAN_DECLARED',
        manualPercentage: 140,
      }),
    ).toThrow(/between 0 and 100/);
  });

  it('deducts customer-paid shipping and never goes below zero', () => {
    const items = [{ decision: 'APPROVED' as const, approvedQuantity: 1, finalRefundAmountMinor: 1000 }];
    expect(calculateRequestRefundMinor(items, 'CUSTOMER', 499)).toBe(501);
    expect(calculateRequestRefundMinor(items, 'STORE', 499)).toBe(1000);
    const small = [{ decision: 'APPROVED' as const, approvedQuantity: 1, finalRefundAmountMinor: 100 }];
    expect(calculateRequestRefundMinor(small, 'CUSTOMER', 499)).toBe(0);
  });

  it('ignores rejected items in the total', () => {
    const items = [
      { decision: 'APPROVED' as const, approvedQuantity: 1, finalRefundAmountMinor: 2000 },
      { decision: 'REJECTED' as const, approvedQuantity: null, finalRefundAmountMinor: 0 },
    ];
    expect(calculateRequestRefundMinor(items, 'STORE', 499)).toBe(2000);
  });
});

describe('request status after decisions', () => {
  const item = (decision: 'APPROVED' | 'REJECTED' | 'PENDING') => ({ decision } as never);

  it('is FULLY_REJECTED when nothing was approved', () => {
    expect(statusAfterDecision([item('REJECTED'), item('REJECTED')])).toBe('FULLY_REJECTED');
  });

  it('is APPROVED when everything was approved', () => {
    expect(statusAfterDecision([item('APPROVED')])).toBe('APPROVED');
  });

  it('is PARTIALLY_APPROVED when mixed', () => {
    expect(statusAfterDecision([item('APPROVED'), item('REJECTED')])).toBe('PARTIALLY_APPROVED');
  });
});

describe('state machine', () => {
  it('allows the documented happy path', () => {
    assertTransition('DRAFT', 'SUBMITTED');
    assertTransition('SUBMITTED', 'UNDER_REVIEW');
    assertTransition('UNDER_REVIEW', 'APPROVED');
    assertTransition('APPROVED', 'RECEIVED');
    assertTransition('RECEIVED', 'INSPECTION_COMPLETE');
    assertTransition('INSPECTION_COMPLETE', 'REFUND_PENDING');
    assertTransition('REFUND_PENDING', 'REFUND_PROCESSING');
    assertTransition('REFUND_PROCESSING', 'REFUNDED');
    assertTransition('REFUNDED', 'CLOSED');
  });

  it('refuses to skip inspection', () => {
    expect(() => assertTransition('APPROVED', 'REFUND_PENDING')).toThrow(/Illegal status transition/);
  });

  it('refuses to revive a closed request', () => {
    expect(() => assertTransition('CLOSED', 'REFUNDED')).toThrow(/Illegal status transition/);
  });

  it('allows a failed payout to be requeued with the same key', () => {
    assertTransition('REFUND_PROCESSING', 'REFUND_PENDING');
    assertTransition('REFUND_PENDING', 'REFUND_PROCESSING');
  });

  it('only lets a fully rejected request be appealed', () => {
    assertTransition('FULLY_REJECTED', 'APPEALED');
    expect(() => assertTransition('APPROVED', 'APPEALED')).toThrow(/Illegal/);
  });
});

describe('appeal rules', () => {
  it('rejects a second appeal on the same request', () => {
    expect(() => appealRules({ status: 'FULLY_REJECTED', appealCount: 1, rejectedBy: 'u-sam', actorId: 'u-zoe' })).toThrow(
      /already used its one appeal/,
    );
  });

  it('rejects an appeal on a request that was not fully rejected', () => {
    expect(() => appealRules({ status: 'APPROVED', appealCount: 0, rejectedBy: 'u-sam', actorId: 'u-zoe' })).toThrow(
      /fully rejected/,
    );
  });

  it('rejects an appeal reviewed by the operator who made the rejection', () => {
    expect(() => appealRules({ status: 'FULLY_REJECTED', appealCount: 0, rejectedBy: 'u-sam', actorId: 'u-sam' })).toThrow(
      /cannot review its appeal/,
    );
  });

  it('accepts a first appeal reviewed by a second operator', () => {
    expect(() =>
      appealRules({ status: 'FULLY_REJECTED', appealCount: 0, rejectedBy: 'u-sam', actorId: 'u-zoe' }),
    ).not.toThrow();
  });
});
