import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GROUPS, MODULES, ModuleDef } from '../catalog';
import { api } from '../lib/api';
import { Profile, useAuth } from '../lib/auth-store';
import { NavIcon } from './icons';
import { TenantNeeded } from '../pages/Crud';

const flows = [
  { to: '/quote-to-cash', label: 'Quote to cash', icon: 'quote-to-cash' },
  { to: '/people-ops', label: 'HR desk', icon: 'people-ops' },
  { to: '/service', label: 'Service desk', icon: 'service' },
  { to: '/dispatch', label: 'Dispatch desk', icon: 'dispatch' },
  { to: '/automation', label: 'Automation', icon: 'automation' },
  { to: '/field', label: 'Field', icon: 'field' },
  { to: '/go-live', label: 'Go-live', icon: 'go-live' },
];

function linkClass(active: boolean) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium leading-snug transition ${
    active ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-slate-200 hover:bg-white/5 hover:text-white'
  }`;
}

function Item({
  to,
  icon,
  children,
  end,
  onClick,
}: {
  to: string;
  icon: string;
  children: string;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink to={to} end={end} preventScrollReset className={({ isActive }) => linkClass(isActive)} onClick={onClick}>
      <NavIcon name={icon} className="h-5 w-5 opacity-90" />
      <span>{children}</span>
    </NavLink>
  );
}

function currentModule(pathname: string) {
  return [...MODULES]
    .sort((a, b) => b.slug.length - a.slug.length)
    .find((item) => pathname === `/${item.slug}` || pathname.startsWith(`/${item.slug}/`));
}

function SidebarNav({
  profileAdmin,
  grouped,
  open,
  query,
  onToggle,
  onNavigate,
}: {
  profileAdmin?: boolean;
  grouped: { id: ModuleDef['group']; label: string; items: ModuleDef[] }[];
  open: string[];
  query: string;
  onToggle: (group: string) => void;
  onNavigate: () => void;
}) {
  return (
    <>
      <Item to="/" icon="overview" end onClick={onNavigate}>
        Overview
      </Item>
      {profileAdmin ? (
        <Item to="/tenants" icon="tenants" onClick={onNavigate}>
          Tenants
        </Item>
      ) : null}
      <Item to="/users" icon="users" onClick={onNavigate}>
        Users
      </Item>
      <Item to="/company" icon="recycle-bin" onClick={onNavigate}>
        Company admin
      </Item>
      <Item to="/notifications" icon="inbox" onClick={onNavigate}>
        Inbox
      </Item>
      <div>
        <p className="px-3 text-[11px] uppercase tracking-widest text-slate-400 mb-1.5 mt-4">Guided flows</p>
        {flows.map((item) => (
          <Item key={item.to} to={item.to} icon={item.icon} onClick={onNavigate}>
            {item.label}
          </Item>
        ))}
      </div>
      {grouped.map((group) => {
        const expanded = open.includes(group.id) || Boolean(query);
        return (
          <div key={group.id} className="mt-3">
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] uppercase tracking-widest text-slate-400"
              onClick={() => onToggle(group.id)}
            >
              {group.label}
              <span className="text-slate-500 text-sm">{expanded ? '–' : '+'}</span>
            </button>
            {expanded
              ? group.items.map((item) => (
                  <Item key={item.slug} to={`/${item.slug}`} icon={item.slug} onClick={onNavigate}>
                    {item.title}
                  </Item>
                ))
              : null}
          </div>
        );
      })}
    </>
  );
}

export function AppShell() {
  const { profile, clear, accessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const current = currentModule(location.pathname);
  const [open, setOpen] = useState<string[]>(() => [current?.group ?? 'sales']);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const skipTenant = location.pathname === '/tenants' || location.pathname === '/select-tenant';

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let cancelled = false;
    api<Profile>('/me', { token: accessToken })
      .then((next) => {
        if (cancelled) {
          return;
        }
        const state = useAuth.getState();
        if (state.accessToken && state.refreshToken) {
          state.setSession(state.accessToken, state.refreshToken, next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!current?.group) {
      return;
    }
    setOpen((groups) => (groups.includes(current.group) ? groups : [...groups, current.group]));
  }, [current?.group]);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: MODULES.filter(
          (item) => item.group === group.id && (!query || item.title.toLowerCase().includes(query.toLowerCase())),
        ),
      })).filter((group) => group.items.length),
    [query],
  );

  function toggle(group: string) {
    setOpen((groups) => (groups.includes(group) ? groups.filter((item) => item !== group) : [...groups, group]));
  }

  const nav = (
    <SidebarNav
      profileAdmin={profile?.isPlatformAdmin}
      grouped={grouped}
      open={open}
      query={query}
      onToggle={toggle}
      onNavigate={() => setMenu(false)}
    />
  );

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[292px_1fr]">
      <aside className="hidden lg:flex bg-navy text-white px-3 py-5 flex-col max-h-screen sticky top-0">
        <Link to="/" preventScrollReset className="px-3 mb-5 flex items-center gap-3">
          <span className="h-10 w-10 rounded-2xl bg-accent grid place-items-center display text-lg">R</span>
          <span>
            <p className="display text-xl leading-none">Refurbicon</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-teal-300 mt-1">Operations ERP</p>
          </span>
        </Link>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a module"
          className="mx-2 mb-4 rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 text-[15px] text-white placeholder:text-slate-500 outline-none focus:border-teal-400"
        />
        <nav className="flex-1 overflow-y-auto pr-1 space-y-0.5 [overflow-anchor:none]">
          {nav}
        </nav>
        <div className="mt-4 pt-4 border-t border-white/10 px-3">
          <p className="text-[15px] font-medium truncate">{profile?.displayName}</p>
          <p className="text-sm text-slate-400 mt-1 truncate">{profile?.currentTenant?.name ?? 'No tenant'}</p>
          <button
            className="mt-3 text-teal-300 text-sm uppercase tracking-wider"
            onClick={() => {
              clear();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 bg-white/85 backdrop-blur border-b border-line px-4 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button className="lg:hidden rounded-xl border border-line px-3 py-2 text-[15px]" onClick={() => setMenu((value) => !value)}>
              Menu
            </button>
            <p className="text-[15px] text-ink-soft truncate">
              {profile?.currentTenant?.name ?? 'Select a tenant'} · {profile?.currentTenant?.currency ?? 'INR'}
            </p>
          </div>
          <p className="text-[15px] font-medium truncate">{profile?.email}</p>
        </header>
        {menu ? <div className="lg:hidden bg-navy text-white px-3 py-4 max-h-[70vh] overflow-y-auto">{nav}</div> : null}
        <main className="px-4 lg:px-10 py-8 max-w-7xl">
          {skipTenant || profile?.tenantId ? <Outlet /> : <TenantNeeded />}
        </main>
      </div>
    </div>
  );
}
