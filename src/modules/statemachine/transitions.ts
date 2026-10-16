import type { RefundStatus, RequestStatus, UserRole } from '@prisma/client';
import { ConflictError, Forbidden } from '@/lib/errors';

/**
 * The return workflow's only source of truth for "may this happen at all".
 *
 * Two layers live here:
 *  - the status graph (`ALLOWED_TRANSITIONS`): which states a request may ever reach;
 *  - the step registry (`REQUEST_STEPS`): which business event moves it, from where, to where,
 *    and which role is allowed to fire it.
 *
 * Nothing in this file touches the database, so an API route, a workflow service and a unit test
 * all answer the same question the same way.
 *
 * Backward-compatibility rule: a step's `from`/`to` must describe exactly what the service call
 * site allowed before this module existed. Widening a step is a deliberate, separate change.
 */

const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'PARTIALLY_APPROVED', 'FULLY_REJECTED', 'CANCELLED'],
  FULLY_REJECTED: ['APPEALED', 'CLOSED'],
  // An appeal is decided by re-recording the line decisions, so the reviewer can land on any
  // decision outcome — not only the two appeal-specific states.
  APPEALED: ['UNDER_REVIEW', 'APPEAL_REJECTED', 'APPROVED', 'PARTIALLY_APPROVED', 'FULLY_REJECTED'],
  APPEAL_REJECTED: ['CLOSED'],
  APPROVED: ['RECEIVED', 'CANCELLED'],
  PARTIALLY_APPROVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['INSPECTING', 'INSPECTION_COMPLETE'],
  INSPECTING: ['INSPECTION_COMPLETE'],
  INSPECTION_COMPLETE: ['REFUND_PENDING', 'NO_REFUND_DUE', 'CLOSED'],
  REFUND_PENDING: ['REFUND_PROCESSING', 'NO_REFUND_DUE'],
  REFUND_PROCESSING: ['REFUNDED', 'REFUND_PENDING'],
  REFUNDED: ['CLOSED'],
  NO_REFUND_DUE: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`Illegal status transition: ${from} -> ${to}`);
  }
}

export type RequestStep = {
  /** States the event may be fired from. */
  from: readonly RequestStatus[];
  /** States it may land in. A single entry means the target is fixed and callers may omit it. */
  to: readonly RequestStatus[];
  /** null = a continuation of a step that was already authorised (system/internal writes). */
  roles: readonly UserRole[] | null;
  /** The name written to request_history.action and outbox_events.type. Tests and the demo dump depend on these strings. */
  historyAction: string | ((to: RequestStatus) => string);
  /** Shown when the request is not in one of `from`. Wording is part of the API contract. */
  denial: (current: RequestStatus) => string;
  /** false = the event is audited without moving the status (self events, draft content edits). */
  moves: boolean;
  /** false = the status moves but no audit row is written (bookkeeping inside an already-audited flow). */
  audits: boolean;
};

