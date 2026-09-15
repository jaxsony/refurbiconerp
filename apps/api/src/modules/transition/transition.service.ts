import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { normalizeEmail, normalizePhone, normalizeTaxId } from '../../common/utils/normalize';

export class ImportRowDto {
  @IsString()
  legacyId!: string;
  @IsObject()
  payload!: Record<string, unknown>;
}

export class CreateImportDto {
  @IsString()
  sourceSystem!: string;
  @IsString()
  entityType!: string;
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}

export class ExportDto {
  @IsString()
  reportKey!: string;
}

export class DeviceDto {
  @IsOptional()
  @IsString()
  label?: string;
}

export class OfflineDto {
  @IsString()
  idempotencyKey!: string;
  @IsString()
  action!: string;
  @IsObject()
  payload!: Record<string, unknown>;
  @IsOptional()
  @IsString()
  deviceId?: string;
}

@Injectable()
export class TransitionService {
  constructor(private readonly prisma: PrismaService) {}

  reports(user: AuthUser) {
    return this.prisma.reportRun.findMany({
      where: { tenantId: requireTenantId(user) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async runReport(user: AuthUser, reportKey: string) {
    const tenantId = requireTenantId(user);
    let result: unknown;
    if (reportKey === 'payroll-summary') {
      const runs = await this.prisma.payrollRun.findMany({ where: { tenantId }, include: { lines: true } });
      result = runs.map((run) => ({
        id: run.id,
        status: run.status,
        netPay: run.lines.reduce((sum, line) => sum + Number(line.netPay), 0),
        employees: run.lines.length,
      }));
    } else if (reportKey === 'open-tickets') {
      result = await this.prisma.serviceTicket.groupBy({
        by: ['status'],
        where: { tenantId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        _count: true,
      });
    } else if (reportKey === 'dispatch-pipeline') {
      result = await this.prisma.shipment.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      });
    } else if (reportKey === 'collections') {
      const invoices = await this.prisma.invoice.findMany({
        where: { tenantId, kind: 'SALES', status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
      });
      result = invoices.map((invoice) => ({
        number: invoice.number,
        outstanding: Number(invoice.total) - Number(invoice.paidAmount),
      }));
    } else {
      throw new BadRequestException({ code: 'UNKNOWN_REPORT', message: 'Unknown report key' });
    }
    return this.prisma.reportRun.create({
      data: { tenantId, reportKey, result: result as Prisma.InputJsonValue },
    });
  }

  imports(user: AuthUser) {
    return this.prisma.importBatch.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { rows: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createImport(user: AuthUser, dto: CreateImportDto) {
    const tenantId = requireTenantId(user);
    const dryRun = dto.dryRun ?? true;
    const batch = await this.prisma.importBatch.create({
      data: {
        tenantId,
        sourceSystem: dto.sourceSystem,
        entityType: dto.entityType,
        dryRun,
        status: dryRun ? 'DRY_RUN' : 'PENDING',
        rows: {
          create: dto.rows.map((row) => ({
            legacyId: row.legacyId,
            payload: row.payload as Prisma.InputJsonValue,
            status: 'PENDING',
          })),
        },
      },
      include: { rows: true },
    });
    if (dryRun) {
      const validated = await this.validateRows(tenantId, dto.entityType, batch.rows);
      return { ...batch, rows: validated, dryRun: true };
    }
    return this.commitImport(user, batch.id);
  }

  async commitImport(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    const batch = await this.prisma.importBatch.findFirst({
      where: { id, tenantId },
      include: { rows: true },
    });
    if (!batch) {
      throw new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: 'Import batch not found' });
    }
    for (const row of batch.rows) {
      try {
        const recordId = await this.applyRow(tenantId, batch.entityType, row.legacyId, row.payload as Record<string, unknown>);
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: 'IMPORTED', recordId } });
      } catch (error) {
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { status: 'ERROR', error: error instanceof Error ? error.message : 'Import failed' },
        });
      }
    }
    return this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'COMMITTED', dryRun: false },
      include: { rows: true },
    });
  }

  async rollbackImport(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    const batch = await this.prisma.importBatch.findFirst({
      where: { id, tenantId },
      include: { rows: true },
    });
    if (!batch) {
      throw new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: 'Import batch not found' });
    }
    for (const row of batch.rows.filter((item) => item.recordId)) {
      try {
        if (batch.entityType === 'customers' || batch.entityType === 'parties') {
          await this.prisma.party.deleteMany({ where: { id: row.recordId!, tenantId } });
        } else if (batch.entityType === 'products') {
          await this.prisma.product.deleteMany({ where: { id: row.recordId!, tenantId } });
        } else if (batch.entityType === 'employees') {
          await this.prisma.employee.deleteMany({ where: { id: row.recordId!, tenantId } });
        }
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: 'ROLLED_BACK' } });
      } catch (error) {
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { error: error instanceof Error ? error.message : 'Rollback blocked', status: 'ERROR' },
        });
      }
    }
    return this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'ROLLED_BACK' },
      include: { rows: true },
    });
  }

  exports(user: AuthUser) {
    return this.prisma.exportJob.findMany({
      where: { tenantId: requireTenantId(user) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExport(user: AuthUser, dto: ExportDto) {
    const report = await this.runReport(user, dto.reportKey);
    return this.prisma.exportJob.create({
      data: {
        tenantId: requireTenantId(user),
        reportKey: dto.reportKey,
        status: 'READY',
        fileUrl: `memory://report/${report.id}`,
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
  }

  async readiness(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const [
      fiscal,
      accounts,
      warehouse,
      sequences,
      employee,
      leavePolicy,
      bank,
      channel,
    ] = await Promise.all([
      this.prisma.fiscalYear.findFirst({ where: { tenantId, isCurrent: true } }),
      this.prisma.ledgerAccount.count({ where: { tenantId } }),
      this.prisma.warehouse.findFirst({ where: { tenantId } }),
      this.prisma.documentSequence.count({ where: { tenantId } }),
      this.prisma.employee.findFirst({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.leavePolicy.findFirst({ where: { tenantId } }),
      this.prisma.bankAccount.findFirst({ where: { tenantId } }),
      this.prisma.channelAccount.findFirst({ where: { tenantId } }),
    ]);
    const checks = [
      { key: 'fiscal_year', ok: Boolean(fiscal), detail: fiscal?.name ?? 'Missing current fiscal year' },
      { key: 'chart_of_accounts', ok: accounts >= 10, detail: `${accounts} accounts` },
      { key: 'warehouse', ok: Boolean(warehouse), detail: warehouse?.code ?? 'Missing warehouse' },
      { key: 'numbering', ok: sequences >= 8, detail: `${sequences} sequences` },
      { key: 'employee', ok: Boolean(employee), detail: employee?.code ?? 'No active employee' },
      { key: 'leave_policy', ok: Boolean(leavePolicy), detail: leavePolicy?.code ?? 'No leave policy' },
      { key: 'bank_account', ok: Boolean(bank), detail: bank?.name ?? 'No bank account' },
      { key: 'whatsapp_channel', ok: Boolean(channel), detail: channel?.name ?? 'No channel' },
    ];
    return { ready: checks.every((item) => item.ok), checks };
  }

  devices(user: AuthUser) {
    return this.prisma.mobileDevice.findMany({
      where: { tenantId: requireTenantId(user), userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  registerDevice(user: AuthUser, dto: DeviceDto) {
    return this.prisma.mobileDevice.create({
      data: { tenantId: requireTenantId(user), userId: user.userId, label: dto.label ?? 'Field device' },
    });
  }

  async sync(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const [tickets, attendance, offline] = await Promise.all([
      this.prisma.serviceTicket.findMany({
        where: { tenantId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.attendance.findMany({
        where: { tenantId },
        take: 20,
        orderBy: { workDate: 'desc' },
      }),
      this.prisma.offlineAction.findMany({
        where: { tenantId, userId: user.userId },
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { tickets, attendance, offline, serverTime: new Date().toISOString() };
  }

  async offline(user: AuthUser, dto: OfflineDto) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.offlineAction.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.offlineAction.create({
      data: {
        tenantId,
        userId: user.userId,
        deviceId: dto.deviceId,
        idempotencyKey: dto.idempotencyKey,
        action: dto.action,
        payload: dto.payload as Prisma.InputJsonValue,
        status: 'ACCEPTED',
      },
    });
  }

  private async validateRows(
    tenantId: string,
    entityType: string,
    rows: { id: string; legacyId: string; payload: unknown }[],
  ) {
    return Promise.all(
      rows.map(async (row) => {
        const payload = row.payload as Record<string, unknown>;
        const error =
          entityType === 'customers' && !payload.name
            ? 'name is required'
            : entityType === 'products' && !payload.sku
              ? 'sku is required'
              : entityType === 'employees' && !payload.name
                ? 'name is required'
                : null;
        if (error) {
          await this.prisma.importRow.update({ where: { id: row.id }, data: { status: 'ERROR', error } });
          return { ...row, status: 'ERROR', error };
        }
        await this.prisma.importRow.update({ where: { id: row.id }, data: { status: 'VALID' } });
        return { ...row, status: 'VALID', error: null };
      }),
    );
  }

  private async applyRow(tenantId: string, entityType: string, legacyId: string, payload: Record<string, unknown>) {
    if (entityType === 'customers' || entityType === 'parties') {
      const code = String(payload.code ?? `IMP-${legacyId}`.slice(0, 20));
      const party = await this.prisma.party.upsert({
        where: { tenantId_code: { tenantId, code } },
        update: { name: String(payload.name ?? code) },
        create: {
          tenantId,
          code,
          name: String(payload.name ?? code),
          type: 'CUSTOMER',
          email: payload.email ? String(payload.email) : undefined,
          phone: payload.phone ? String(payload.phone) : undefined,
          normalizedEmail: payload.email ? normalizeEmail(String(payload.email)) : undefined,
          normalizedPhone: payload.phone ? normalizePhone(String(payload.phone)) : undefined,
          normalizedTaxId: payload.taxId ? normalizeTaxId(String(payload.taxId)) : undefined,
        },
      });
      return party.id;
    }
    if (entityType === 'products') {
      const sku = String(payload.sku);
      const product = await this.prisma.product.upsert({
        where: { tenantId_sku: { tenantId, sku } },
        update: { name: String(payload.name ?? sku) },
        create: {
          tenantId,
          sku,
          name: String(payload.name ?? sku),
          type: 'GOODS',
          unitPrice: Number(payload.unitPrice ?? 0),
          taxRate: Number(payload.taxRate ?? 0),
        },
      });
      return product.id;
    }
    if (entityType === 'employees') {
      const code = String(payload.code ?? `EMP-${legacyId}`.slice(0, 20));
      const employee = await this.prisma.employee.upsert({
        where: { tenantId_code: { tenantId, code } },
        update: { name: String(payload.name ?? code) },
        create: {
          tenantId,
          code,
          name: String(payload.name ?? code),
          joiningDate: new Date(),
        },
      });
      return employee.id;
    }
    throw new BadRequestException({ code: 'UNSUPPORTED_ENTITY', message: `Cannot import ${entityType}` });
  }
}
