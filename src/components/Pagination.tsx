/** Normalises a Next.js searchParams entry to a single optional string. */
export function pickParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0] || undefined;
  return value || undefined;
}

/** Guards ?page= against garbage: only positive integers are page numbers. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(pickParam(value));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * Guards a filter value against garbage: anything outside `allowed` is treated as "no filter".
 * A hand-typed ?status=... must not reach Prisma as an enum value, which would throw a 500.
 */
export function pickEnum<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const raw = pickParam(value);
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** Builds a list URL that keeps every active filter while moving to another page. */
export function buildListHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) sp.set(key, value);
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Server-rendered pagination: real links, so it works with a mouse, a keyboard and
 * without JavaScript. Always shows where you are and how much is left.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const pages: Array<number | 'gap'> = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(pageCount, current + 2);
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push('gap');
  }
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < pageCount) {
    if (end < pageCount - 1) pages.push('gap');
    pages.push(pageCount);
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Pagination">
      <p className="muted text-xs">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        {current > 1 ? (
          <a href={buildListHref(basePath, params, current - 1)} className="btn-secondary px-3 py-1.5 text-sm" rel="prev">
            ← Prev
          </a>
        ) : (
          <span className="btn-secondary cursor-not-allowed px-3 py-1.5 text-sm opacity-50" aria-hidden="true">← Prev</span>
        )}
        {pages.map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : p === current ? (
            <span key={p} aria-current="page" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">
              {p}
            </span>
          ) : (
            <a key={p} href={buildListHref(basePath, params, p)} className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              {p}
            </a>
          ),
        )}
        {current < pageCount ? (
          <a href={buildListHref(basePath, params, current + 1)} className="btn-secondary px-3 py-1.5 text-sm" rel="next">
            Next →
          </a>
        ) : (
          <span className="btn-secondary cursor-not-allowed px-3 py-1.5 text-sm opacity-50" aria-hidden="true">Next →</span>
        )}
      </div>
    </nav>
  );
}
