import { ButtonHTMLAttributes, ReactNode } from 'react';

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">{kicker}</p>
        <h1 className="display text-3xl md:text-[2.15rem] mt-1 tracking-tight">{title}</h1>
        {subtitle ? <p className="text-ink-soft mt-2 max-w-2xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-card border border-line rounded-2xl surface ${className}`}>{children}</div>;
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-dark shadow-sm',
    ghost: 'border border-line bg-white hover:bg-slate',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    soft: 'bg-accent/10 text-accent hover:bg-accent/15',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  const map: Record<string, string> = {
    slate: 'bg-slate text-ink-soft',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-sky-50 text-sky-800',
  };
  const key = children ? String(children).toUpperCase() : '';
  const toneFromStatus =
    /POSTED|APPROVED|DELIVERED|ACTIVE|READY|PUBLISHED|LOCKED|PAID|OPEN/.test(key)
      ? 'green'
      : /DRAFT|PENDING|HOLD|HELD|NEW/.test(key)
        ? 'amber'
        : /CANCEL|FAIL|REJECT|REVERSE|TERMINAT/.test(key)
          ? 'rose'
          : /SHIP|PACK|REPAIR|INSPECT|ASSIGN/.test(key)
            ? 'blue'
            : tone;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[toneFromStatus] ?? map.slate}`}>
      {children}
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center text-lg">◇</div>
      <p className="font-semibold">{title}</p>
      {hint ? <p className="text-sm text-ink-soft mt-1">{hint}</p> : null}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-sky-600 text-white display text-xl">
      {initial}
    </span>
  );
}

export const inputClass =
  'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/10';

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1 && total <= 20) {
    return null;
  }
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line text-sm">
      <p className="text-ink-soft">{total} records</p>
      <div className="flex items-center gap-2">
        <button className="rounded-lg border border-line px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          {page} / {pageCount}
        </span>
        <button className="rounded-lg border border-line px-3 py-1 disabled:opacity-40" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
