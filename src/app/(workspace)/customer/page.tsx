import Link from 'next/link';
import type { RequestStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { StatusPill, formatDate, money } from '@/components/ui';
import { PageHeader, EmptyState } from '@/components/ListControls';

const DONE: RequestStatus[] = ['CLOSED', 'CANCELLED', 'APPEAL_REJECTED'];
const NEEDS_CUSTOMER: RequestStatus[] = ['DRAFT', 'FULLY_REJECTED'];

const STEPS = [
  { title: 'Pick the order and items', body: 'Open a delivered order, choose what comes back and tell us why.' },
  { title: 'Send it back', body: 'Once we approve the request, ship the goods — we say who pays the return shipping.' },
  { title: 'Get your money', body: 'Our warehouse inspects the items and finance pays you back the way you paid.' },
];

export default async function CustomerDashboardPage() {
  const user = await requireRole('CUSTOMER');

  const [activeCount, needsYou, refundedAggregate, unread, recentRequests, recentOrders] = await Promise.all([
    prisma.returnRequest.count({ where: { customerId: user.id, status: { notIn: DONE } } }),
    prisma.returnRequest.findMany({
      where: { customerId: user.id, status: { in: NEEDS_CUSTOMER } },
      select: { id: true, reference: true, status: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.refund.aggregate({
      where: { returnRequest: { customerId: user.id }, status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.returnRequest.findMany({
      where: { customerId: user.id },
      include: { order: { select: { orderNumber: true } }, _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.order.findMany({
      where: { customerId: user.id, status: 'DELIVERED' },
      include: { items: { select: { unitPrice: true, quantity: true } }, _count: { select: { returnRequests: true } } },
      orderBy: { deliveredAt: 'desc' },
      take: 5,
    }),
  ]);

  const refundedMinor = Math.round(Number(refundedAggregate._sum.amount ?? 0) * 100);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${user.displayName.split(' ')[0]}`}
        subtitle="Here is where your returns stand. Start a new one from any delivered order."
        actions={
          <Link href="/customer/orders" className="btn-primary">
            Start a return
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <div className="card">
          <p className="muted text-xs uppercase tracking-wide">Active returns</p>
          <p className="stat-value mt-1">{activeCount}</p>
          <Link href="/customer/requests" className="text-sm text-indigo-700 hover:underline">
            View all
          </Link>
        </div>
        <div className="card">
          <p className="muted text-xs uppercase tracking-wide">Waiting on you</p>
          <p className="stat-value mt-1">{needsYou.length}</p>
          <p className="text-xs text-slate-500">
            {needsYou.length === 0
              ? 'Nothing to finish or appeal'
              : needsYou.map((r) => r.reference).join(', ')}
          </p>
        </div>
        <div className="card">
          <p className="muted text-xs uppercase tracking-wide">Refunded to you</p>
          <p className="stat-value mt-1">{money(refundedMinor)}</p>
          <p className="text-xs text-slate-500">Settled payouts, all methods</p>
        </div>
        <div className="card">
          <p className="muted text-xs uppercase tracking-wide">Unread alerts</p>
          <p className="stat-value mt-1">{unread}</p>
          <Link href="/notifications" className="text-sm text-indigo-700 hover:underline">
            Open alerts
          </Link>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2" aria-label="Recent returns">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Recent return requests</h2>
            <Link href="/customer/requests" className="text-sm text-indigo-700 hover:underline">
              All requests →
            </Link>
          </div>
          {recentRequests.length === 0 ? (
            <div className="panel">
              <EmptyState>
                No returns yet. Pick one of your{' '}
                <Link href="/customer/orders" className="text-indigo-700 underline">
                  delivered orders
                </Link>{' '}
                to start the first one.
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
                    <th className="hidden md:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((r) => (
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
                      <td className="muted hidden md:table-cell">{formatDate(r.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card space-y-3" aria-label="How returns work">
          <h2 className="font-medium">How a return works</h2>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="muted text-sm">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="muted border-t border-slate-200 pt-3 text-xs">
            Changed your mind? You have 14 days after delivery and you pay the return shipping.
            Something wrong with the item? The window is 2 years and we pay the shipping.
          </p>
        </section>
      </div>

      <section className="space-y-3" aria-label="Recent orders">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recently delivered orders</h2>
          <Link href="/customer/orders" className="text-sm text-indigo-700 hover:underline">
            All orders →
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="panel">
            <EmptyState>No delivered orders yet — nothing can be returned.</EmptyState>
          </div>
        ) : (
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th className="hidden sm:table-cell">Delivered</th>
                  <th>Total</th>
                  <th className="hidden md:table-cell">Returns</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const totalMinor = order.items.reduce((sum, i) => sum + i.quantity * Math.round(Number(i.unitPrice) * 100), 0);
                  return (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/customer/orders/${order.id}`} className="font-medium text-indigo-700 hover:underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="hidden sm:table-cell">{formatDate(order.deliveredAt)}</td>
                      <td className="font-medium">{money(totalMinor)}</td>
                      <td className="muted hidden md:table-cell">{order._count.returnRequests}</td>
                      <td className="text-right">
                        <Link href={`/customer/orders/${order.id}`} className="btn-secondary px-3 py-1.5 text-sm">
                          Start / view
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
