'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const MODES = [
  { value: 'SUCCESS', label: 'Instant success', hint: 'normal fast approval' },
  { value: 'SLOW', label: 'Slow (3.5s)', hint: 'answers after our 2.5s client timeout' },
  { value: 'FAILURE', label: 'Declined', hint: 'issuer rejects the payout' },
  { value: 'UNCERTAIN', label: 'No answer', hint: 'gateway times out, outcome unknown' },
  { value: 'DUPLICATE', label: 'Duplicate responses', hint: 'same response redelivered on retry' },
];

export function ProviderModeControl({ initial }: { initial: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function apply(clearLedger: boolean) {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/provider-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, clearLedger }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setNote(res.ok ? (clearLedger ? 'Mode set and provider ledger cleared' : 'Mode set') : (data.error ?? 'Failed'));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <h2 className="font-medium">Payment provider simulator</h2>
      <p className="muted text-sm">
        Applies to the next payout attempts in this container. The provider keeps its own record of
        idempotency keys, so a second call with the same key is answered as a duplicate instead of a
        second payment.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => (
          <label key={m.value} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input
              type="radio"
              name="provider-mode"
              className="mr-2"
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
            />
            <span className="font-medium">{m.label}</span>
            <span className="muted block text-xs">{m.hint}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => apply(false)} disabled={busy}>
          {busy ? 'Applying…' : 'Apply mode'}
        </button>
        <button className="btn-secondary" onClick={() => apply(true)} disabled={busy}>
          Apply and clear provider ledger
        </button>
      </div>

      {note ? <p className="muted text-sm">{note}</p> : null}
    </div>
  );
}
