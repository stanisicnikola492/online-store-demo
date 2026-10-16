import Link from 'next/link';
import type { RequestStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Pill, StatusPill, formatDate } from '@/components/ui';
import { PageHeader, SearchBar, EmptyState } from '@/components/ListControls';
import { Pagination, parsePage, pickEnum, pickParam } from '@/components/Pagination';

const QUEUE: RequestStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPEALED'];
const PAGE_SIZE = 15;

export default async function OperatorQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('OPERATOR');
  const sp = await searchParams;
  const query = pickParam(sp.q)?.trim();
  const status = pickEnum(sp.status, QUEUE);
  const page = parsePage(sp.page);

  const where = {
    status: status ?? { in: QUEUE },
    ...(query
      ? {
          OR: [
            { reference: { contains: query } },
            { customer: { displayName: { contains: query } } },
            { order: { orderNumber: { contains: query } } },
          ],
        }
      : {}),
  };

  const [queue, total, recent] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: {
        customer: { select: { displayName: true } },
        order: { select: { orderNumber: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.returnRequest.count({ where }),
    prisma.returnRequest.findMany({
      where: { status: { notIn: QUEUE }, OR: [{ reviewedById: user.id }, { appeals: { some: {} } }] },
      include: { customer: { select: { displayName: true } }, _count: { select: { items: true } } },
      orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Review queue" subtitle={`${total} request(s) waiting for a decision. Oldest first.`} />

      <SearchBar
        action="/operator"
        query={query}
        placeholder="Search request, customer or order"
        filters={
          <select name="status" defaultValue={status ?? ''} aria-label="Filter by status" className="field w-auto">
            <option value="">Whole queue</option>
            <option value="SUBMITTED">submitted</option>
            <option value="UNDER_REVIEW">under review</option>
            <option value="APPEALED">appealed</option>
          </select>
        }
      />

      {queue.length === 0 ? (
        <div className="panel">
          <EmptyState>
            {query || status ? (
              <>
                Nothing in the queue matches this filter.{' '}
                <Link href="/operator" className="text-indigo-700 underline">Clear it</Link>
              </>
            ) : (
              'The queue is empty — every request has been decided.'
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Customer</th>
                <th className="hidden md:table-cell">Order</th>
                <th className="hidden sm:table-cell">Lines</th>
                <th className="hidden sm:table-cell">Submitted</th>
                <th>Waiting</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => {
                const waitingDays = r.submittedAt
                  ? Math.floor((Date.now() - r.submittedAt.getTime()) / 86_400_000)
                  : 0;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/operator/${r.id}`} className="font-medium text-indigo-700 hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td>{r.customer.displayName}</td>
                    <td className="muted hidden md:table-cell">{r.order.orderNumber}</td>
                    <td className="hidden sm:table-cell">{r._count.items}</td>
                    <td className="muted hidden sm:table-cell">{formatDate(r.submittedAt)}</td>
                    <td>
                      {waitingDays === 0 ? (
                        <span className="muted">today</span>
                      ) : (
                        <Pill tone={waitingDays > 7 ? 'red' : waitingDays > 2 ? 'amber' : 'slate'}>
                          {waitingDays} d
                        </Pill>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusPill status={r.status} />
                        {r.status === 'APPEALED' ? (
                          <Pill tone={r.reviewedById === user.id ? 'red' : 'violet'}>
                            {r.reviewedById === user.id ? 'you rejected this' : 'open to you'}
                          </Pill>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-right">
                      <Link href={`/operator/${r.id}`} className="btn-secondary px-3 py-1.5 text-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/operator" params={{ q: query, status }} page={page} pageSize={PAGE_SIZE} total={total} />

      {recent.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">Recently handled by you</h2>
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th className="hidden sm:table-cell">Lines</th>
                  <th>Status</th>
                  <th className="hidden sm:table-cell">Decided</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/operator/${r.id}`} className="font-medium text-indigo-700 hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td>{r.customer.displayName}</td>
                    <td className="hidden sm:table-cell">{r._count.items}</td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td className="muted hidden sm:table-cell">{formatDate(r.reviewedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
