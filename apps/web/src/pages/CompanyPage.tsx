import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { moduleBySlug } from '../catalog';
import { api, asList } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { Badge, Button, Card, Empty, PageHeader } from '../components/ui';

type DeletedRow = {
  resource: string;
  id: string;
  label: string;
  deletedAt: string | null;
  deletedBy: string | null;
};

export function CompanyDeletedPage() {
  const token = useAuth((s) => s.accessToken);
  const tenantId = useAuth((s) => s.profile?.tenantId);
  const client = useQueryClient();
  const rows = useQuery({
    queryKey: ['/company/deleted'],
    queryFn: () => api<unknown>('/company/deleted', { token }).then((data) => asList<DeletedRow>(data)),
    enabled: Boolean(token && tenantId),
  });
  const restore = useMutation({
    mutationFn: (row: DeletedRow) => api(`/company/deleted/${row.resource}/${row.id}/restore`, { method: 'POST', token }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['/company/deleted'] }),
  });

  if (!tenantId) {
    return (
      <div>
        <PageHeader kicker="Company admin" title="Select a company" subtitle="Choose a tenant to see its deleted records." />
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
      <PageHeader
        kicker="Company admin"
        title="Deleted records"
        subtitle="Soft-deleted records stay in this company until an admin restores them. They are hidden from everyday lists."
      />
      <Card>
        {rows.isError ? <p className="px-5 py-4 text-rose-700">{(rows.error as Error).message}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line bg-slate/60">
                <th className="px-5 py-3 font-medium">Module</th>
                <th className="px-5 py-3 font-medium">Record</th>
                <th className="px-5 py-3 font-medium">Deleted at</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {(rows.data ?? []).map((row) => {
                const mod = moduleBySlug(row.resource);
                return (
                  <tr key={`${row.resource}-${row.id}`} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5">
                      <Badge>{mod?.title ?? row.resource}</Badge>
                    </td>
                    <td className="px-5 py-3.5 font-medium">{row.label}</td>
                    <td className="px-5 py-3.5 text-ink-soft">
                      {row.deletedAt ? new Date(row.deletedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button variant="soft" disabled={restore.isPending} onClick={() => restore.mutate(row)}>
                        Restore
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.isLoading && !(rows.data ?? []).length ? (
            <Empty title="No deleted records" hint="When someone deletes a customer, employee or other record, it appears here for company admins." />
          ) : null}
        </div>
      </Card>
      <p className="text-sm text-ink-soft mt-4">
        Everyday modules: <Link to="/employees" className="text-accent">Employees</Link>, <Link to="/customers" className="text-accent">Customers</Link>,{' '}
        <Link to="/products" className="text-accent">Products</Link>.
      </p>
    </div>
  );
}
