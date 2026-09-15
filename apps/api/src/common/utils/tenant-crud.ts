import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';
import { requireTenantId } from './tenant';

export type CrudSpec = {
  model: string;
  view: string;
  edit: string;
  remove?: string;
  include?: object;
  allow: string[];
};

export const CRUD_SPECS: Record<string, CrudSpec> = {
  employees: {
    model: 'employee',
    view: 'employees:view',
    edit: 'employees:edit',
    remove: 'employees:edit',
    include: { designation: true, shift: true },
    allow: ['name', 'code', 'email', 'phone', 'userId', 'departmentId', 'designationId', 'shiftId', 'joiningDate', 'status', 'bankAccount', 'ifsc', 'pan', 'emergencyName', 'emergencyPhone', 'branchId'],
  },
  designations: {
    model: 'designation',
    view: 'employees:view',
    edit: 'employees:edit',
    remove: 'employees:edit',
    allow: ['code', 'name'],
  },
  shifts: {
    model: 'shift',
    view: 'attendance:view',
    edit: 'employees:edit',
    remove: 'employees:edit',
    allow: ['code', 'name', 'startTime', 'endTime', 'weeklyOffs'],
  },
  holidays: {
    model: 'holiday',
    view: 'attendance:view',
    edit: 'employees:edit',
    remove: 'employees:edit',
    allow: ['name', 'date'],
  },
  'leave-policies': {
    model: 'leavePolicy',
    view: 'leave:view',
    edit: 'employees:edit',
    remove: 'employees:edit',
    allow: ['code', 'name', 'annualDays', 'encashable'],
  },
  'leave-requests': {
    model: 'leaveRequest',
    view: 'leave:view',
    edit: 'leave:create',
    remove: 'leave:create',
    include: { employee: true, policy: true },
    allow: ['fromDate', 'toDate', 'reason', 'days'],
  },
  'salary-structures': {
    model: 'salaryStructure',
    view: 'payroll:view',
    edit: 'payroll:create',
    remove: 'payroll:create',
    include: { lines: true, employee: true },
    allow: ['effectiveFrom'],
  },
  'payroll-runs': {
    model: 'payrollRun',
    view: 'payroll:view',
    edit: 'payroll:create',
    include: { lines: { include: { employee: true } } },
    allow: ['workingDays'],
  },
  'incentive-schemes': {
    model: 'incentiveScheme',
    view: 'incentives:view',
    edit: 'incentives:create',
    remove: 'incentives:create',
    allow: ['name', 'formula', 'rate', 'holdUntilPaid', 'isActive'],
  },
  'incentive-awards': {
    model: 'incentiveAward',
    view: 'incentives:view',
    edit: 'incentives:approve',
    include: { employee: true, scheme: true },
    allow: ['amount', 'status'],
  },
  'service-tickets': {
    model: 'serviceTicket',
    view: 'service-tickets:view',
    edit: 'service-tickets:edit',
    remove: 'service-tickets:edit',
    include: { technician: true, diagnoses: true, parts: true, qualityChecks: true, shipments: true },
    allow: ['complaint', 'priority', 'technicianId', 'serialNo', 'path', 'productId', 'partyId'],
  },
  'pick-lists': {
    model: 'pickList',
    view: 'dispatch:view',
    edit: 'dispatch:edit',
    remove: 'dispatch:edit',
    include: { lines: true, shipments: true },
    allow: ['status'],
  },
  shipments: {
    model: 'shipment',
    view: 'dispatch:view',
    edit: 'dispatch:edit',
    remove: 'dispatch:edit',
    include: { events: true, proofs: true, pickList: true, ticket: true },
    allow: ['courier', 'awb', 'freight', 'status'],
  },
  'recurring-schedules': {
    model: 'recurringSchedule',
    view: 'recurring:view',
    edit: 'recurring:edit',
    remove: 'recurring:edit',
    include: { occurrences: true },
    allow: ['name', 'kind', 'frequency', 'interval', 'partyId', 'amount', 'taxRate', 'nextRunAt', 'endsAt', 'status', 'dueOffsetDays'],
  },
  'bank-accounts': {
    model: 'bankAccount',
    view: 'banking:view',
    edit: 'banking:create',
    remove: 'banking:create',
    include: { transactions: { take: 40, orderBy: { txnDate: 'desc' } } },
    allow: ['name', 'maskedNumber', 'provider'],
  },
  'bank-transactions': {
    model: 'bankTransaction',
    view: 'banking:view',
    edit: 'banking:approve',
    include: { bankAccount: true },
    allow: ['description', 'matchStatus', 'invoiceId'],
  },
  channels: {
    model: 'channelAccount',
    view: 'whatsapp:view',
    edit: 'whatsapp:edit',
    remove: 'whatsapp:edit',
    allow: ['provider', 'name', 'phone'],
  },
  conversations: {
    model: 'conversation',
    view: 'whatsapp:view',
    edit: 'whatsapp:edit',
    include: { messages: { orderBy: { createdAt: 'asc' } }, channel: true },
    allow: ['status', 'optOut', 'ownerUserId', 'partyId', 'leadId'],
  },
  'marketplace-listings': {
    model: 'marketplaceListing',
    view: 'marketplaces:view',
    edit: 'marketplaces:edit',
    remove: 'marketplaces:edit',
    allow: ['channel', 'productId', 'listingId'],
  },
  'marketplace-orders': {
    model: 'marketplaceOrder',
    view: 'marketplaces:view',
    edit: 'marketplaces:edit',
    allow: ['status'],
  },
  products: {
    model: 'product',
    view: 'products:view',
    edit: 'products:edit',
    remove: 'products:edit',
    include: { variants: true },
    allow: ['sku', 'name', 'type', 'unit', 'barcode', 'taxRate', 'unitPrice', 'costPrice', 'reorderLevel', 'trackStock', 'trackSerial', 'trackBatch', 'isActive'],
  },
  warehouses: {
    model: 'warehouse',
    view: 'inventory:view',
    edit: 'inventory:edit',
    remove: 'inventory:edit',
    allow: ['code', 'name', 'isDefault', 'branchId'],
  },
  'purchase-orders': {
    model: 'purchaseOrder',
    view: 'purchase-orders:view',
    edit: 'purchase-orders:edit',
    include: { lines: true, party: true },
    allow: ['notes', 'status'],
  },
  leads: {
    model: 'lead',
    view: 'leads:view',
    edit: 'leads:edit',
    remove: 'leads:edit',
    include: { convertedParty: true },
    allow: ['name', 'email', 'phone', 'company', 'source', 'status', 'value', 'notes', 'probability'],
  },
  opportunities: {
    model: 'opportunity',
    view: 'opportunities:view',
    edit: 'opportunities:edit',
    remove: 'opportunities:edit',
    include: { party: true },
    allow: ['name', 'stage', 'value', 'probability', 'expectedCloseAt'],
  },
  customers: {
    model: 'party',
    view: 'customers:view',
    edit: 'customers:edit',
    remove: 'customers:edit',
    include: { contacts: true },
    allow: ['name', 'legalName', 'email', 'phone', 'taxId', 'billingAddress', 'shippingAddress', 'creditLimit', 'paymentTermsDays', 'isActive'],
  },
  vendors: {
    model: 'party',
    view: 'customers:view',
    edit: 'customers:edit',
    include: { contacts: true },
    allow: ['name', 'legalName', 'email', 'phone', 'taxId', 'billingAddress', 'creditLimit', 'isActive'],
  },
  invoices: {
    model: 'invoice',
    view: 'invoices:view',
    edit: 'invoices:create',
    include: { party: true, lines: true },
    allow: ['notes', 'dueDate'],
  },
  payments: {
    model: 'payment',
    view: 'payments:view',
    edit: 'payments:create',
    include: { party: true, allocations: true },
    allow: ['reference'],
  },
  'ledger-accounts': {
    model: 'ledgerAccount',
    view: 'accounts:view',
    edit: 'accounts:edit',
    remove: 'accounts:edit',
    allow: ['code', 'name', 'type', 'parentId'],
  },
  vouchers: {
    model: 'voucher',
    view: 'accounts:view',
    edit: 'accounts:approve',
    include: { lines: { include: { account: true } } },
    allow: ['narration'],
  },
  quotations: {
    model: 'quotation',
    view: 'quotations:view',
    edit: 'quotations:edit',
    include: { party: true, lines: true },
    allow: ['notes', 'validUntil'],
  },
  'sales-orders': {
    model: 'salesOrder',
    view: 'sales-orders:view',
    edit: 'sales-orders:edit',
    include: { party: true, lines: true },
    allow: ['notes'],
  },
  branches: {
    model: 'branch',
    view: 'branches:view',
    edit: 'branches:edit',
    remove: 'branches:edit',
    allow: ['code', 'name', 'timezone', 'address', 'isDefault'],
  },
  departments: {
    model: 'department',
    view: 'departments:view',
    edit: 'departments:edit',
    remove: 'departments:edit',
    allow: ['code', 'name'],
  },
  tasks: {
    model: 'task',
    view: 'tasks:view',
    edit: 'tasks:edit',
    remove: 'tasks:edit',
    include: { checklist: true, comments: true },
    allow: ['title', 'description', 'status', 'priority', 'dueAt'],
  },
  'fiscal-years': {
    model: 'fiscalYear',
    view: 'fiscal-years:view',
    edit: 'fiscal-years:edit',
    allow: ['name', 'isCurrent', 'isLocked'],
  },
  sequences: {
    model: 'documentSequence',
    view: 'sequences:view',
    edit: 'sequences:edit',
    allow: ['prefix', 'nextNumber', 'padding'],
  },
  settings: {
    model: 'tenantSetting',
    view: 'settings:view',
    edit: 'settings:edit',
    allow: ['value'],
  },
  imports: {
    model: 'importBatch',
    view: 'imports:view',
    edit: 'imports:create',
    include: { rows: true },
    allow: ['status'],
  },
  attendance: {
    model: 'attendance',
    view: 'attendance:view',
    edit: 'attendance:approve',
    include: { employee: true },
    allow: ['status', 'paidDay', 'lateMinutes', 'otMinutes'],
  },
  stock: {
    model: 'stockBalance',
    view: 'inventory:view',
    edit: 'inventory:edit',
    include: { product: true, warehouse: true },
    allow: [],
  },
  roles: {
    model: 'role',
    view: 'roles:view',
    edit: 'roles:edit',
    allow: ['name', 'description'],
  },
  notifications: {
    model: 'notification',
    view: 'notifications:view',
    edit: 'notifications:administer',
    allow: [],
  },
  'audit-events': {
    model: 'auditEvent',
    view: 'audit:view',
    edit: 'audit:view',
    allow: [],
  },
};

