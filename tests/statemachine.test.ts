import { describe, expect, it } from 'vitest';
import { RefundStatus, RequestStatus, UserRole } from '@prisma/client';
import { AppError, ConflictError, Forbidden } from '@/lib/errors';
import {
  REQUEST_STEPS,
  REFUND_CLAIMABLE,
  assertFireable,
  assertRefundClaimable,
  assertRefundTransition,
  assertReconcilable,
  assertTransition,
  canRefundTransition,
  canTransition,
  checkStep,
  refundStatusFor,
  stepsFor,
  type RequestStepName,
} from '@/modules/statemachine/transitions';

const STEPS = Object.keys(REQUEST_STEPS) as RequestStepName[];
const ALL_STATUSES = Object.values(RequestStatus) as RequestStatus[];
const ALL_ROLES = Object.values(UserRole) as UserRole[];

function statusSet(...names: RequestStepName[]): Set<RequestStatus> {
  const set = new Set<RequestStatus>();
  for (const name of names) for (const status of REQUEST_STEPS[name].to) set.add(status);
  return set;
}

describe('request status graph', () => {
  it('keeps CLOSED and CANCELLED terminal', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition('CLOSED', status)).toBe(status === 'CLOSED');
      expect(canTransition('CANCELLED', status)).toBe(status === 'CANCELLED');
    }
  });

  it('refuses to skip ahead', () => {
    expect(canTransition('APPROVED', 'REFUND_PENDING')).toBe(false);
    expect(canTransition('SUBMITTED', 'RECEIVED')).toBe(false);
    expect(canTransition('REFUNDED', 'REFUND_PROCESSING')).toBe(false);
  });

  it('lets an appeal land on any decision outcome', () => {
    // The reviewer re-records the line decisions, so this is what the services have always done.
    expect(canTransition('APPEALED', 'APPROVED')).toBe(true);
    expect(canTransition('APPEALED', 'PARTIALLY_APPROVED')).toBe(true);
    expect(canTransition('APPEALED', 'FULLY_REJECTED')).toBe(true);
  });

  it('allows a failed payout to be requeued with the same key', () => {
    assertTransition('REFUND_PROCESSING', 'REFUND_PENDING');
    assertTransition('REFUND_PENDING', 'REFUND_PROCESSING');
  });
});

describe('step registry', () => {
  it('is declared for every status a request can sit in, terminal ones included as dead ends', () => {
    const fromStates = new Set<RequestStatus>(STEPS.flatMap((name) => [...REQUEST_STEPS[name].from]));
    for (const status of ALL_STATUSES) {
      const terminal = status === 'CLOSED' || status === 'CANCELLED' || status === 'APPEAL_REJECTED';
      expect(fromStates.has(status)).toBe(!terminal);
    }
  });

  it('only names states and roles the schema has', () => {
    for (const name of STEPS) {
      const step = REQUEST_STEPS[name];
      for (const status of [...step.from, ...step.to]) expect(ALL_STATUSES).toContain(status);
      for (const role of step.roles ?? []) expect(ALL_ROLES).toContain(role);
    }
  });

  it('fires only edges the graph allows', () => {
    const illegal: string[] = [];
    for (const name of STEPS) {
      for (const from of REQUEST_STEPS[name].from) {
        for (const to of REQUEST_STEPS[name].to) {
          if (!canTransition(from, to)) illegal.push(`${name}: ${from} -> ${to}`);
        }
      }
    }
    expect(illegal).toEqual([]);
  });

  it('reaches every status except the DRAFT a request is created in', () => {
    const reached = statusSet(...STEPS);
    for (const status of ALL_STATUSES) {
      if (status === 'DRAFT') continue;
      expect(`${status} reached: ${reached.has(status)}`).toBe(`${status} reached: true`);
    }
  });

  it('writes the same audit action the service call sites wrote before', () => {
    const expected: Array<[RequestStepName, RequestStatus, RequestStatus | undefined, string]> = [
      ['draft_edit', 'DRAFT', undefined, 'draft_updated'],
      ['submit', 'DRAFT', undefined, 'submitted'],
      ['cancel', 'SUBMITTED', undefined, 'cancelled'],
      ['review_start', 'SUBMITTED', undefined, 'review_started'],
      ['decisions', 'UNDER_REVIEW', 'APPROVED', 'decisions_recorded'],
      ['decisions', 'UNDER_REVIEW', 'PARTIALLY_APPROVED', 'decisions_recorded'],
      ['decisions', 'UNDER_REVIEW', 'FULLY_REJECTED', 'fully_rejected'],
      ['appeal_submit', 'FULLY_REJECTED', undefined, 'appeal_submitted'],
      ['appeal_overturn', 'APPEALED', 'PARTIALLY_APPROVED', 'appeal_overturned'],
      ['appeal_uphold', 'APPEALED', undefined, 'appeal_upheld'],
      ['receive_goods', 'APPROVED', undefined, 'goods_received'],
      ['inspect', 'RECEIVED', 'INSPECTING', 'inspection_recorded'],
      ['inspect', 'RECEIVED', 'INSPECTION_COMPLETE', 'inspection_recorded'],
      ['refund_queue', 'INSPECTION_COMPLETE', undefined, 'refund_queued'],
      ['no_refund_due', 'INSPECTION_COMPLETE', undefined, 'no_refund_due'],
      ['close', 'REFUNDED', undefined, 'closed'],
      ['close', 'NO_REFUND_DUE', undefined, 'closed'],
      ['payout_succeeded', 'REFUND_PROCESSING', undefined, 'refund_succeeded'],
      ['payout_failed', 'REFUND_PROCESSING', undefined, 'refund_failed'],
      ['payout_uncertain', 'REFUND_PROCESSING', undefined, 'refund_uncertain'],
    ];
    for (const [step, from, to, action] of expected) {
      expect(checkStep({ step, from, to }).historyAction).toBe(action);
    }
  });

  it('audits every step except the two bookkeeping writes that never had a history row', () => {
    const silent: RequestStepName[] = ['inspection_complete', 'payout_start'];
    for (const name of STEPS) expect(`${name}:${REQUEST_STEPS[name].audits}`).toBe(`${name}:${!silent.includes(name)}`);
  });

  it('does not touch the status column for self events', () => {
    expect(REQUEST_STEPS.payout_uncertain.moves).toBe(false);
    expect(REQUEST_STEPS.draft_edit.moves).toBe(false);
    expect(REQUEST_STEPS.payout_succeeded.moves).toBe(true);
  });
});

