import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Pill, formatDateTime } from '@/components/ui';
import { Action } from '@/components/Action';
import { PageHeader, EmptyState } from '@/components/ListControls';
import { Pagination, buildListHref, parsePage, pickParam } from '@/components/Pagination';

const PAGE_SIZE = 20;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = pickParam(sp.view) === 'unread' ? 'unread' : 'all';
  const page = parsePage(sp.page);

  const where = { userId: user.id, ...(tab === 'unread' ? { readAt: null } : {}) };

  const [items, total, unreadTotal] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { returnRequest: { select: { reference: true, id: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  const requestHref = (id: string) =>
    user.role === 'CUSTOMER'
      ? `/customer/requests/${id}`
      : user.role === 'OPERATOR'
        ? `/operator/${id}`
        : user.role === 'WAREHOUSE'
          ? `/warehouse/${id}`
          : `/finance/${id}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alerts"
        subtitle="Generated from the outbox table — the same events the audit trail stores, delivered as an in-app channel."
        actions={
          unreadTotal > 0 ? (
            <Action className="btn-secondary" path="/api/notifications/read" redirectTo="/notifications">
              Mark all read
            </Action>
          ) : null
        }
      />

      <div className="flex gap-1" role="tablist" aria-label="Filter alerts">
        {(
          [
            ['all', `All`],
            ['unread', `Unread (${unreadTotal})`],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={buildListHref('/notifications', { view: value === 'all' ? undefined : value }, 1)}
            role="tab"
            aria-selected={tab === value}
            className={
              tab === value
                ? 'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100'
            }
          >
            {label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="panel">
          <EmptyState>
            {tab === 'unread'
              ? 'All caught up — nothing unread.'
              : 'No alerts yet. New events appear here after the outbox worker runs (it is triggered on each page load of this screen).'}
          </EmptyState>
        </div>
      ) : (
        <ul className="panel divide-y divide-slate-100">
          {items.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start gap-2 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{n.title}</span>
                  {n.readAt ? <Pill tone="slate">read</Pill> : <Pill tone="blue">new</Pill>}
                  <span className="muted ml-auto text-xs">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="muted mt-1 text-sm">{n.body}</p>
                {n.returnRequest ? (
                  <Link href={requestHref(n.returnRequest.id)} className="text-sm text-indigo-700 hover:underline">
                    Open request
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        basePath="/notifications"
        params={{ view: tab === 'unread' ? 'unread' : undefined }}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </div>
  );
}
