'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type DraftLine = {
  orderItemId: string;
  productName: string;
  availableQuantity: number;
  quantity: number;
  reason: string;
};

const REASONS = ['CHANGED_MIND', 'WRONG_ITEM', 'DEFECTIVE', 'DAMAGED_IN_TRANSIT', 'NOT_AS_DESCRIBED'];

export function DraftEditor({
  requestId,
  orderId,
  lines: initialLines,
  initialNotes,
}: {
  requestId: string;
  orderId: string;
  lines: DraftLine[];
  initialNotes: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(orderItemId: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.orderItemId === orderItemId ? { ...l, ...patch } : l)));
  }

  function payload() {
    return {
      orderId,
      notes: notes.trim() || null,
      items: lines
        .filter((l) => l.quantity > 0)
        .map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity, reason: l.reason })),
    };
  }

  async function call(path: string, method: string, body?: unknown) {
    const res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data;
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/returns/${requestId}/items`, 'PATCH', payload());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/returns/${requestId}/items`, 'PATCH', payload());
      await call(`/api/returns/${requestId}/submit`, 'POST');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  const chosen = lines.filter((l) => l.quantity > 0).length;

  return (
    <div className="space-y-3">
      <p className="muted">
        Nothing is checked against the return windows until you submit. After submission the request
        can still be cancelled, but not edited.
      </p>

      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.orderItemId} className="card flex flex-wrap items-center gap-3">
            <span className="min-w-40 flex-1 font-medium">{line.productName}</span>
            <span className="muted text-sm">{line.availableQuantity} available</span>
            <input
              type="number"
              aria-label={`Quantity for ${line.productName}`}
              className="field w-24"
              min={0}
              max={line.availableQuantity}
              value={line.quantity}
              onChange={(e) => update(line.orderItemId, { quantity: Number(e.target.value) })}
            />
            <select
              aria-label={`Reason for ${line.productName}`}
              className="field w-56"
              value={line.reason}
              onChange={(e) => update(line.orderItemId, { reason: e.target.value })}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll('_', ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <div>
        <label className="label" htmlFor="draft-notes">
          Notes
        </label>
        <textarea
          id="draft-notes"
          className="field"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={save} disabled={busy || chosen === 0}>
          Save draft
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy || chosen === 0}>
          {busy ? 'Working…' : 'Submit request'}
        </button>
      </div>
    </div>
  );
}
