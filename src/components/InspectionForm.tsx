'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Line = { itemId: string; productName: string; quantity: number; unitPrice: number; currency: string };

export function InspectionForm({ requestId, lines }: { requestId: string; lines: Line[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<
    Record<string, { result: string; percentage: number; comment: string }>
  >(
    Object.fromEntries(lines.map((l) => [l.itemId, { result: 'AS_DECLARED', percentage: 100, comment: '' }])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(id: string, patch: Partial<{ result: string; percentage: number; comment: string }>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function preview(line: Line) {
    const row = rows[line.itemId];
    const pct =
      row.result === 'AS_DECLARED' ? 100 : row.result === 'NOT_RECEIVED' ? 0 : row.percentage;
    return (line.quantity * line.unitPrice * (pct / 100)).toFixed(2);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/returns/${requestId}/inspection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        results: lines.map((l) => {
          const row = rows[l.itemId];
          return {
            itemId: l.itemId,
            result: row.result,
            percentage: row.result === 'WORSE_THAN_DECLARED' ? row.percentage : undefined,
            comment: row.comment || undefined,
          };
        }),
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Could not save the inspection');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <h2 className="font-medium">Inspect received items</h2>
      <ul className="space-y-3">
        {lines.map((line) => {
          const row = rows[line.itemId];
          return (
            <li key={line.itemId} className="rounded-lg border border-slate-200 p-3">
              <div className="font-medium">
                {line.productName}{' '}
                <span className="muted text-sm">
                  {line.quantity} unit(s) × {line.currency} {line.unitPrice.toFixed(2)}
                </span>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ['AS_DECLARED', 'As declared'],
                    ['WORSE_THAN_DECLARED', 'Worse than declared'],
                    ['NOT_RECEIVED', 'Not received'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
                    <input
                      type="radio"
                      name={`result-${line.itemId}`}
                      className="mr-1"
                      checked={row.result === value}
                      onChange={() => set(line.itemId, { result: value })}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {row.result === 'WORSE_THAN_DECLARED' ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="label mb-0" htmlFor={`pct-${line.itemId}`}>
                    Operator-set refund percentage
                  </label>
                  <input
                    id={`pct-${line.itemId}`}
                    type="number"
                    className="field w-28"
                    min={0}
                    max={100}
                    value={row.percentage}
                    onChange={(e) => set(line.itemId, { percentage: Number(e.target.value) })}
                  />
                  <span className="muted text-sm">% (0–100)</span>
                </div>
              ) : null}

              <input
                className="field mt-2"
                placeholder="Inspection comment (optional)"
                value={row.comment}
                onChange={(e) => set(line.itemId, { comment: e.target.value })}
              />

              <p className="muted mt-1 text-sm">Refund if saved now: {line.currency} {preview(line)}</p>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button className="btn-primary w-full sm:w-auto" onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : 'Save inspection'}
      </button>
    </div>
  );
}
