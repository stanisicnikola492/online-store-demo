import Link from 'next/link';
import { RefundStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { StatusPill, formatDateTime, money } from '@/components/ui';
import { ProviderModeControl } from '@/components/ProviderModeControl';
import { getProviderMode } from '@/modules/refunds/provider-stub';
import { PageHeader, SearchBar, EmptyState } from '@/components/ListControls';
import { Pagination, parsePage, pickEnum, pickParam } from '@/components/Pagination';

const OPEN: RefundStatus[] = ['PENDING', 'FAILED', 'UNCERTAIN', 'PROCESSING'];
type PayoutFilter = RefundStatus | 'open' | 'all';
const PAYOUT_FILTERS: PayoutFilter[] = [...Object.values(RefundStatus), 'open', 'all'];
const PAGE_SIZE = 15;

export default async function FinanceQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('FINANCE');
  const sp = await searchParams;
  const query = pickParam(sp.q)?.trim();
  const status = pickEnum<PayoutFilter>(sp.status, PAYOUT_FILTERS) ?? 'open';
  const page = parsePage(sp.page);

  const where = {
    ...(query ? { returnRequest: { reference: { contains: query } } } : {}),
    ...(status === 'all'
      ? {}
      : status === 'open'
        ? { status: { in: OPEN } }
        : { status }),
  };

  const [refunds, total, outstandingAgg, settledCount] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: { returnRequest: { select: { reference: true, id: true } }, attempts: { select: { id: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.refund.count({ where }),
    prisma.refund.aggregate({ where: { status: { in: OPEN } }, _sum: { amount: true }, _count: true }),
    prisma.refund.count({ where: { status: 'SUCCEEDED' } }),
  ]);

  const outstandingMinor = Math.round(Number(outstandingAgg._sum.amount ?? 0) * 100);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Refund queue"
        subtitle={`${outstandingAgg._count} payout(s) outstanding worth ${money(outstandingMinor)} · ${settledCount} settled. Approval of a return never means the money has left — only a settled provider response does.`}
      />

      <section className="card">
        <ProviderModeControl initial={getProviderMode()} />
      </section>

      <SearchBar
        action="/finance"
        query={query}
        placeholder="Search by request reference"
        filters={
          <select name="status" defaultValue={status} aria-label="Filter by payout status" className="field w-auto">
            <option value="open">Outstanding</option>
            {Object.values(RefundStatus).map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
            <option value="all">all payouts</option>
          </select>
        }
      />

      {refunds.length === 0 ? (
        <div className="panel">
          <EmptyState>
            {query || status !== 'open' ? (
              <>
                No payouts match this filter.{' '}
                <Link href="/finance" className="text-indigo-700 underline">Clear it</Link>
              </>
            ) : (
              'Nothing outstanding — every refund has been settled.'
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Amount</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Attempts</th>
                <th className="hidden lg:table-cell">Idempotency key</th>
                <th className="hidden sm:table-cell">Method</th>
                <th className="hidden lg:table-cell">Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/finance/${r.returnRequestId}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {r.returnRequest.reference}
                    </Link>
                  </td>
                  <td className="font-medium tabular-nums">{money(Math.round(Number(r.amount) * 100), r.currency)}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td className="hidden md:table-cell">{r.attempts.length}</td>
                  <td className="hidden font-mono text-xs text-slate-500 lg:table-cell">{r.idempotencyKey}</td>
                  <td className="muted hidden sm:table-cell">{r.paymentMethod}</td>
                  <td className="muted hidden lg:table-cell">{formatDateTime(r.createdAt)}</td>
                  <td className="text-right">
                    <Link href={`/finance/${r.returnRequestId}`} className="btn-secondary px-3 py-1.5 text-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/finance" params={{ q: query, status }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