export const REQUEST_STEPS = {
  draft_edit: {
    from: ['DRAFT'],
    to: ['DRAFT'],
    roles: ['CUSTOMER'],
    historyAction: 'draft_updated',
    denial: () => 'Only a draft request can be edited',
    moves: false,
    audits: true,
  },
  submit: {
    from: ['DRAFT'],
    to: ['SUBMITTED'],
    roles: ['CUSTOMER'],
    historyAction: 'submitted',
    denial: () => 'This request is no longer a draft',
    moves: true,
    audits: true,
  },
  cancel: {
    from: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED'],
    to: ['CANCELLED'],
    roles: ['CUSTOMER'],
    historyAction: 'cancelled',
    denial: (current) => `A request in status ${current} can no longer be cancelled`,
    moves: true,
    audits: true,
  },
  review_start: {
    from: ['SUBMITTED'],
    to: ['UNDER_REVIEW'],
    roles: ['OPERATOR'],
    historyAction: 'review_started',
    denial: (current) => `Only a submitted request can be opened for review (current: ${current})`,
    moves: true,
    audits: true,
  },
  decisions: {
    from: ['UNDER_REVIEW', 'APPEALED'],
    to: ['APPROVED', 'PARTIALLY_APPROVED', 'FULLY_REJECTED'],
    roles: ['OPERATOR'],
    historyAction: (to) => (to === 'FULLY_REJECTED' ? 'fully_rejected' : 'decisions_recorded'),
    denial: (current) => `Request is ${current}, decisions are only allowed while under review`,
    moves: true,
    audits: true,
  },
  appeal_submit: {
    from: ['FULLY_REJECTED'],
    to: ['APPEALED'],
    roles: ['CUSTOMER'],
    historyAction: 'appeal_submitted',
    denial: () => 'Only a fully rejected request can be appealed',
    moves: true,
    audits: true,
  },
  appeal_overturn: {
    from: ['APPEALED'],
    to: ['APPROVED', 'PARTIALLY_APPROVED', 'FULLY_REJECTED'],
    roles: ['OPERATOR'],
    historyAction: 'appeal_overturned',
    denial: (current) => `An appeal is only decided while the request is appealed (current: ${current})`,
    moves: true,
    audits: true,
  },
  appeal_uphold: {
    from: ['APPEALED'],
    to: ['APPEAL_REJECTED'],
    roles: ['OPERATOR'],
    historyAction: 'appeal_upheld',
    denial: (current) => `An appeal is only decided while the request is appealed (current: ${current})`,
    moves: true,
    audits: true,
  },
  receive_goods: {
    from: ['APPROVED', 'PARTIALLY_APPROVED'],
    to: ['RECEIVED'],
    roles: ['WAREHOUSE'],
    historyAction: 'goods_received',
    denial: (current) => `Nothing is expected for a request in status ${current}`,
    moves: true,
    audits: true,
  },
  inspect: {
    from: ['RECEIVED', 'INSPECTING'],
    to: ['INSPECTING', 'INSPECTION_COMPLETE'],
    roles: ['WAREHOUSE'],
    historyAction: 'inspection_recorded',
    denial: (current) => `Inspection is not possible in status ${current}`,
    moves: true,
    audits: true,
  },
  inspection_complete: {
    from: ['RECEIVED'],
    to: ['INSPECTION_COMPLETE'],
    roles: null,
    historyAction: 'inspection_completed',
    denial: (current) => `Only received goods can be closed out (current: ${current})`,
    moves: true,
    audits: false,
  },
  refund_queue: {
    from: ['INSPECTION_COMPLETE'],
    to: ['REFUND_PENDING'],
    roles: null,
    historyAction: 'refund_queued',
    denial: (current) => `A refund can only be queued after inspection (current: ${current})`,
    moves: true,
    audits: true,
  },
  no_refund_due: {
    from: ['INSPECTION_COMPLETE'],
    to: ['NO_REFUND_DUE'],
    roles: null,
    historyAction: 'no_refund_due',
    denial: (current) => `Nothing can be waived after inspection (current: ${current})`,
    moves: true,
    audits: true,
  },
  close: {
    from: ['REFUNDED', 'NO_REFUND_DUE'],
    to: ['CLOSED'],
    roles: null,
    historyAction: 'closed',
    denial: (current) => `Only a settled request can be closed (current: ${current})`,
    moves: true,
    audits: true,
  },
  payout_start: {
    from: ['REFUND_PENDING'],
    to: ['REFUND_PROCESSING'],
    roles: ['FINANCE'],
    historyAction: 'refund_processing',
    denial: (current) => `Only a queued refund can be paid out (current: ${current})`,
    moves: true,
    audits: false,
  },
  payout_succeeded: {
    from: ['REFUND_PROCESSING'],
    to: ['REFUNDED'],
    roles: ['FINANCE'],
    historyAction: 'refund_succeeded',
    denial: (current) => `A payout can only settle while processing (current: ${current})`,
    moves: true,
    audits: true,
  },
  payout_failed: {
    from: ['REFUND_PROCESSING'],
    to: ['REFUND_PENDING'],
    roles: ['FINANCE'],
    historyAction: 'refund_failed',
    denial: (current) => `A payout can only settle while processing (current: ${current})`,
    moves: true,
    audits: true,
  },
  payout_uncertain: {
    from: ['REFUND_PROCESSING'],
    to: ['REFUND_PROCESSING'],
    roles: ['FINANCE'],
    historyAction: 'refund_uncertain',
    denial: (current) => `A payout can only settle while processing (current: ${current})`,
    moves: false,
    audits: true,
  },
} satisfies Record<string, RequestStep>;

