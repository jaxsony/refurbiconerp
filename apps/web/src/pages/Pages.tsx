import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, asList, asPage } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { Badge, Button, Card, PageHeader, Pagination, inputClass } from '../components/ui';

function useToken() {
  return useAuth((s) => s.accessToken);
}

export function DashboardPage() {
  const token = useToken();
  const profile = useAuth((s) => s.profile);
  const enabled = Boolean(token && profile?.tenantId);
  const employees = useQuery({ queryKey: ['/employees'], queryFn: () => api<unknown>('/employees', { token }).then(asPage), enabled });
  const tickets = useQuery({ queryKey: ['/service-tickets'], queryFn: () => api<unknown>('/service-tickets', { token }).then(asPage), enabled });
  const orders = useQuery({ queryKey: ['/sales-orders'], queryFn: () => api<unknown>('/sales-orders', { token }).then(asList), enabled });
  const invoices = useQuery({ queryKey: ['/invoices'], queryFn: () => api<unknown>('/invoices', { token }).then(asList), enabled });
  const ready = useQuery({ queryKey: ['/go-live/readiness'], queryFn: () => api<{ ready: boolean }>('/go-live/readiness', { token }), enabled });

  if (!profile?.tenantId) {
    return (
      <div>
        <PageHeader kicker="Workspace" title="Select a tenant" />
        <Card className="p-6">
          <p>Enter a tenant from the Tenants screen before operating on company data.</p>
        </Card>
      </div>
    );
  }

  const stats = [
    { label: 'Employees', value: employees.data?.total ?? '—', to: '/employees', hint: 'People master' },
    { label: 'Sales orders', value: orders.data?.length ?? '—', to: '/sales-orders', hint: 'Quote to cash' },
    { label: 'Invoices', value: invoices.data?.length ?? '—', to: '/invoices', hint: 'Accounts' },
    { label: 'Tickets', value: tickets.data?.total ?? '—', to: '/service-tickets', hint: 'Service desk' },
  ];

  return (
    <div>
      <PageHeader
        kicker={profile.currentTenant?.name ?? 'Tenant'}
        title="Today in operations"
        subtitle={`${profile.currentTenant?.timezone} · ${profile.currentTenant?.currency} · ${ready.data?.ready ? 'Go-live ready' : 'Setup remaining'}`}
      />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map((item) => (
          <Link key={item.label} to={item.to}>
            <Card className="p-5 hover:-translate-y-0.5 transition">
              <p className="text-sm text-ink-soft">{item.label}</p>
              <p className="display text-4xl mt-2">{item.value}</p>
              <p className="text-xs text-accent mt-3">{item.hint} →</p>
            </Card>
          </Link>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { to: '/customers/new', title: 'Add customer', hint: 'Party master' },
          { to: '/quotations/new', title: 'Create quotation', hint: 'Quote to cash' },
          { to: '/service-tickets/new', title: 'Open ticket', hint: 'RMA intake' },
          { to: '/employees/new', title: 'Add employee', hint: 'People' },
          { to: '/payroll-runs/new', title: 'Run payroll', hint: 'HR-007' },
          { to: '/go-live', title: 'Go-live checklist', hint: 'Readiness' },
        ].map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="p-5 h-full hover:border-accent transition">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-ink-soft mt-1">{item.hint}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function UsersPage() {
  const token = useToken();
  const tenantId = useAuth((s) => s.profile?.tenantId);
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const emptyForm = {
    displayName: '',
    email: '',
    phone: '',
    password: '',
    roleCode: '',
    departmentId: '',
    defaultBranchId: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
  };
  const [form, setForm] = useState(emptyForm);
  type Member = {
    id: string;
    status: string;
    departmentId?: string | null;
    defaultBranchId?: string | null;
    department?: { name: string } | null;
    defaultBranch?: { name: string } | null;
    user: {
      displayName: string;
      email: string;
      phone?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
      isActive: boolean;
    };
    roles: { role: { name: string; code: string } }[];
  };
  const users = useQuery({
    queryKey: ['users', page, q],
    queryFn: () => api<unknown>(`/users?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`, { token }).then((data) => asPage<Member>(data)),
    enabled: Boolean(token && tenantId),
  });
  const roles = useQuery({
    queryKey: ['/roles', 'dropdown'],
    queryFn: () => api<unknown>('/roles?pageSize=200', { token }).then((data) => asList<{ code: string; name: string }>(data)),
    enabled: Boolean(token && tenantId),
  });
  const departments = useQuery({
    queryKey: ['/departments', 'dropdown'],
    queryFn: () => api<unknown>('/departments?pageSize=200', { token }).then((data) => asList<{ id: string; name: string }>(data)),
    enabled: Boolean(token && tenantId),
  });
  const branches = useQuery({
    queryKey: ['/branches', 'dropdown'],
    queryFn: () => api<unknown>('/branches?pageSize=200', { token }).then((data) => asList<{ id: string; name: string }>(data)),
    enabled: Boolean(token && tenantId),
  });

  function fill(row: Member) {
    setSelected(row.id);
    setForm({
      displayName: row.user.displayName,
      email: row.user.email,
      phone: row.user.phone ?? '',
      password: '',
      roleCode: row.roles[0]?.role.code ?? '',
      departmentId: row.departmentId ?? '',
      defaultBranchId: row.defaultBranchId ?? '',
      addressLine1: row.user.addressLine1 ?? '',
      addressLine2: row.user.addressLine2 ?? '',
      city: row.user.city ?? '',
      state: row.user.state ?? '',
      postalCode: row.user.postalCode ?? '',
      country: row.user.country ?? 'IN',
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
      return selected
        ? api(`/users/${selected}`, { method: 'PATCH', token, body: { ...body, password: form.password || undefined } })
        : api('/users/invites', { method: 'POST', token, body: { ...body, password: form.password || undefined } });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['users'] });
      setSelected(null);
      setForm(emptyForm);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  function field(name: keyof typeof form, placeholder: string, type = 'text') {
    return (
      <input
        className={inputClass}
        placeholder={placeholder}
        type={type}
        value={form[name]}
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
        required={['displayName', 'email'].includes(name) && !selected}
      />
    );
  }

  if (!tenantId) {
    return (
      <div>
        <PageHeader kicker="ADM-002" title="Select a company" subtitle="Choose a tenant before managing users." />
        <Card className="p-6">
          <Link to="/tenants" className="text-accent font-medium">
            Open tenants
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader kicker="ADM-002" title="Users" subtitle="Name, phone, address, password, role, department and branch for each company login." />
      <div className="grid lg:grid-cols-[1.35fr_0.85fr] gap-6">
        <Card className="overflow-hidden">
          <div className="p-4">
            <input
              className={inputClass}
              placeholder="Search name, email or phone"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-soft bg-slate/60">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th>Phone</th>
                <th>City</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(users.data?.items ?? []).map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-line cursor-pointer ${selected === row.id ? 'bg-teal-50/70' : ''}`}
                  onClick={() => fill(row)}
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">{row.user.displayName}</p>
                    <p className="text-ink-soft text-xs">{row.user.email}</p>
                  </td>
                  <td>{row.user.phone || '—'}</td>
                  <td>{row.user.city || '—'}</td>
                  <td>{row.roles.map((item) => item.role.name).join(', ')}</td>
                  <td>
                    <Badge>{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={users.data?.page ?? page}
            pageCount={users.data?.pageCount ?? 1}
            total={users.data?.total ?? 0}
            onPage={setPage}
          />
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">{selected ? 'Edit user' : 'New user'}</h2>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            {field('displayName', 'Full name')}
            {field('email', 'Email', 'email')}
            {field('phone', 'Phone')}
            {field('password', selected ? 'New password (optional)' : 'Password', 'password')}
            <select className={inputClass} value={form.roleCode} onChange={(event) => setForm((current) => ({ ...current, roleCode: event.target.value }))} required={!selected}>
              <option value="">Role</option>
              {(roles.data ?? []).map((role) => (
                <option key={role.code} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
            <select className={inputClass} value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}>
              <option value="">Department</option>
              {(departments.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <select className={inputClass} value={form.defaultBranchId} onChange={(event) => setForm((current) => ({ ...current, defaultBranchId: event.target.value }))}>
              <option value="">Branch</option>
              {(branches.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            {field('addressLine1', 'Address line 1')}
            {field('addressLine2', 'Address line 2')}
            {field('city', 'City')}
            {field('state', 'State')}
            {field('postalCode', 'Postal code')}
            {field('country', 'Country')}
            {save.isError ? <p className="text-sm text-rose-700">{(save.error as Error).message}</p> : null}
            <div className="flex gap-2">
              <Button className="flex-1" type="submit" disabled={save.isPending}>
                {selected ? 'Save user' : 'Create user'}
              </Button>
              {selected ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSelected(null);
                    setForm(emptyForm);
                  }}
                >
                  New
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export function TenantsPage() {
  const token = useToken();
  const navigate = useNavigate();
  const { profile, setSession } = useAuth();
  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api<unknown>('/tenants', { token }).then((data) => asList<{ id: string; name: string; slug: string; status: string }>(data)),
    enabled: Boolean(profile?.isPlatformAdmin),
  });
  const memberships = profile?.memberships ?? [];
  const cards = profile?.isPlatformAdmin ? (tenants.data ?? []) : memberships.map((item) => item.tenant);

  async function enter(tenantId: string) {
    const result = await api<{ accessToken: string; refreshToken: string; user: NonNullable<typeof profile> }>('/auth/tenant-context', {
      method: 'POST',
      token,
      body: { tenantId },
    });
    setSession(result.accessToken, result.refreshToken, result.user);
    navigate('/');
  }

  return (
    <div>
      <PageHeader kicker="TEN-007" title="Tenant context" subtitle="Choose the company you are working in." />
      <div className="grid md:grid-cols-2 gap-4">
        {cards.map((tenant) => (
          <Card key={tenant.id} className="p-6">
            <p className="display text-2xl">{tenant.name}</p>
            <p className="text-sm text-ink-soft mt-1">{(tenant as { slug?: string }).slug ?? tenant.id}</p>
            <Button className="mt-4" onClick={() => enter(tenant.id)}>
              Work here
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
