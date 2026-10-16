'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Line = { itemId: string; productName: string; quantity: number };

/** Big touch targets: this screen is used on a phone or tablet at the receiving desk. */
export function ReceiptForm({ requestId, lines }: { requestId: string; lines: Line[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(lines.map((l) => [l.itemId, true])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/returns/${requestId}/receipt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receipts: lines.map((l) => ({ itemId: l.itemId, received: state[l.itemId] })) }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'Could not register the receipt');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <h2 className="font-medium">Register returned goods</h2>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.itemId} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 font-medium">
              {line.productName} <span className="muted text-sm">({line.quantity} unit(s) expected)</span>
            </div>
            <div className="flex gap-2">
              <button
                className={state[line.itemId] ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
                onClick={() => setState((p) => ({ ...p, [line.itemId]: true }))}
              >
                Received
              </button>
              <button
                className={!state[line.itemId] ? 'btn-danger flex-1' : 'btn-secondary flex-1'}
                onClick={() => setState((p) => ({ ...p, [line.itemId]: false }))}
              >
                Never arrived
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button className="btn-primary w-full sm:w-auto" onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : 'Confirm receipt'}
      </button>
    </div>
  );
}