const DATE_KEYS = new Set([
  'joiningDate',
  'fromDate',
  'toDate',
  'date',
  'workDate',
  'periodStart',
  'periodEnd',
  'nextRunAt',
  'endsAt',
  'validUntil',
  'dueDate',
  'dueAt',
  'expectedCloseAt',
  'effectiveFrom',
]);
const NUMBER_KEYS = new Set([
  'creditLimit',
  'paymentTermsDays',
  'unitPrice',
  'taxRate',
  'costPrice',
  'reorderLevel',
  'qty',
  'amount',
  'rate',
  'annualDays',
  'freight',
  'interval',
  'dueOffsetDays',
  'workingDays',
  'nextNumber',
  'padding',
  'days',
  'paidDay',
  'lateMinutes',
  'otMinutes',
  'value',
  'probability',
]);
const BOOL_KEYS = new Set(['encashable', 'holdUntilPaid', 'trackStock', 'trackSerial', 'trackBatch', 'isActive', 'isDefault', 'optOut', 'isCurrent', 'isLocked']);

@Injectable()
export class TenantCrudService {
  constructor(private readonly prisma: PrismaService) {}

  spec(resource: string) {
    const spec = CRUD_SPECS[resource];
    if (!spec) {
      throw new NotFoundException({ code: 'UNKNOWN_RESOURCE', message: `Unknown resource ${resource}` });
    }
    return spec;
  }

