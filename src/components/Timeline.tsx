import { formatDateTime, humanStatus, Pill } from '@/components/ui';

export type HistoryRow = {
  id: string;
  actorLabel: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  detail: unknown;
  createdAt: Date;
};

/** Audit trail: who did what, when, and why — rendered straight from request_history. */
export function Timeline({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return <p className="muted">No events recorded yet.</p>;

  return (
    <ol className="space-y-3">
      {[...rows].reverse().map((row) => (
        <li key={row.id} className="border-l-2 border-slate-200 pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{humanStatus(row.action)}</span>
            {row.toStatus ? <Pill tone="blue">{humanStatus(row.toStatus)}</Pill> : null}
            <span className="muted ml-auto text-xs">{formatDateTime(row.createdAt)}</span>
          </div>
          <p className="muted text-sm">
            by {row.actorLabel}
            {row.fromStatus && row.toStatus && row.fromStatus !== row.toStatus
              ? ` (from ${humanStatus(row.fromStatus)})`
              : ''}
          </p>
          {row.reason ? <p className="mt-1 text-sm text-slate-700">{row.reason}</p> : null}
          {row.detail ? (
            <details className="mt-1">
              <summary className="muted cursor-pointer text-xs">details</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                {JSON.stringify(row.detail, null, 2)}
              </pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