describe('step guards', () => {
  it('refuses the wrong state with 409 and the wording the API already returns', () => {
    const cases: Array<[RequestStepName, RequestStatus, RegExp]> = [
      ['submit', 'SUBMITTED', /This request is no longer a draft/],
      ['review_start', 'DRAFT', /Only a submitted request can be opened for review \(current: DRAFT\)/],
      ['decisions', 'RECEIVED', /Request is RECEIVED, decisions are only allowed while under review/],
      ['cancel', 'REFUND_PENDING', /A request in status REFUND_PENDING can no longer be cancelled/],
      ['receive_goods', 'SUBMITTED', /Nothing is expected for a request in status SUBMITTED/],
      ['inspect', 'APPROVED', /Inspection is not possible in status APPROVED/],
      ['appeal_submit', 'APPROVED', /Only a fully rejected request can be appealed/],
      ['draft_edit', 'SUBMITTED', /Only a draft request can be edited/],
    ];
    for (const [step, from, message] of cases) {
      expect(() => assertFireable({ step, from })).toThrow(message);
      try {
        assertFireable({ step, from });
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        expect((err as AppError).status).toBe(409);
      }
    }
  });

  it('refuses the wrong role with 403 before the state is even consulted', () => {
    expect(() => assertFireable({ step: 'payout_start', from: 'REFUND_PENDING', role: 'CUSTOMER' })).toThrow(Forbidden);
    expect(() => assertFireable({ step: 'receive_goods', from: 'APPROVED', role: 'FINANCE' })).toThrow(
      /receive_goods can only be performed by WAREHOUSE users/,
    );
    expect(() => assertFireable({ step: 'payout_start', from: 'REFUND_PENDING', role: 'FINANCE' })).not.toThrow();
  });

  it('lets internal continuation steps run without an actor', () => {
    for (const role of [null, undefined]) {
      expect(() => assertFireable({ step: 'inspection_complete', from: 'RECEIVED', role })).not.toThrow();
      expect(() => assertFireable({ step: 'close', from: 'REFUNDED', role })).not.toThrow();
    }
  });

  it('resolves a fixed target without being told and demands one when there is a choice', () => {
    expect(checkStep({ step: 'cancel', from: 'APPROVED' }).target).toBe('CANCELLED');
    expect(() => checkStep({ step: 'decisions', from: 'UNDER_REVIEW' })).toThrow(/Illegal status transition/);
    expect(() => checkStep({ step: 'decisions', from: 'UNDER_REVIEW', to: 'CLOSED' })).toThrow(
      /Illegal status transition/,
    );
  });

  it('offers each role exactly the events it owns from a given state', () => {
    expect(stepsFor('CUSTOMER', 'DRAFT')).toEqual(['draft_edit', 'submit', 'cancel']);
    expect(stepsFor('CUSTOMER', 'FULLY_REJECTED')).toEqual(['appeal_submit']);
    expect(stepsFor('CUSTOMER', 'CLOSED')).toEqual([]);
    expect(stepsFor('OPERATOR', 'SUBMITTED')).toEqual(['review_start']);
    expect(stepsFor('OPERATOR', 'FULLY_REJECTED')).toEqual([]);
    expect(stepsFor('WAREHOUSE', 'PARTIALLY_APPROVED')).toEqual(['receive_goods']);
    expect(stepsFor('WAREHOUSE', 'RECEIVED')).toEqual(['inspect', 'inspection_complete']);
    expect(stepsFor('FINANCE', 'REFUND_PENDING')).toEqual(['payout_start']);
    expect(stepsFor('FINANCE', 'REFUND_PROCESSING')).toEqual(['payout_succeeded', 'payout_failed', 'payout_uncertain']);
  });
});

