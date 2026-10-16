import type { RequestStatus } from '@prisma/client';

const TONE: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'slate',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'violet',
  APPROVED: 'green',
  PARTIALLY_APPROVED: 'amber',
  FULLY_REJECTED: 'red',
  APPEALED: 'violet',
  APPEAL_REJECTED: 'red',
  RECEIVED: 'blue',
  INSPECTING: 'violet',
  INSPECTION_COMPLETE: 'amber',
  REFUND_PENDING: 'amber',
  REFUND_PROCESSING: 'blue',
  REFUNDED: 'green',
  NO_REFUND_DUE: 'slate',
  CLOSED: 'slate',
  CANCELLED: 'slate',
  // Refund rows have their own machine; UNCERTAIN must never look like progress.
  PENDING: 'slate',
  PROCESSING: 'blue',
  SUCCEEDED: 'green',
  FAILED: 'red',
  UNCERTAIN: 'amber',
};

export function Pill({ tone = 'slate', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone] ?? TONE.slate}`}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: RequestStatus | string }) {
  return <Pill tone={STATUS_TONE[status] ?? 'slate'}>{humanStatus(status)}</Pill>;
}

export function humanStatus(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function money(minorOrDecimal: number | string | null | undefined, currency = 'EUR'): string {
  if (minorOrDecimal === null || minorOrDecimal === undefined) return '—';
  const value = typeof minorOrDecimal === 'number' ? minorOrDecimal / 100 : Number(minorOrDecimal);
  return `${currency} ${value.toFixed(2)}`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