export type RequestStepName = keyof typeof REQUEST_STEPS;

export type StepCheck = {
  step: RequestStepName;
  from: RequestStatus;
  /** Required for steps with more than one possible target. */
  to?: RequestStatus;
  role?: UserRole | null;
};

export type CheckedStep = { step: RequestStep; target: RequestStatus; historyAction: string };

/** Pure gate: throws Forbidden (403) for the wrong role, ConflictError (409) for the wrong state. */
export function checkStep(input: StepCheck): CheckedStep {
  const step = assertFireable(input);

  const target = step.to.length === 1 ? step.to[0] : input.to;
  if (!target || !step.to.includes(target)) {
    throw new ConflictError(`Illegal status transition: ${input.from} -> ${target ?? 'undefined'} for ${input.step}`);
  }

  assertTransition(input.from, target);
  const historyAction = typeof step.historyAction === 'function' ? step.historyAction(target) : step.historyAction;
  return { step, target, historyAction };
}

/**
 * The same gate without a target state, for services that must refuse an event before they start
 * writing rows. When a target is supplied it is checked too.
 */
export function assertFireable(input: StepCheck): RequestStep {
  // Widening back to RequestStep keeps `satisfies` literal inference out of `.includes()` calls.
  const step: RequestStep = REQUEST_STEPS[input.step];
  if (step.roles && input.role && !step.roles.includes(input.role)) {
    throw new Forbidden(`${input.step} can only be performed by ${step.roles.join(' or ')} users`);
  }
  if (!step.from.includes(input.from)) {
    throw new ConflictError(step.denial(input.from));
  }
  if (input.to) {
    if (!step.to.includes(input.to)) {
      throw new ConflictError(`Illegal status transition: ${input.from} -> ${input.to} for ${input.step}`);
    }
    assertTransition(input.from, input.to);
  }
  return step;
}

/** Every event a role may fire from a given state — what a client can offer the user. */
export function stepsFor(role: UserRole, from: RequestStatus): RequestStepName[] {
  return (Object.keys(REQUEST_STEPS) as RequestStepName[]).filter((name) => {
    const step: RequestStep = REQUEST_STEPS[name];
    return step.from.includes(from) && (step.roles === null || step.roles.includes(role));
  });
}

const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'UNCERTAIN'],
  UNCERTAIN: ['SUCCEEDED', 'FAILED', 'UNCERTAIN'],
  FAILED: ['PROCESSING'],
  SUCCEEDED: [],
};

export function canRefundTransition(from: RefundStatus, to: RefundStatus): boolean {
  return from === to || REFUND_TRANSITIONS[from].includes(to);
}

export function assertRefundTransition(from: RefundStatus, to: RefundStatus): void {
  if (!canRefundTransition(from, to)) {
    throw new ConflictError(`Illegal refund transition: ${from} -> ${to}`);
  }
}

export type RefundOutcome = 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export function refundStatusFor(outcome: RefundOutcome): RefundStatus {
  return outcome === 'SUCCEEDED' ? 'SUCCEEDED' : outcome === 'FAILED' ? 'FAILED' : 'UNCERTAIN';
}

/**
 * The states a payout attempt may be claimed from. The finance service uses this list as the
 * WHERE clause of its atomic claim, so the guard and the race can never drift apart.
 */
export const REFUND_CLAIMABLE: RefundStatus[] = ['PENDING', 'FAILED'];

const REFUND_CLAIM_BLOCKED: Partial<Record<RefundStatus, string>> = {
  SUCCEEDED: 'This refund has already been paid out',
  PROCESSING: 'A payout attempt is already in flight',
  UNCERTAIN: 'The previous attempt is uncertain. Reconcile it before retrying',
};

export function assertRefundClaimable(current: RefundStatus): void {
  if (REFUND_CLAIMABLE.includes(current)) return;
  throw new ConflictError(REFUND_CLAIM_BLOCKED[current] ?? `A refund in status ${current} cannot be paid out`);
}

export function assertReconcilable(current: RefundStatus): void {
  if (current !== 'UNCERTAIN') throw new ConflictError('Only an uncertain refund needs reconciliation');
}
