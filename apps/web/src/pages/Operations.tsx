import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { api, asList } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { Card as Surface, PageHeader, inputClass } from '../components/ui';

function useToken() {
  return useAuth((s) => s.accessToken);
}

function Card({ children }: { children: ReactNode }) {
  return <Surface className="p-5">{children}</Surface>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-ink-soft">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

type Column = { key: string; label: string };
type Named = { id: string; name?: string; sku?: string; number?: string; email?: string };

function cell(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const record = value as { name?: string; number?: string; sku?: string };
    return record.name ?? record.number ?? record.sku ?? JSON.stringify(value);
  }
  return String(value);
}

export function ResourcePage({
  title,
  kicker,
  path,
  columns,
  createPath,
  fields,
  defaults,
}: {
  title: string;
  kicker: string;
  path: string;
  columns: Column[];
  createPath?: string;
  fields?: { name: string; label: string; type?: string; placeholder?: string }[];
  defaults?: Record<string, string>;
}) {
  const token = useToken();
  const client = useQueryClient();
  const rows = useQuery({ queryKey: [path], queryFn: () => api<unknown>(path, { token }).then((data) => asList<Record<string, unknown>>(data)) });
  const [form, setForm] = useState<Record<string, string>>(defaults ?? {});
  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { ...form };
      if (body.qty) {
        body.qty = Number(body.qty);
      }
      if (body.unitPrice) {
        body.unitPrice = Number(body.unitPrice);
      }
      if (body.value) {
        body.value = Number(body.value);
      }
      if (body.creditLimit) {
        body.creditLimit = Number(body.creditLimit);
      }
      return api(createPath ?? path, { method: 'POST', token, body });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [path] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <div>
      <PageHeader kicker={kicker} title={title} />
      <div className={`grid gap-6 ${fields?.length ? 'lg:grid-cols-[1.4fr_0.8fr]' : ''}`}>
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-soft">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="pb-3">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.data?.map((row) => (
                <tr key={String(row.id)} className="border-t border-line">
                  {columns.map((col) => (
                    <td key={col.key} className="py-3">
                      {cell(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {create.isError ? <p className="text-sm text-red-700 mt-3">{(create.error as Error).message}</p> : null}
        </Card>
        {fields?.length ? (
          <Card>
            <h2 className="font-semibold">Create</h2>
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              {fields.map((field) => (
                <Field key={field.name} label={field.label}>
                  <input
                    className={inputClass}
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    value={form[field.name] ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                    required
                  />
                </Field>
              ))}
              <button className="w-full bg-accent text-white rounded-lg py-2">Save</button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function QuoteToCashPage() {
  const token = useToken();
  const client = useQueryClient();
  const customers = useQuery({ queryKey: ['/customers'], queryFn: () => api<unknown>(`/customers`, { token }).then((data) => asList<Named>(data)) });
  const products = useQuery({ queryKey: ['/products'], queryFn: () => api<unknown>(`/products`, { token }).then((data) => asList<Named & { unitPrice: string }>(data)) });
  const quotations = useQuery({ queryKey: ['/quotations'], queryFn: () => api<unknown>(`/quotations`, { token }).then((data) => asList<Record<string, unknown>>(data)) });
  const orders = useQuery({ queryKey: ['/sales-orders'], queryFn: () => api<unknown>(`/sales-orders`, { token }).then((data) => asList<Record<string, unknown>>(data)) });
  const invoices = useQuery({ queryKey: ['/invoices'], queryFn: () => api<unknown>(`/invoices`, { token }).then((data) => asList<Record<string, unknown>>(data)) });
  const payments = useQuery({ queryKey: ['/payments'], queryFn: () => api<unknown>(`/payments`, { token }).then((data) => asList<Record<string, unknown>>(data)) });
  const [partyId, setPartyId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [message, setMessage] = useState('');

  const selectedParty = partyId || customers.data?.[0]?.id || '';
  const selectedProduct = productId || products.data?.[0]?.id || '';
  const latestQuote = quotations.data?.[0] as { id: string; status: string; number: string } | undefined;
  const latestOrder = orders.data?.[0] as { id: string; status: string; number: string; lines?: { id: string; qty: string }[] } | undefined;
  const latestInvoice = invoices.data?.[0] as { id: string; status: string; number: string; total: string; partyId: string } | undefined;

  const invalidate = () => {
    ['/quotations', '/sales-orders', '/invoices', '/payments', '/stock', '/receivables'].forEach((key) => {
      client.invalidateQueries({ queryKey: [key] });
    });
  };

  async function run(label: string, path: string, body?: unknown) {
    setMessage('');
    try {
      await api(path, { method: 'POST', token, body });
      setMessage(label);
      invalidate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    }
  }

  const productOptions = useMemo(() => products.data ?? [], [products.data]);

  return (
    <div>
      <PageHeader kicker="Phase 2" title="Quote to cash" />
      <p className="text-ink-soft mb-6 max-w-3xl">
        Create a quotation, approve it, convert to a sales order, reserve stock, invoice, post the journal and collect payment.
      </p>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-semibold mb-4">1. Quotation</h2>
          <div className="space-y-3">
            <select className={inputClass} value={selectedParty} onChange={(event) => setPartyId(event.target.value)}>
              {customers.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select className={inputClass} value={selectedProduct} onChange={(event) => setProductId(event.target.value)}>
              {productOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
            </select>
            <input className={inputClass} value={qty} onChange={(event) => setQty(event.target.value)} />
            <button
              className="bg-accent text-white rounded-lg px-4 py-2"
              onClick={() =>
                run('Quotation created', '/quotations', {
                  partyId: selectedParty,
                  lines: [{ productId: selectedProduct, qty: Number(qty) }],
                })
              }
            >
              Create quotation
            </button>
            {latestQuote ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Quotation approved', `/quotations/${latestQuote.id}/approve`)}>
                  Approve {latestQuote.number}
                </button>
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Converted to order', `/quotations/${latestQuote.id}/convert`)}>
                  Convert to order
                </button>
              </div>
            ) : null}
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold mb-4">2. Order, invoice, payment</h2>
          {latestOrder ? (
            <div className="space-y-3">
              <p className="text-sm">
                {latestOrder.number} · {latestOrder.status}
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Order approved and reserved', `/sales-orders/${latestOrder.id}/approve`)}>
                  Approve / reserve
                </button>
                <button
                  className="border border-line rounded-lg px-3 py-2"
                  onClick={() =>
                    run('Fulfilled', `/sales-orders/${latestOrder.id}/fulfil`, {
                      lines: [{ lineId: latestOrder.lines?.[0]?.id, qty: Number(latestOrder.lines?.[0]?.qty ?? qty) }],
                    })
                  }
                >
                  Fulfil
                </button>
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Invoice created', `/sales-orders/${latestOrder.id}/invoice`)}>
                  Create invoice
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Convert a quotation to continue.</p>
          )}
          {latestInvoice ? (
            <div className="space-y-3 mt-6">
              <p className="text-sm">
                {latestInvoice.number} · {latestInvoice.status} · {latestInvoice.total}
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Invoice posted', `/invoices/${latestInvoice.id}/post`)}>
                  Post invoice
                </button>
                <button
                  className="border border-line rounded-lg px-3 py-2"
                  onClick={() =>
                    run('Payment recorded', '/payments', {
                      partyId: latestInvoice.partyId,
                      amount: Number(latestInvoice.total),
                      method: 'BANK',
                      allocations: [{ invoiceId: latestInvoice.id, amount: Number(latestInvoice.total) }],
                    })
                  }
                >
                  Collect payment
                </button>
                {payments.data?.[0] && (payments.data[0] as { status: string; id: string }).status === 'PENDING_APPROVAL' ? (
                  <button
                    className="border border-line rounded-lg px-3 py-2"
                    onClick={() => run('Payment approved', `/payments/${(payments.data![0] as { id: string }).id}/approve`)}
                  >
                    Approve payment
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
      {message ? <p className="mt-6 text-sm text-accent">{message}</p> : null}
      <div className="grid md:grid-cols-3 gap-4 mt-8">
        <Card>
          <p className="text-sm text-ink-soft">Quotations</p>
          <p className="display text-4xl mt-2">{quotations.data?.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-soft">Sales orders</p>
          <p className="display text-4xl mt-2">{orders.data?.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-soft">Invoices</p>
          <p className="display text-4xl mt-2">{invoices.data?.length ?? 0}</p>
        </Card>
      </div>
    </div>
  );
}
