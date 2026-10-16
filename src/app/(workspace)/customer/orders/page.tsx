import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { StatusPill, formatDate, money } from '@/components/ui';
import { PageHeader, SearchBar, EmptyState } from '@/components/ListControls';
import { Pagination, parsePage, pickParam } from '@/components/Pagination';

const PAGE_SIZE = 10;

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('CUSTOMER');
  const sp = await searchParams;
  const query = pickParam(sp.q)?.trim();
  const page = parsePage(sp.page);

  // The MySQL collation is case-insensitive (utf8mb4_unicode_ci), so `contains` searches like a user expects.
  const where = {
    customerId: user.id,
    ...(query
      ? {
          OR: [
            { orderNumber: { contains: query } },
            { items: { some: { productName: { contains: query } } } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { select: { unitPrice: true, quantity: true } },
        returnRequests: { select: { id: true, status: true } },
      },
      orderBy: [{ placedAt: 'desc' }, { id: 'asc' }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.order.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Your orders"
        subtitle="Every order on this account. Open a delivered one to start a return."
        actions={
          <Link href="/customer" className="btn-secondary">
            ← Dashboard
          </Link>
        }
      />

      <SearchBar
        action="/customer/orders"
        query={query}
        placeholder="Search by order number or product"
      />

      {orders.length === 0 ? (
        <div className="panel">
          <EmptyState>
            {query ? (
              <>
                No orders match “{query}”. <Link href="/customer/orders" className="text-indigo-700 underline">Clear the search</Link>
              </>
            ) : (
              'No orders found for this account.'
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th className="hidden sm:table-cell">Delivered</th>
                <th className="hidden md:table-cell">Lines</th>
                <th>Total</th>
                <th className="hidden lg:table-cell">Paid with</th>
                <th className="hidden md:table-cell">Returns</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totalMinor = order.items.reduce(
                  (sum, i) => sum + i.quantity * Math.round(Number(i.unitPrice) * 100),
                  0,
                );
                const returnable = order.status === 'DELIVERED';
                return (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/customer/orders/${order.id}`} className="font-medium text-indigo-700 hover:underline">
                        {order.orderNumber}
                      </Link>
                      <div className="mt-0.5">
                        <StatusPill status={order.status} />
                      </div>
                    </td>
                    <td className="hidden sm:table-cell">{formatDate(order.deliveredAt)}</td>
                    <td className="hidden md:table-cell">{order.items.length}</td>
                    <td className="font-medium">{money(totalMinor)}</td>
                    <td className="muted hidden lg:table-cell">{order.paymentMethod}</td>
                    <td className="hidden md:table-cell">
                      {order.returnRequests.length > 0 ? (
                        <span className="inline-flex flex-wrap gap-1">
                          {order.returnRequests.slice(0, 3).map((r) => (
                            <Link key={r.id} href={`/customer/requests/${r.id}`} title="Open this return request">
                              <StatusPill status={r.status} />
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/customer/orders/${order.id}`}
                        className={returnable ? 'btn-primary px-3 py-1.5 text-sm' : 'btn-secondary px-3 py-1.5 text-sm'}
                      >
                        {returnable ? 'Start a return' : 'View'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/customer/orders" params={{ q: query }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
