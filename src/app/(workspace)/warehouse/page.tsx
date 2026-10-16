import Link from 'next/link';
import type { RequestStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Pill, StatusPill, formatDate } from '@/components/ui';
import { PageHeader, SearchBar, EmptyState } from '@/components/ListControls';
import { Pagination, parsePage, pickParam } from '@/components/Pagination';

const EXPECTED: RequestStatus[] = ['APPROVED', 'PARTIALLY_APPROVED'];
const INSPECTABLE: RequestStatus[] = ['RECEIVED', 'INSPECTING'];
const STAGES: Record<string, RequestStatus[]> = {
  goods: EXPECTED,
  inspect: INSPECTABLE,
};
const PAGE_SIZE = 15;

export default async function WarehouseQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('WAREHOUSE');
  const sp = await searchParams;
  const query = pickParam(sp.q)?.trim();
  const stage = pickParam(sp.stage);
  const page = parsePage(sp.page);

  const where = {
    status: { in: stage ? (STAGES[stage] ?? [...EXPECTED, ...INSPECTABLE]) : [...EXPECTED, ...INSPECTABLE] },
    ...(query
      ? { OR: [{ reference: { contains: query } }, { order: { orderNumber: { contains: query } } }] }
      : {}),
  };

  const [requests, total] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      include: {
        items: true,
        order: { select: { orderNumber: true } },
        customer: { select: { displayName: true } },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.returnRequest.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inspection queue"
        subtitle={`${total} request(s) on the warehouse floor. Register what came back, then inspect it.`}
      />

      <SearchBar
        action="/warehouse"
        query={query}
        placeholder="Search request or order number"
        filters={
          <select name="stage" defaultValue={stage ?? ''} aria-label="Filter by stage" className="field w-auto">
            <option value="">All stages</option>
            <option value="goods">awaiting goods</option>
            <option value="inspect">to inspect</option>
          </select>
        }
      />

      {requests.length === 0 ? (
        <div className="panel">
          <EmptyState>
            {query || stage ? (
              <>
                Nothing matches this filter. <Link href="/warehouse" className="text-indigo-700 underline">Clear it</Link>
              </>
            ) : (
              'Nothing expected and nothing to inspect.'
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
                <th className="hidden md:table-cell">Customer</th>
                <th>Work left</th>
                <th>Stage</th>
                <th className="hidden sm:table-cell">Since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const awaitingGoods = EXPECTED.includes(r.status);
                const approvedItems = r.items.filter((i) => i.decision === 'APPROVED');
                const expectedUnits = approvedItems
                  .filter((i) => i.receiptStatus === 'AWAITING')
                  .reduce((sum, i) => sum + (i.approvedQuantity ?? 0), 0);
                const toInspect = approvedItems.filter(
                  (i) => i.receiptStatus === 'RECEIVED' && i.inspectionResult === 'PENDING',
                );
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/warehouse/${r.id}`} className="font-medium text-indigo-700 hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td>{r.order.orderNumber}</td>
                    <td className="hidden md:table-cell">{r.customer.displayName}</td>
                    <td>
                      {awaitingGoods ? (
                        <Pill tone="blue">{expectedUnits} unit(s) expected</Pill>
                      ) : toInspect.length > 0 ? (
                        <Pill tone="amber">{toInspect.length} item(s) to inspect</Pill>
                      ) : (
                        <span className="muted">finishing up</span>
                      )}
                    </td>
                    <td>
                      <Pill tone={awaitingGoods ? 'slate' : 'violet'}>{awaitingGoods ? 'awaiting goods' : 'inspection'}</Pill>
                    </td>
                    <td className="muted hidden sm:table-cell">{formatDate(r.updatedAt)}</td>
                    <td className="text-right">
                      <Link href={`/warehouse/${r.id}`} className="btn-primary px-4 py-2.5 text-sm sm:px-3 sm:py-1.5">
                        {awaitingGoods ? 'Register' : 'Inspect'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/warehouse" params={{ q: query, stage }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