describe('refund state machine', () => {
  it('covers every refund status', () => {
    for (const status of Object.values(RefundStatus) as RefundStatus[]) {
      expect(canRefundTransition(status, status)).toBe(true);
    }
  });

  it('walks attempt, settle and retry but never reopens a paid-out refund', () => {
    assertRefundTransition('PENDING', 'PROCESSING');
    assertRefundTransition('PROCESSING', 'UNCERTAIN');
    assertRefundTransition('UNCERTAIN', 'SUCCEEDED');
    assertRefundTransition('FAILED', 'PROCESSING');
    expect(() => assertRefundTransition('SUCCEEDED', 'PROCESSING')).toThrow(/Illegal refund transition: SUCCEEDED/);
    expect(() => assertRefundTransition('PENDING', 'SUCCEEDED')).toThrow(/Illegal refund transition/);
  });

  it('maps provider outcomes onto refund states', () => {
    expect(refundStatusFor('SUCCEEDED')).toBe('SUCCEEDED');
    expect(refundStatusFor('FAILED')).toBe('FAILED');
    expect(refundStatusFor('UNKNOWN')).toBe('UNCERTAIN');
  });

  it('keeps the payout guard wording and gives the claim its state list', () => {
    expect(REFUND_CLAIMABLE).toEqual(['PENDING', 'FAILED']);
    for (const status of REFUND_CLAIMABLE) expect(() => assertRefundClaimable(status)).not.toThrow();
    expect(() => assertRefundClaimable('SUCCEEDED')).toThrow('This refund has already been paid out');
    expect(() => assertRefundClaimable('PROCESSING')).toThrow('A payout attempt is already in flight');
    expect(() => assertRefundClaimable('UNCERTAIN')).toThrow(
      'The previous attempt is uncertain. Reconcile it before retrying',
    );
    expect(() => assertReconcilable('PENDING')).toThrow('Only an uncertain refund needs reconciliation');
    expect(() => assertRefundClaimable('SUCCEEDED')).toThrow(ConflictError);
  });
});

describe('the machine end to end', () => {
  it('walks the documented happy path from DRAFT to CLOSED', () => {
    const path: Array<[RequestStepName, RequestStatus | undefined]> = [
      ['submit', undefined],
      ['review_start', undefined],
      ['decisions', 'APPROVED'],
      ['receive_goods', undefined],
      ['inspect', 'INSPECTION_COMPLETE'],
      ['refund_queue', undefined],
      ['payout_start', undefined],
      ['payout_succeeded', undefined],
      ['close', undefined],
    ];
    let status: RequestStatus = 'DRAFT';
    for (const [step, to] of path) {
      status = checkStep({ step, from: status, to }).target;
    }
    expect(status).toBe('CLOSED');
  });

  it('walks the partial inspection that leaves the request mid-flight', () => {
    const first = checkStep({ step: 'inspect', from: 'RECEIVED', to: 'INSPECTING' });
    expect(first.target).toBe('INSPECTING');
    expect(checkStep({ step: 'inspect', from: first.target, to: 'INSPECTION_COMPLETE' }).target).toBe(
      'INSPECTION_COMPLETE',
    );
  });

  it('walks a rejection and its appeal', () => {
    let status: RequestStatus = 'SUBMITTED';
    status = checkStep({ step: 'review_start', from: status, role: 'OPERATOR' }).target;
    status = checkStep({ step: 'decisions', from: status, to: 'FULLY_REJECTED', role: 'OPERATOR' }).target;
    status = checkStep({ step: 'appeal_submit', from: status, role: 'CUSTOMER' }).target;
    status = checkStep({ step: 'appeal_overturn', from: status, to: 'PARTIALLY_APPROVED', role: 'OPERATOR' }).target;
    expect(status).toBe('PARTIALLY_APPROVED');
  });

  it('walks the zero-refund branch', () => {
    const waived = checkStep({ step: 'no_refund_due', from: 'INSPECTION_COMPLETE' });
    expect(waived.target).toBe('NO_REFUND_DUE');
    expect(checkStep({ step: 'close', from: waived.target }).historyAction).toBe('closed');
  });

  it('keeps a failed payout in the queue instead of closing the request', () => {
    const failed = checkStep({ step: 'payout_failed', from: 'REFUND_PROCESSING', role: 'FINANCE' });
    expect(failed.target).toBe('REFUND_PENDING');
    expect(checkStep({ step: 'payout_start', from: failed.target, role: 'FINANCE' }).target).toBe('REFUND_PROCESSING');
  });
});
