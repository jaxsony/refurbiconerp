import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Field, ModuleDef, canDelete, moduleBySlug } from '../catalog';
import { api, asList, asPage } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { Avatar, Badge, Button, Card, Empty, PageHeader, Pagination, inputClass } from '../components/ui';
import { WorkflowPanel } from './Workflow';

type Row = Record<string, unknown> & { id: string };

function useToken() {
  return useAuth((s) => s.accessToken);
}

function cell(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    const record = value as { name?: string; number?: string; sku?: string; code?: string; title?: string; legalName?: string };
    return record.name ?? record.legalName ?? record.number ?? record.sku ?? record.code ?? record.title ?? JSON.stringify(value);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return new Date(text).toLocaleString();
  }
  return text;
}

function pretty(key: string) {
  return key
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function isStatus(key: string) {
  return key === 'status' || key === 'matchStatus' || key === 'priority';
}

function titleOf(row: Row, fallback: string) {
  return cell(row.number ?? row.name ?? row.code ?? row.title ?? row.sku ?? fallback);
}

function buildPayload(mod: ModuleDef, form: Record<string, string>, mode: 'create' | 'edit') {
  const body: Record<string, unknown> = {};
  for (const field of mod.fields) {
    const raw = form[field.name];
    if (raw === undefined || raw === '') {
      continue;
    }
    body[field.name] = field.type === 'number' ? Number(raw) : raw;
  }
  if (['quotations', 'sales-orders', 'purchase-orders'].includes(mod.slug) && mode === 'create') {
    return {
      partyId: form.partyId,
      notes: form.notes || undefined,
      lines: [{ productId: form.productId, qty: Number(form.qty || 1) }],
    };
  }
  if (mod.slug === 'payments' && mode === 'create') {
    return {
      partyId: form.partyId,
      amount: Number(form.amount),
      method: form.method || 'BANK',
      reference: form.reference || undefined,
      allocations: [{ invoiceId: form.invoiceId, amount: Number(form.amount) }],
    };
  }
  if (mod.slug === 'marketplace-orders' && mode === 'create') {
    return { channel: form.channel, externalId: form.externalId, payload: {} };
  }
  if (mod.slug === 'pick-lists' && mode === 'create') {
    const payload: Record<string, string> = {};
    if (form.salesOrderId) payload.salesOrderId = form.salesOrderId;
    if (form.ticketId) payload.ticketId = form.ticketId;
    return payload;
  }
  if (mod.slug === 'vendors' && mode === 'create') {
    return { ...body, type: 'VENDOR' };
  }
  if (mod.slug === 'salary-structures' && mode === 'create') {
    const lines = [
      { component: 'Basic', kind: 'EARNING', amount: Number(form.basic || 0) },
      { component: 'HRA', kind: 'EARNING', amount: Number(form.hra || 0) },
      { component: 'PF', kind: 'DEDUCTION', amount: Number(form.deduction || 0) },
    ].filter((line) => line.amount > 0);
    return { employeeId: form.employeeId, effectiveFrom: form.effectiveFrom, lines };
  }
  if (mod.slug === 'incentive-awards' && mode === 'create') {
    return { schemeId: form.schemeId, periodStart: form.periodStart, periodEnd: form.periodEnd };
  }
  return body;
}

function FieldInput({
  field,
  value,
  onChange,
  token,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  token: string | null;
}) {
  const options = useQuery({
    queryKey: [field.from, 'dropdown'],
    queryFn: () => api<unknown>(`${field.from}?pageSize=200`, { token }).then((data) => asList<Row>(data)),
    enabled: Boolean((field.type === 'relation' || field.from) && token && field.from && useAuth.getState().profile?.tenantId),
  });
  if (field.type === 'textarea') {
    return <textarea className={inputClass} rows={4} value={value} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.type === 'select' && field.options && !field.from) {
    return (
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} required={field.required}>
        <option value="">Select</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'relation' || field.from) {
    const key = field.labelKey ?? 'name';
    const valueKey = field.valueKey ?? 'id';
    return (
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} required={field.required}>
        <option value="">Select</option>
        {(options.data ?? []).map((row) => (
          <option key={String(row[valueKey] ?? row.id)} value={String(row[valueKey] ?? row.id)}>
            {cell(row[key] ?? row.name ?? row.number ?? row.sku ?? row.code ?? row.id)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className={inputClass}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
      placeholder={field.placeholder}
      value={value}
      required={field.required}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function TenantNeeded() {
  const profile = useAuth((s) => s.profile);
  return (
    <div>
      <PageHeader
        kicker="Workspace"
        title="Select a company"
        subtitle={
          profile?.isPlatformAdmin
            ? 'Superadmin can work in any tenant. Choose a company first, then this module will load.'
            : 'An active tenant is required before opening this module.'
        }
      />
      <Card className="p-6">
        <Link to="/tenants" className="text-accent font-medium">
          Open tenants
        </Link>
      </Card>
    </div>
  );
}

function useModule() {
  const { slug } = useParams();
  const mod = slug ? moduleBySlug(slug) : undefined;
  return { slug, mod };
}

function DetailValue({ field, value }: { field?: string; value: unknown }) {
  if (field && isStatus(field)) {
    return <Badge>{cell(value)}</Badge>;
  }
  return <>{cell(value)}</>;
}

export function CrudListPage() {
  const { mod } = useModule();
  const token = useToken();
  const tenantId = useAuth((s) => s.profile?.tenantId);
  const client = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const rows = useQuery({
    queryKey: [mod?.path, page, q],
    queryFn: () =>
      api<unknown>(`${mod!.path}?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`, { token }).then((data) => asPage<Row>(data)),
    enabled: Boolean(mod && token && tenantId),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/records/${mod?.slug}/${id}`, { method: 'DELETE', token }),
    onSuccess: () => client.invalidateQueries({ queryKey: [mod?.path] }),
  });
  if (!tenantId) {
    return <TenantNeeded />;
  }
  if (!mod) {
    return <p>Unknown module</p>;
  }
  const filtered = rows.data?.items ?? [];
  return (
    <div>
      <PageHeader
        kicker={mod.kicker}
        title={mod.title}
        subtitle={mod.subtitle ?? `${filtered.length} record${filtered.length === 1 ? '' : 's'} · open any row for the full record, then edit from there.`}
        actions={
          <>
            <input
              className={`${inputClass} w-56`}
              placeholder="Search this list"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
            />
            {mod.createable !== false && mod.fields.length ? (
              <Link to={`/${mod.slug}/new`} className="inline-flex items-center rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium">
                New {mod.singular.toLowerCase()}
              </Link>
            ) : null}
          </>
        }
      />
      <Card>
        {rows.isError ? <p className="px-5 py-4 text-rose-700">{(rows.error as Error).message}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line bg-slate/60">
                {mod.columns.map((col) => (
                  <th key={col.key} className="px-5 py-3 font-medium">
                    {col.label}
                  </th>
                ))}
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0 hover:bg-teal-50/40">
                  {mod.columns.map((col, index) => (
                    <td key={col.key} className="px-5 py-3.5">
                      {index === 0 ? (
                        <Link className="font-semibold text-ink hover:text-accent" to={`/${mod.slug}/${row.id}`}>
                          {isStatus(col.key) ? <Badge>{cell(row[col.key])}</Badge> : cell(row[col.key])}
                        </Link>
                      ) : isStatus(col.key) ? (
                        <Badge>{cell(row[col.key])}</Badge>
                      ) : (
                        cell(row[col.key])
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <Link className="text-accent font-medium mr-3" to={`/${mod.slug}/${row.id}`}>
                      View
                    </Link>
                    {mod.editable !== false && mod.fields.length ? (
                      <Link className="text-ink-soft hover:text-ink mr-3" to={`/${mod.slug}/${row.id}/edit`}>
                        Edit
                      </Link>
                    ) : null}
                    {canDelete(mod) ? (
                      <button
                        className="text-rose-700 font-medium"
                        onClick={() => {
                          if (window.confirm(`Hide this ${mod.singular.toLowerCase()}? Company admins can restore it.`)) {
                            remove.mutate(row.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.isLoading ? <Empty title="Loading…" /> : null}
          {!rows.isLoading && !filtered.length ? (
            <Empty
              title={`No ${mod.title.toLowerCase()} yet`}
              hint={mod.createable !== false ? `Create the first ${mod.singular.toLowerCase()} to get started.` : undefined}
            />
          ) : null}
          <Pagination
            page={rows.data?.page ?? page}
            pageCount={rows.data?.pageCount ?? 1}
            total={rows.data?.total ?? filtered.length}
            onPage={setPage}
          />
        </div>
      </Card>
    </div>
  );
}

export function CrudViewPage() {
  const { mod, slug } = useModule();
  const { id } = useParams();
  const token = useToken();
  const tenantId = useAuth((s) => s.profile?.tenantId);
  const navigate = useNavigate();
  const client = useQueryClient();
  const record = useQuery({
    queryKey: ['/records', slug, id],
    queryFn: () =>
      api<Row>(slug === 'service-tickets' || slug === 'tasks' ? `/${slug}/${id}` : `/records/${slug}/${id}`, { token }),
    enabled: Boolean(slug && id && token && tenantId),
  });
  const remove = useMutation({
    mutationFn: () => api(`/records/${slug}/${id}`, { method: 'DELETE', token }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [mod?.path] });
      navigate(`/${slug}`);
    },
  });
  const [message, setMessage] = useState('');

  async function run(path: string, body?: Record<string, unknown>) {
    setMessage('');
    try {
      await api(path, { method: 'POST', token, body });
      setMessage('Done');
      record.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
    }
  }

  if (!tenantId) {
    return <TenantNeeded />;
  }
  if (!mod || !id) {
    return <p>Unknown module</p>;
  }
  const row = record.data;
  const used = new Set(['id', 'tenantId', ...mod.fields.map((field) => field.name), ...mod.columns.map((col) => col.key)]);
  const extras = row
    ? Object.entries(row).filter(([key, value]) => !used.has(key) && !Array.isArray(value) && typeof value !== 'object')
    : [];
  const relations = row
    ? Object.entries(row).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value) && !used.has('skip'))
        .filter(([key]) => !['id', 'tenantId'].includes(key) && !mod.fields.some((field) => field.name === key))
    : [];
  const collections = row
    ? Object.entries(row).filter(([key, value]) => Array.isArray(value) && value.length && key !== 'assignments' && key !== 'workflow')
    : [];

  return (
    <div>
      <PageHeader
        kicker={mod.kicker}
        title={row ? titleOf(row, mod.singular) : mod.singular}
        subtitle={mod.subtitle ?? `Dedicated ${mod.singular.toLowerCase()} record.`}
        actions={
          <>
            <Link to={`/${mod.slug}`} className="inline-flex items-center rounded-xl border border-line bg-white px-4 py-2 text-sm">
              Back to list
            </Link>
            {mod.editable !== false && mod.fields.length ? (
              <Link to={`/${mod.slug}/${id}/edit`} className="inline-flex items-center rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium">
                Edit
              </Link>
            ) : null}
            {canDelete(mod) ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Hide this ${mod.singular.toLowerCase()}? Company admins can restore it from Company admin.`)) {
                    remove.mutate();
                  }
                }}
                disabled={remove.isPending}
              >
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      {record.isError ? <p className="text-rose-700 mb-4">{(record.error as Error).message}</p> : null}
      <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-6">
        <div className="space-y-6">
          <Card className="p-6">
            {row ? (
              <div className="flex items-start gap-4 mb-6">
                <Avatar name={titleOf(row, mod.singular)} />
                <div>
                  <p className="display text-2xl">{titleOf(row, mod.singular)}</p>
                  <p className="text-ink-soft text-sm mt-1">
                    {mod.title} · {cell(row.code ?? row.number ?? row.sku ?? id.slice(0, 8))}
                  </p>
                </div>
                {row.status ? (
                  <div className="ml-auto">
                    <Badge>{cell(row.status)}</Badge>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-ink-soft mb-6">Loading record…</p>
            )}
            <h2 className="font-semibold mb-4">Details</h2>
            {row ? (
              <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
                {mod.fields.map((field) => (
                  <div key={field.name} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <dt className="text-ink-soft">{field.label}</dt>
                    <dd className="mt-1 font-medium">
                      <DetailValue field={field.name} value={row[field.name] ?? row[field.name.replace(/Id$/, '')]} />
                    </dd>
                  </div>
                ))}
                {mod.columns
                  .filter((col) => !mod.fields.some((field) => field.name === col.key || field.name === `${col.key}Id`))
                  .map((col) => (
                    <div key={col.key}>
                      <dt className="text-ink-soft">{col.label}</dt>
                      <dd className="mt-1 font-medium">
                        <DetailValue field={col.key} value={row[col.key]} />
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : null}
          </Card>
          {extras.length ? (
            <Card className="p-6">
              <h2 className="font-semibold mb-4">More on this record</h2>
              <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                {extras.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-ink-soft">{pretty(key)}</dt>
                    <dd className="mt-1 font-medium">
                      <DetailValue field={key} value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
          {relations
            .filter(([, value]) => value && typeof value === 'object')
            .map(([key, value]) => (
              <Card key={key} className="p-6">
                <h2 className="font-semibold mb-4">{pretty(key)}</h2>
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  {Object.entries(value as Record<string, unknown>)
                    .filter(([relKey]) => !['id', 'tenantId'].includes(relKey))
                    .slice(0, 12)
                    .map(([relKey, relValue]) => (
                      <div key={relKey}>
                        <dt className="text-ink-soft">{pretty(relKey)}</dt>
                        <dd className="mt-1 font-medium">{cell(relValue)}</dd>
                      </div>
                    ))}
                </dl>
              </Card>
            ))}
        </div>
        <div className="space-y-6">
          {row && (slug === 'service-tickets' || slug === 'tasks') ? (
            <WorkflowPanel
              kind={slug === 'tasks' ? 'TASK' : 'TICKET'}
              record={row as { id: string; status: string }}
              token={token}
              onChanged={() => record.refetch()}
            />
          ) : null}
          {mod.actions?.length ? (
            <Card className="p-6">
              <h2 className="font-semibold mb-3">Actions</h2>
              <div className="flex flex-col gap-2">
                {mod.actions.map((action) => (
                  <Button key={action.label} variant="soft" onClick={() => run(action.path(id), action.body)}>
                    {action.label}
                  </Button>
                ))}
              </div>
              {message ? <p className="text-sm mt-3 text-accent">{message}</p> : null}
            </Card>
          ) : null}
          {collections.map(([key, value]) => {
            const items = value as Record<string, unknown>[];
            const keys = Object.keys(items[0] ?? {}).filter((item) => !['id', 'tenantId'].includes(item)).slice(0, 4);
            return (
              <Card key={key} className="p-6">
                <h2 className="font-semibold mb-3 capitalize">{pretty(key)}</h2>
                <ul className="text-sm space-y-2">
                  {items.map((item, index) => (
                    <li key={String(item.id ?? index)} className="border border-line rounded-xl px-3 py-2 bg-slate/40">
                      {keys.length
                        ? keys.map((itemKey) => `${pretty(itemKey)}: ${cell(item[itemKey])}`).join(' · ')
                        : cell(item.name ?? item.number ?? item.notes ?? item.body ?? item.component ?? item)}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CrudFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { mod, slug } = useModule();
  const { id } = useParams();
  const token = useToken();
  const tenantId = useAuth((s) => s.profile?.tenantId);
  const navigate = useNavigate();
  const client = useQueryClient();
  const existing = useQuery({
    queryKey: ['/records', slug, id],
    queryFn: () => api<Row>(`/records/${slug}/${id}`, { token }),
    enabled: mode === 'edit' && Boolean(slug && id && token && tenantId),
  });
  const defaults = useMemo(() => {
    const next: Record<string, string> = {};
    if (existing.data && mod) {
      for (const field of mod.fields) {
        const value = existing.data[field.name];
        if (value === null || value === undefined) {
          continue;
        }
        const text = String(value);
        next[field.name] = field.type === 'date' && text.includes('T') ? text.slice(0, 10) : text;
      }
    }
    return next;
  }, [existing.data, mod]);
  const [form, setForm] = useState<Record<string, string>>({});
  const merged = { ...defaults, ...form };

  const save = useMutation({
    mutationFn: () => {
      if (!mod) {
        throw new Error('Unknown module');
      }
      const body = buildPayload(mod, merged, mode);
      if (mode === 'create') {
        return api(mod.createPath ?? mod.path, { method: 'POST', token, body });
      }
      return api(`/records/${slug}/${id}`, { method: 'PATCH', token, body });
    },
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: [mod?.path] });
      const created = Array.isArray(result) ? (result[0] as Row | undefined) : (result as Row);
      if (mode === 'create' && created?.id) {
        navigate(`/${slug}/${created.id}`);
        return;
      }
      navigate(id ? `/${slug}/${id}` : `/${slug}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  if (!tenantId) {
    return <TenantNeeded />;
  }
  if (!mod) {
    return <p>Unknown module</p>;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        kicker={mod.kicker}
        title={`${mode === 'create' ? 'New' : 'Edit'} ${mod.singular.toLowerCase()}`}
        subtitle={mode === 'create' ? `Create a ${mod.singular.toLowerCase()} in ${mod.title.toLowerCase()}.` : `Update this ${mod.singular.toLowerCase()} and save.`}
        actions={
          <Link
            to={mode === 'edit' ? `/${mod.slug}/${id}` : `/${mod.slug}`}
            className="inline-flex items-center rounded-xl border border-line bg-white px-4 py-2 text-sm"
          >
            Cancel
          </Link>
        }
      />
      <Card className="p-6 md:p-8">
        {mode === 'edit' && existing.isLoading ? <p className="text-ink-soft mb-4">Loading current values…</p> : null}
        <form className="grid sm:grid-cols-2 gap-5" onSubmit={onSubmit}>
          {mod.fields.map((field) => (
            <label key={field.name} className={`text-sm ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
              <span className="text-ink-soft font-medium">
                {field.label}
                {field.required ? <span className="text-rose-600"> *</span> : null}
              </span>
              <div className="mt-1.5">
                <FieldInput
                  field={field}
                  token={token}
                  value={merged[field.name] ?? ''}
                  onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
                />
              </div>
            </label>
          ))}
          {save.isError ? <p className="sm:col-span-2 text-sm text-rose-700">{(save.error as Error).message}</p> : null}
          <div className="sm:col-span-2 pt-2 flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {mode === 'create' ? `Create ${mod.singular.toLowerCase()}` : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
