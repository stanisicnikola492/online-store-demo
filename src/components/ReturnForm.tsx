'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

export type ReturnableLine = {
  orderItemId: string;
  productName: string;
  availableQuantity: number;
  unitPrice: string;
  standardWindowEnds: string;
  defectiveWindowEnds: string;
};

const REASONS = [
  { value: 'CHANGED_MIND', label: 'Changed mind (you pay return shipping)' },
  { value: 'WRONG_ITEM', label: 'Wrong item sent' },
  { value: 'DEFECTIVE', label: 'Defective (2 year window)' },
  { value: 'DAMAGED_IN_TRANSIT', label: 'Damaged in transit' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described' },
];

export function ReturnForm({ lines, orderId }: { lines: ReturnableLine[]; orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Record<string, { quantity: number; reason: string }>>({});

  const selected = useMemo(() => Object.entries(rows).filter(([, r]) => r.quantity > 0), [rows]);

  function setLine(id: string, patch: Partial<{ quantity: number; reason: string }>) {
    setRows((prev) => {
      const current = prev[id] ?? { quantity: 0, reason: 'CHANGED_MIND' };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Select at least one item and a quantity.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orders/${orderId}/returns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId,
        notes: notes.trim() || null,
        items: selected.map(([orderItemId, r]) => ({
          orderItemId,
          quantity: r.quantity,
          reason: r.reason,
        })),
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Could not create the draft');
      return;
    }
    router.push(data.redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="muted">
        Units still returnable are pre-filled below. The draft is only checked against the return
        windows when you submit it.
      </p>

      <ul className="space-y-3">
        {lines.map((line) => {
          const row = rows[line.orderItemId] ?? { quantity: 0, reason: 'CHANGED_MIND' };
          const disabled = line.availableQuantity === 0;
          return (
            <li key={line.orderItemId} className="card space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{line.productName}</span>
                <span className="muted text-sm">
                  {line.unitPrice} each · {line.availableQuantity} returnable
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="label">Quantity</label>
                  <input
                    type="number"
                    min={0}
                    max={line.availableQuantity}
                    step={1}
                    className="field"
                    value={row.quantity}
                    disabled={disabled}
                    onChange={(e) => setLine(line.orderItemId, { quantity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Reason</label>
                  <select
                    className="field"
                    value={row.reason}
                    disabled={disabled}
                    onChange={(e) => setLine(line.orderItemId, { reason: e.target.value })}
                  >
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="muted text-xs">
                Standard window ends {line.standardWindowEnds} · defective window ends{' '}
                {line.defectiveWindowEnds}
              </p>
            </li>
          );
        })}
      </ul>

      <div>
        <label className="label" htmlFor="notes">
          Notes for support (optional)
        </label>
        <textarea
          id="notes"
          className="field"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button className="btn-primary" disabled={busy || selected.length === 0}>
        {busy ? 'Creating…' : `Create draft (${selected.length} line(s))`}
      </button>
    </form>
  );
}
