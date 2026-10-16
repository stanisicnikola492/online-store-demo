/** Shared page scaffold: same title/subtitle/action placement on every list screen. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <div className="muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

/**
 * Plain GET form, no client JS: typing a query and pressing Enter (or tapping Search)
 * reloads the page with ?q=… . Filters travel along as hidden/visible inputs.
 */
export function SearchBar({
  action,
  query,
  placeholder,
  filters,
}: {
  action: string;
  query?: string;
  placeholder: string;
  filters?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-center gap-2" role="search">
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field w-full max-w-xs flex-1"
      />
      {filters}
      <button type="submit" className="btn-secondary">
        Search
      </button>
    </form>
  );
}