  async get(user: AuthUser, resource: string, id: string) {
    const spec = this.spec(resource);
    this.assert(user, spec.view);
    const row = await this.delegate(spec).findFirst({
      where: { id, tenantId: requireTenantId(user) },
      ...(spec.include ? { include: spec.include } : {}),
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Record not found' });
    }
    return row;
  }

  async update(user: AuthUser, resource: string, id: string, body: Record<string, unknown>) {
    const spec = this.spec(resource);
    this.assert(user, spec.edit);
    await this.get(user, resource, id);
    const data = this.pick(body, spec.allow);
    return this.delegate(spec).update({
      where: { id },
      data,
      ...(spec.include ? { include: spec.include } : {}),
    });
  }

  async remove(user: AuthUser, resource: string, id: string) {
    const spec = this.spec(resource);
    this.assert(user, spec.remove ?? spec.edit);
    await this.get(user, resource, id);
    await this.delegate(spec).update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.userId },
    });
    return { ok: true, softDeleted: true };
  }

  async listDeleted(user: AuthUser) {
    this.assert(user, 'recycle-bin:view');
    const tenantId = requireTenantId(user);
    const rows: { resource: string; id: string; label: string; deletedAt: unknown; deletedBy: unknown }[] = [];
    for (const [resource, spec] of Object.entries(CRUD_SPECS)) {
      const found = (await this.delegate(spec).findMany({
        where: { tenantId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 80,
      })) as Record<string, unknown>[];
      for (const row of found) {
        rows.push({
          resource,
          id: String(row.id),
          label: String(row.name ?? row.number ?? row.code ?? row.title ?? row.sku ?? row.key ?? row.id),
          deletedAt: row.deletedAt,
          deletedBy: row.deletedBy,
        });
      }
    }
    return rows.sort((a, b) => String(b.deletedAt ?? '').localeCompare(String(a.deletedAt ?? '')));
  }

  async restore(user: AuthUser, resource: string, id: string) {
    const spec = this.spec(resource);
    this.assert(user, 'recycle-bin:administer');
    const tenantId = requireTenantId(user);
    const row = await this.delegate(spec).findFirst({
      where: { id, tenantId, deletedAt: { not: null } },
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Deleted record not found' });
    }
    return this.delegate(spec).update({
      where: { id },
      data: { deletedAt: null, deletedBy: null },
      ...(spec.include ? { include: spec.include } : {}),
    });
  }

  private delegate(spec: CrudSpec) {
    const client = this.prisma as unknown as Record<
      string,
      {
        findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
        findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
        update: (args: unknown) => Promise<unknown>;
      }
    >;
    return client[spec.model];
  }

  private assert(user: AuthUser, permission: string) {
    if (user.isPlatformAdmin || user.permissions.includes(permission) || user.permissions.includes(permission.replace(/:.*/, ':administer'))) {
      return;
    }
    throw new ForbiddenException({
      code: 'INSUFFICIENT_PERMISSION',
      message: 'You do not have permission for this action',
      details: [permission],
    });
  }

  private pick(body: Record<string, unknown>, allow: string[]) {
    const data: Record<string, unknown> = {};
    for (const key of allow) {
      if (body[key] === undefined) {
        continue;
      }
      const value = body[key];
      if (value === '') {
        data[key] = null;
        continue;
      }
      if (DATE_KEYS.has(key) && typeof value === 'string') {
        data[key] = new Date(value);
      } else if (NUMBER_KEYS.has(key)) {
        data[key] = Number(value);
      } else if (BOOL_KEYS.has(key)) {
        data[key] = value === true || value === 'true';
      } else {
        data[key] = value;
      }
    }
    return data;
  }
}
