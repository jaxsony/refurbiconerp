import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, asList } from '../lib/api';
import { Badge, Button, Card, inputClass } from '../components/ui';

type Employee = { id: string; name: string; code?: string };
type Assignment = {
  id: string;
  step: string;
  completedAt: string | null;
  notes?: string | null;
  employee?: Employee | null;
};
type WorkflowRecord = {
  id: string;
  status: string;
  technicianId?: string | null;
  estimate?: string | number;
  assignments?: Assignment[];
  workflow?: { current: string; next: string | null; steps: { key: string; label: string; state: string }[] };
};

const TICKET_STEPS = [
  'RECEIVED',
  'INSPECTION',
  'ESTIMATE',
  'CUSTOMER_APPROVAL',
  'REPAIR',
  'QUALITY_CHECK',
  'READY_FOR_DISPATCH',
  'DELIVERED',
];

const TASK_STEPS = ['OPEN', 'IN_PROGRESS', 'DONE'];

function pretty(step: string) {
  return step.replace(/_/g, ' ');
}

export function WorkflowPanel({
  kind,
  record,
  token,
  onChanged,
}: {
  kind: 'TICKET' | 'TASK';
  record: WorkflowRecord;
  token: string | null;
  onChanged: () => void;
}) {
  const steps = kind === 'TICKET' ? TICKET_STEPS : TASK_STEPS;
  const employees = useQuery({
    queryKey: ['/employees', 'dropdown'],
    queryFn: () => api<unknown>('/employees?pageSize=200', { token }).then((data) => asList<Employee>(data)),
    enabled: Boolean(token),
  });
  const products = useQuery({
    queryKey: ['/products', 'dropdown'],
    queryFn: () => api<unknown>('/products?pageSize=200', { token }).then((data) => asList<{ id: string; name: string; sku: string }>(data)),
    enabled: Boolean(token && kind === 'TICKET'),
  });
  const [employeeId, setEmployeeId] = useState(record.technicianId ?? '');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState(String(record.estimate ?? ''));
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState('');
  const current = record.status;
  const open = (record.assignments ?? []).find((item) => item.step === current && !item.completedAt);
  const base = kind === 'TICKET' ? `/service-tickets/${record.id}` : `/tasks/${record.id}`;
  const client = useQueryClient();

  const allot = useMutation({
    mutationFn: () => api(`${base}/allot`, { method: 'POST', token, body: { employeeId, notes } }),
    onSuccess: () => {
      setError('');
      client.invalidateQueries();
      onChanged();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not allot'),
  });
  const complete = useMutation({
    mutationFn: () =>
      api(`${base}/complete`, {
        method: 'POST',
        token,
        body: {
          notes,
          amount: amount ? Number(amount) : undefined,
          productId: productId || undefined,
          qty: productId ? Number(qty) : undefined,
        },
      }),
    onSuccess: () => {
      setError('');
      setNotes('');
      client.invalidateQueries();
      onChanged();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not complete step'),
  });

  const closed = current === 'DELIVERED' || current === 'CANCELLED' || current === 'DONE';

  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1">Step workflow</h2>
      <p className="text-sm text-ink-soft mb-4">Allot a company employee to the current step. When they mark it done, work moves to the next process.</p>
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        {steps.map((step) => {
          const done = (record.assignments ?? []).some((item) => item.step === step && item.completedAt);
          const active = step === current;
          return (
            <li
              key={step}
              className={`rounded-xl border px-3 py-2 text-xs ${
                active ? 'border-accent bg-accent/10 text-accent' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line text-ink-soft'
              }`}
            >
              <p className="font-semibold uppercase tracking-wide">{pretty(step)}</p>
              <p className="mt-1 truncate">
                {active ? 'Current' : done ? 'Done' : 'Waiting'}
              </p>
            </li>
          );
        })}
      </ol>
      {closed ? (
        <p className="text-sm">This record is finished.</p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-ink-soft">Allot employee for {pretty(current)}</span>
            <select className={`${inputClass} mt-1.5`} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Select employee</option>
              {(employees.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} {row.code ? `· ${row.code}` : ''}
                </option>
              ))}
            </select>
          </label>
          {open?.employee ? (
            <p className="text-sm">
              Currently allotted to <strong>{open.employee.name}</strong>
            </p>
          ) : (
            <p className="text-sm text-amber-800">Allot someone before this step can be marked done.</p>
          )}
          {current === 'INSPECTION' ? (
            <label className="block text-sm">
              <span className="text-ink-soft">Estimate amount</span>
              <input className={`${inputClass} mt-1.5`} type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
          ) : null}
          {current === 'CUSTOMER_APPROVAL' ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-soft">Spare part</span>
                <select className={`${inputClass} mt-1.5`} value={productId} onChange={(event) => setProductId(event.target.value)}>
                  <option value="">None</option>
                  {(products.data ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.sku} · {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink-soft">Qty</span>
                <input className={`${inputClass} mt-1.5`} type="number" value={qty} onChange={(event) => setQty(event.target.value)} />
              </label>
            </div>
          ) : null}
          <label className="block text-sm">
            <span className="text-ink-soft">Notes</span>
            <textarea className={`${inputClass} mt-1.5`} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="soft" disabled={!employeeId || allot.isPending} onClick={() => allot.mutate()}>
              Allot to employee
            </Button>
            <Button type="button" disabled={!open || complete.isPending} onClick={() => complete.mutate()}>
              Mark step done
            </Button>
          </div>
        </div>
      )}
      {(record.assignments ?? []).length ? (
        <ul className="mt-5 text-sm space-y-2">
          {record.assignments!.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 border border-line rounded-xl px-3 py-2">
              <span>
                {pretty(item.step)} · {item.employee?.name ?? 'Employee'}
              </span>
              <Badge>{item.completedAt ? 'Done' : 'Allotted'}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
