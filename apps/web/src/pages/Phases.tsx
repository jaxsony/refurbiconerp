import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, asList } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { Card as Surface, PageHeader, inputClass } from '../components/ui';

function useToken() {
  return useAuth((s) => s.accessToken);
}

function Card({ children }: { children: ReactNode }) {
  return <Surface className="p-5">{children}</Surface>;
}

export function PeopleHubPage() {
  const token = useToken();
  const client = useQueryClient();
  const employees = useQuery({ queryKey: ['/employees'], queryFn: () => api<unknown>('/employees', { token }).then((data) => asList<{ id: string; name: string; code: string }>(data)) });
  const payroll = useQuery({ queryKey: ['/payroll-runs'], queryFn: () => api<unknown>('/payroll-runs', { token }).then((data) => asList<Record<string, unknown>>(data)) });
  const leave = useQuery({ queryKey: ['/leave-requests'], queryFn: () => api<unknown>('/leave-requests', { token }).then((data) => asList<Record<string, unknown>>(data)) });
  const policies = useQuery({ queryKey: ['/leave-policies'], queryFn: () => api<unknown>('/leave-policies', { token }).then((data) => asList<{ id: string; name: string }>(data)) });
  const [message, setMessage] = useState('');

  async function run(label: string, path: string, body?: unknown) {
    setMessage('');
    try {
      await api(path, { method: 'POST', token, body });
      setMessage(label);
      ['/employees', '/payroll-runs', '/leave-requests', '/attendance'].forEach((key) => client.invalidateQueries({ queryKey: [key] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    }
  }

  const employeeId = employees.data?.[0]?.id;
  const policyId = policies.data?.[0]?.id;
  const runId = (payroll.data?.[0] as { id?: string } | undefined)?.id;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <div>
      <PageHeader kicker="Phase 3" title="People" />
      <p className="text-ink-soft mb-6 max-w-3xl">Clock in, request leave, preview payroll and publish payslips for the linked employee.</p>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-semibold mb-3">Attendance and leave</h2>
          <div className="flex flex-wrap gap-2">
            <button className="bg-accent text-white rounded-lg px-3 py-2" onClick={() => run('Clocked in', '/attendance/clock-in', { employeeId })}>
              Clock in
            </button>
            <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Clocked out', '/attendance/clock-out', { employeeId })}>
              Clock out
            </button>
            <button
              className="border border-line rounded-lg px-3 py-2"
              onClick={() => run('Leave requested', '/leave-requests', { employeeId, policyId, fromDate: today, toDate: today, reason: 'Personal' })}
            >
              Request leave
            </button>
          </div>
          <p className="text-sm mt-4">{employees.data?.[0]?.name ?? 'No employee'} · {leave.data?.length ?? 0} leave requests</p>
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">Payroll</h2>
          <div className="flex flex-wrap gap-2">
            <button className="bg-accent text-white rounded-lg px-3 py-2" onClick={() => run('Payroll previewed', '/payroll-runs/preview', { periodStart: monthStart, periodEnd: today, workingDays: 26 })}>
              Preview
            </button>
            {runId ? (
              <>
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Approved', `/payroll-runs/${runId}/approve`)}>
                  Approve
                </button>
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Locked', `/payroll-runs/${runId}/lock`)}>
                  Lock
                </button>
                <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Published', `/payroll-runs/${runId}/publish`)}>
                  Publish
                </button>
              </>
            ) : null}
          </div>
          <p className="text-sm mt-4">{payroll.data?.length ?? 0} runs</p>
        </Card>
      </div>
      {message ? <p className="mt-6 text-sm text-accent">{message}</p> : null}
    </div>
  );
}

export function ServiceHubPage() {
  const token = useToken();
  const tickets = useQuery({
    queryKey: ['/service-tickets', 'hub'],
    queryFn: () =>
      api<unknown>('/service-tickets?pageSize=50', { token }).then((data) =>
        asList<{ id: string; number: string; status: string; complaint: string; technician?: { name: string } | null }>(data),
      ),
    enabled: Boolean(token),
  });
  const steps = ['RECEIVED', 'INSPECTION', 'ESTIMATE', 'CUSTOMER_APPROVAL', 'REPAIR', 'QUALITY_CHECK', 'READY_FOR_DISPATCH'];

  return (
    <div>
      <PageHeader
        kicker="Phase 4"
        title="Service centre"
        subtitle="Allot a company employee on each step. When they mark it done, the ticket moves to the next process."
        actions={
          <Link to="/service-tickets/new" className="inline-flex items-center rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium">
            New ticket
          </Link>
        }
      />
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {steps.map((step) => {
          const rows = (tickets.data ?? []).filter((item) => item.status === step);
          return (
            <Card key={step}>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-ink-soft">{step.replace(/_/g, ' ')}</h2>
              <p className="text-xs text-ink-soft mt-1">{rows.length} in this step</p>
              <ul className="mt-3 space-y-2">
                {rows.map((item) => (
                  <li key={item.id}>
                    <Link to={`/service-tickets/${item.id}`} className="block rounded-xl border border-line px-3 py-2 hover:border-accent">
                      <p className="font-medium text-sm">{item.number}</p>
                      <p className="text-xs text-ink-soft truncate">{item.complaint}</p>
                      <p className="text-xs mt-1">{item.technician?.name ?? 'Not allotted'}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function DispatchHubPage() {
  const token = useToken();
  const client = useQueryClient();
  const tickets = useQuery({ queryKey: ['/service-tickets'], queryFn: () => api<unknown>('/service-tickets', { token }).then((data) => asList<{ id: string; number: string; status: string }>(data)) });
  const orders = useQuery({ queryKey: ['/sales-orders'], queryFn: () => api<unknown>('/sales-orders', { token }).then((data) => asList<{ id: string; number: string }>(data)) });
  const picks = useQuery({ queryKey: ['/pick-lists'], queryFn: () => api<unknown>('/pick-lists', { token }).then((data) => asList<{ id: string; number: string; status: string; lines?: { id: string; qty: string }[] }>(data)) });
  const shipments = useQuery({ queryKey: ['/shipments'], queryFn: () => api<unknown>('/shipments', { token }).then((data) => asList<{ id: string; number: string; status: string }>(data)) });
  const [message, setMessage] = useState('');
  const readyTicket = tickets.data?.find((item) => item.status === 'READY_FOR_DISPATCH') ?? tickets.data?.[0];
  const pick = picks.data?.[0];
  const shipment = shipments.data?.[0];

  async function run(label: string, path: string, body?: unknown) {
    setMessage('');
    try {
      await api(path, { method: 'POST', token, body });
      setMessage(label);
      ['/pick-lists', '/shipments', '/service-tickets'].forEach((key) => client.invalidateQueries({ queryKey: [key] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    }
  }

  return (
    <div>
      <PageHeader kicker="Phase 4" title="Dispatch" />
      <Card>
        <div className="flex flex-wrap gap-2">
          <button
            className="bg-accent text-white rounded-lg px-3 py-2"
            onClick={() => run('Pick list created', '/pick-lists', readyTicket ? { ticketId: readyTicket.id } : { salesOrderId: orders.data?.[0]?.id })}
          >
            Create pick list
          </button>
          {pick?.lines?.[0] ? (
            <button
              className="border border-line rounded-lg px-3 py-2"
              onClick={() => run('Picked', `/pick-lists/${pick.id}/pick`, { lines: [{ lineId: pick.lines![0].id, pickedQty: Number(pick.lines![0].qty) }] })}
            >
              Pick
            </button>
          ) : null}
          <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Shipment created', '/shipments', { pickListId: pick?.id, ticketId: readyTicket?.id, courier: 'Delhivery' })}>
            Create shipment
          </button>
          {shipment ? (
            <>
              <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Packed', `/shipments/${shipment.id}/pack`)}>
                Pack
              </button>
              <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Shipped', `/shipments/${shipment.id}/ship`, { status: 'SHIPPED', awb: 'AWB-1001' })}>
                Ship
              </button>
              <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('POD', `/shipments/${shipment.id}/proof`, { kind: 'signature', signature: 'received' })}>
                POD
              </button>
              <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Delivered', `/shipments/${shipment.id}/deliver`)}>
                Deliver
              </button>
            </>
          ) : null}
        </div>
        <p className="text-sm mt-4">{shipment ? `${shipment.number} · ${shipment.status}` : 'No shipments yet'}</p>
        {message ? <p className="mt-3 text-sm text-accent">{message}</p> : null}
      </Card>
    </div>
  );
}

export function AutomationHubPage() {
  const token = useToken();
  const client = useQueryClient();
  const schedules = useQuery({ queryKey: ['/recurring-schedules'], queryFn: () => api<Record<string, unknown>[]>('/recurring-schedules', { token }) });
  const txns = useQuery({ queryKey: ['/bank-transactions'], queryFn: () => api<Record<string, unknown>[]>('/bank-transactions', { token }) });
  const banks = useQuery({ queryKey: ['/bank-accounts'], queryFn: () => api<{ id: string; name: string }[]>('/bank-accounts', { token }) });
  const conversations = useQuery({ queryKey: ['/conversations'], queryFn: () => api<Record<string, unknown>[]>('/conversations', { token }) });
  const [message, setMessage] = useState('');

  async function run(label: string, path: string, body?: unknown) {
    setMessage('');
    try {
      await api(path, { method: 'POST', token, body });
      setMessage(label);
      ['/recurring-schedules', '/bank-transactions', '/conversations', '/invoices'].forEach((key) => client.invalidateQueries({ queryKey: [key] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    }
  }

  return (
    <div>
      <PageHeader kicker="Phase 5" title="Automation" />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-semibold mb-3">Recurring and banking</h2>
          <div className="flex flex-wrap gap-2">
            <button className="bg-accent text-white rounded-lg px-3 py-2" onClick={() => run('Occurrences spawned', '/recurring-schedules/run')}>
              Run due schedules
            </button>
            <button
              className="border border-line rounded-lg px-3 py-2"
              onClick={() =>
                run('Bank imported', '/bank-transactions/import', {
                  bankAccountId: banks.data?.[0]?.id,
                  transactions: [{ providerRef: `txn-${Date.now()}`, amount: 5898.82, txnDate: new Date().toISOString(), description: 'NEFT Northwind' }],
                })
              }
            >
              Import bank feed
            </button>
          </div>
          <p className="text-sm mt-4">{schedules.data?.length ?? 0} schedules · {txns.data?.length ?? 0} bank lines</p>
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">WhatsApp</h2>
          <button
            className="bg-accent text-white rounded-lg px-3 py-2"
            onClick={() => run('Webhook ingested', '/webhooks/whatsapp', { eventId: `wamid.${Date.now()}`, tenantSlug: 'acme', from: '9876543210', body: 'Where is my phone?' })}
          >
            Simulate inbound
          </button>
          <p className="text-sm mt-4">{conversations.data?.length ?? 0} conversations</p>
        </Card>
      </div>
      {message ? <p className="mt-6 text-sm text-accent">{message}</p> : null}
    </div>
  );
}

export function FieldPage() {
  const token = useToken();
  const sync = useQuery({ queryKey: ['/field/sync'], queryFn: () => api<Record<string, unknown>>('/field/sync', { token }) });
  const [message, setMessage] = useState('');
  const [key] = useState(() => `off-${Date.now()}`);

  async function run(label: string, path: string, body?: unknown) {
    setMessage('');
    try {
      await api(path, { method: 'POST', token, body });
      setMessage(label);
      sync.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    }
  }

  return (
    <div>
      <PageHeader kicker="Phase 6" title="Field" />
      <Card>
        <div className="flex flex-wrap gap-2">
          <button className="bg-accent text-white rounded-lg px-3 py-2" onClick={() => run('Field clock-in', '/field/clock-in', { source: 'MOBILE' })}>
            Clock in
          </button>
          <button className="border border-line rounded-lg px-3 py-2" onClick={() => run('Device registered', '/field/devices', { label: 'Android 1' })}>
            Register device
          </button>
          <button
            className="border border-line rounded-lg px-3 py-2"
            onClick={() => run('Offline accepted', '/field/offline', { idempotencyKey: key, action: 'note', payload: { text: 'Customer not home' } })}
          >
            Queue offline action
          </button>
        </div>
        <pre className="text-xs mt-4 overflow-auto bg-white border border-line rounded-lg p-3">{JSON.stringify(sync.data, null, 2)}</pre>
        {message ? <p className="mt-3 text-sm text-accent">{message}</p> : null}
      </Card>
    </div>
  );
}

export function GoLivePage() {
  const token = useToken();
  const ready = useQuery({ queryKey: ['/go-live/readiness'], queryFn: () => api<{ ready: boolean; checks: { key: string; ok: boolean; detail: string }[] }>('/go-live/readiness', { token }) });
  const client = useQueryClient();
  const [legacyId, setLegacyId] = useState('LEG-100');
  const [name, setName] = useState('Imported buyer');

  const commit = useMutation({
    mutationFn: () =>
      api('/imports', {
        method: 'POST',
        token,
        body: { sourceSystem: 'legacy', entityType: 'customers', dryRun: true, rows: [{ legacyId, payload: { name, phone: '9000000001' } }] },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['/imports'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    commit.mutate();
  }

  return (
    <div>
      <PageHeader kicker="Phase 6" title="Go-live" />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <p className="text-sm text-ink-soft">Readiness</p>
          <p className="display text-4xl mt-2">{ready.data?.ready ? 'Ready' : 'Gaps'}</p>
          <ul className="mt-4 text-sm divide-y divide-line">
            {ready.data?.checks.map((check) => (
              <li key={check.key} className="py-2 flex justify-between gap-4">
                <span>{check.key}</span>
                <span className={check.ok ? 'text-accent' : 'text-red-700'}>{check.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Import dry-run</h2>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <input className={inputClass} value={legacyId} onChange={(event) => setLegacyId(event.target.value)} />
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
            <button className="w-full bg-accent text-white rounded-lg py-2">Validate rows</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
