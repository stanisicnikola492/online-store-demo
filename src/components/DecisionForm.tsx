'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Line = {
  itemId: string;
  productName: string;
  requestedQuantity: number;
};

export function DecisionForm({ requestId, lines }: { requestId: string; lines: Line[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(
    Object.fromEntries(lines.map((l) => [l.itemId, { decision: 'APPROVED', quantity: l.requestedQuantity, reason: '' }])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(id: string, patch: Partial<{ decision: string; quantity: number; reason: string }>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/returns/${requestId}/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decisions: lines.map((l) => {
          const r = rows[l.itemId];
          return {
            itemId: l.itemId,
            decision: r.decision,
            approvedQuantity: r.decision === 'APPROVED' ? r.quantity : undefined,
            reason: r.decision === 'REJECTED' ? r.reason : undefined,
          };
        }),
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Could not save the decisions');
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="font-medium">Record decisions (each line is decided independently)</h2>
      <ul className="space-y-3">
        {lines.map((line) => {
          const row = rows[line.itemId];
          return (
            <li key={line.itemId} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-40 flex-1 font-medium">
                  {line.productName}{' '}
                  <span className="muted text-sm">(requested {line.requestedQuantity})</span>
                </span>
                <label className="inline-flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name={`decision-${line.itemId}`}
                    checked={row.decision === 'APPROVED'}
                    onChange={() => set(line.itemId, { decision: 'APPROVED' })}
                  />
                  Approve
                </label>
                <label className="inline-flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name={`decision-${line.itemId}`}
                    checked={row.decision === 'REJECTED'}
                    onChange={() => set(line.itemId, { decision: 'REJECTED' })}
                  />
                  Reject
                </label>
              </div>

              {row.decision === 'APPROVED' ? (
                <div className="mt-2">
                  <label className="label" htmlFor={`qty-${line.itemId}`}>
                    Approved quantity (partial approval allowed)
                  </label>
                  <input
                    id={`qty-${line.itemId}`}
                    type="number"
                    className="field w-32"
                    min={1}
                    max={line.requestedQuantity}
                    value={row.quantity}
                    onChange={(e) => set(line.itemId, { quantity: Number(e.target.value) })}
                  />
                </div>
              ) : (
                <div className="mt-2">
                  <label className="label" htmlFor={`reason-${line.itemId}`}>
                    Rejection reason (shown to the customer)
                  </label>
                  <input
                    id={`reason-${line.itemId}`}
                    className="field"
                    value={row.reason}
                    onChange={(e) => set(line.itemId, { reason: e.target.value })}
                    placeholder="e.g. outside the 14 day window for changed-mind returns"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save decisions'}
      </button>
    </form>
  );
}
