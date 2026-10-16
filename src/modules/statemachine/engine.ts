import { Prisma } from '@prisma/client';
import type { RequestStatus, UserRole } from '@prisma/client';
import { recordHistory, type tx } from '@/modules/history/history';
import { assertFireable, checkStep, type RequestStepName } from '@/modules/statemachine/transitions';

/** The shape of the acting user; `null` is the system acting on its own (auto-close). */
export type StepActor = { id: string; displayName: string; role: UserRole } | null;

export type StepCall = {
  step: RequestStepName;
  /** Only the id and the current status are needed: the machine refuses anything else. */
  request: { id: string; status: RequestStatus };
  /** Required for steps with more than one possible target (decisions, inspection, appeal). */
  to?: RequestStatus;
  actor?: StepActor | null;
  /** Overrides the history label; the automatic close is credited to `system`. */
  actorLabel?: string;
  reason?: string | null;
  detail?: Prisma.InputJsonValue;
  /** Extra columns written with the status, in the same UPDATE. */
  set?: Prisma.ReturnRequestUncheckedUpdateInput;
};

/**
 * The only place in the backend that writes `return_request.status`.
 *
 * Validating, moving and auditing happen in one call, so a service cannot record an event the
 * machine does not allow, and cannot move a request without leaving a trace.
 */
export async function applyStep(db: tx, call: StepCall): Promise<RequestStatus> {
  const { step, target, historyAction } = checkStep({
    step: call.step,
    from: call.request.status,
    to: call.to,
    role: call.actor?.role ?? null,
  });

  const data: Prisma.ReturnRequestUncheckedUpdateInput = { ...call.set };
  if (step.moves) data.status = target;
  if (step.moves || call.set) await db.returnRequest.update({ where: { id: call.request.id }, data });

  if (step.audits) {
    await recordHistory(db, {
      returnRequestId: call.request.id,
      actorId: call.actor?.id ?? null,
      actorLabel: call.actorLabel ?? call.actor?.displayName ?? 'system',
      action: historyAction,
      fromStatus: call.request.status,
      toStatus: target,
      reason: call.reason ?? null,
      detail: call.detail,
    });
  }

  return target;
}

/** Guard-only form, for services that must refuse before they start writing rows. */
export function assertStep(call: Pick<StepCall, 'step' | 'request' | 'actor'> & { to?: RequestStatus }): void {
  assertFireable({
    step: call.step,
    from: call.request.status,
    to: call.to,
    role: call.actor?.role ?? null,
  });
}
