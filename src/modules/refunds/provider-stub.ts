/**
 * Payment provider stub. It replaces a real PSP in the demo and can be told to behave badly:
 * slow, failing, duplicated, or never answering. Mode lives in process memory, so it survives
 * across requests inside one container but resets on restart (documented in README).
 *
 * The ledger only remembers operations that actually resulted in a payout: a declined or
 * unanswered attempt must stay retryable, while a settled key is replayed as a duplicate.
 */

export type ProviderMode = 'SUCCESS' | 'SLOW' | 'FAILURE' | 'UNCERTAIN' | 'DUPLICATE';
export type ProviderOutcome = 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export type ProviderRequest = {
  idempotencyKey: string;
  amountMinor: number;
  paymentMethod: string;
  originalPaymentRef: string;
};

export type ProviderResponse = {
  outcome: ProviderOutcome;
  providerRef: string | null;
  code: string;
  message: string;
  duplicate: boolean;
  latencyMs: number | null;
};

const PROVIDER_TIMEOUT_MS = 2_500;
const SLOW_PROVIDER_MS = 3_500;

let mode: ProviderMode = 'SUCCESS';

/** Provider-side ledger: the same idempotency key must resolve to the same logical payout. */
const providerLedger = new Map<string, ProviderResponse>();

export function setProviderMode(next: ProviderMode): ProviderMode {
  mode = next;
  return mode;
}

export function getProviderMode(): ProviderMode {
  return mode;
}

export function resetProviderLedger(): void {
  providerLedger.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syntheticProviderRef(key: string): string {
  return `PAY-${key.replace(/^RFN-/, '')}`;
}

export async function requestRefund(req: ProviderRequest): Promise<ProviderResponse> {
  const started = Date.now();

  const cached = providerLedger.get(req.idempotencyKey);
  if (cached) {
    // Duplicate delivery of an operation we already processed: no second payout is made.
    const response = { ...cached, duplicate: true, latencyMs: Date.now() - started };
    providerLedger.set(req.idempotencyKey, response);
    return response;
  }

  switch (mode) {
    case 'FAILURE':
      await sleep(120);
      // Not recorded: a decline must be retryable with the same key.
      return {
        outcome: 'FAILED',
        providerRef: null,
        code: 'CARD_DECLINED',
        message: 'The issuer declined the refund. Retry later or use an alternative payout.',
        duplicate: false,
        latencyMs: Date.now() - started,
      };

    case 'SLOW':
      // Answers after our client timeout: the caller must treat this as uncertain, not failed.
      await sleep(SLOW_PROVIDER_MS);
      return record(
        req.idempotencyKey,
        {
          outcome: 'SUCCEEDED',
          providerRef: syntheticProviderRef(req.idempotencyKey),
          code: 'APPROVED',
          message: 'Refund settled (slow provider response).',
          duplicate: false,
        },
        started,
      );

    case 'UNCERTAIN':
      await sleep(PROVIDER_TIMEOUT_MS + 500);
      return {
        outcome: 'UNKNOWN',
        providerRef: null,
        code: 'GATEWAY_TIMEOUT',
        message: 'The provider did not answer. The payout may or may not have happened.',
        duplicate: false,
        latencyMs: Date.now() - started,
      };

    case 'DUPLICATE':
    case 'SUCCESS':
    default: {
      await sleep(120);
      return record(
        req.idempotencyKey,
        {
          outcome: 'SUCCEEDED',
          providerRef: syntheticProviderRef(req.idempotencyKey),
          code: 'APPROVED',
          message: 'Refund settled on the original payment method.',
          duplicate: false,
        },
        started,
      );
    }
  }
}

/** Reconciliation query: ask the provider what actually happened for a given operation. */
export async function lookupRefund(idempotencyKey: string): Promise<ProviderResponse> {
  await sleep(100);
  const known = providerLedger.get(idempotencyKey);
  if (known) return { ...known, duplicate: true };
  return {
    outcome: 'FAILED',
    providerRef: null,
    code: 'NOT_FOUND',
    message: 'No payout exists for this operation on the provider side.',
    duplicate: false,
    latencyMs: 100,
  };
}

function record(
  key: string,
  partial: Omit<ProviderResponse, 'latencyMs'>,
  started: number,
): ProviderResponse {
  const response: ProviderResponse = { ...partial, latencyMs: Date.now() - started };
  providerLedger.set(key, response);
  return response;
}

export const PROVIDER_TIMEOUT = PROVIDER_TIMEOUT_MS;
