import Link from 'next/link';
import { RequestStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { StatusPill, formatDate, money } from '@/components/ui';
import { PageHeader, SearchBar, EmptyState } from '@/components/ListControls';
import { Pagination, parsePage, pickEnum, pickParam } from '@/components/Pagination';

const PAGE_SIZE = 10;
const STATUSES = Object.values(RequestStatus);

export default async function CustomerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('CUSTOMER');
  const sp = await searchParams;
  const query = pickParam(sp.q)?.trim();
  const status = pickEnum(sp.status, STATUSES);
  const page = parsePage(sp.page);

  const where = {
    customerId: user.id,
    ...(query
      ? { OR: [{ reference: { contains: query } }, { order: { orderNumber: { contains: query } } }] }
      : {}),
    ...(status ? { status } : {}),
  };

  const [requests, total] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: {
        order: { select: { orderNumber: true } },
        refunds: { select: { amount: true, status: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.returnRequest.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My return requests"
        subtitle="Track the state, the history and the refund of every return."
        actions={
          <Link href="/customer" className="btn-secondary">
            ← Dashboard
          </Link>
        }
      />

      <SearchBar
        action="/customer/requests"
        query={query}
        placeholder="Search by request number or order"
        filters={
          <select name="status" defaultValue={status ?? ''} aria-label="Filter by status" className="field w-auto">
            <option value="">All statuses</option>
            {Object.values(RequestStatus).map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        }
      />

      {requests.length === 0 ? (
        <div className="panel">
          <EmptyState>
            {query || status ? (
              <>
                No requests match this filter.{' '}
                <Link href="/customer/requests" className="text-indigo-700 underline">Clear it</Link>
              </>
            ) : (
              <>
                No requests yet. Open an <Link href="/customer/orders" className="text-indigo-700 underline">order</Link> to start one.
              </>
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Order</th>
                <th className="hidden sm:table-cell">Lines</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Created</th>
                <th className="hidden md:table-cell">Refund</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/customer/requests/${r.id}`} className="font-medium text-indigo-700 hover:underline">
                      {r.reference}
                    </Link>
                  </td>
                  <td>{r.order.orderNumber}</td>
                  <td className="hidden sm:table-cell">{r._count.items}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td className="muted hidden md:table-cell">{formatDate(r.createdAt)}</td>
                  <td className="hidden md:table-cell">
                    {r.refunds[0] ? (
                      <span className="text-sm">
                        {money(Math.round(Number(r.refunds[0].amount) * 100))}
                        <span className="muted"> · {r.refunds[0].status.toLowerCase()}</span>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link href={`/customer/requests/${r.id}`} className="btn-secondary px-3 py-1.5 text-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/customer/requests"
        params={{ q: query, status }}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </div>
  );
}
