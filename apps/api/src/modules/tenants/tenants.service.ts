import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_TEMPLATES } from '../../common/constants/permissions';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  taxRegime?: string;

  @IsOptional()
  @IsString()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  ownerPassword?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  taxRegime?: string;

  @IsOptional()
  @IsString()
  status?: 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'SUSPENDED' | 'CLOSED';
}

export class CreateBranchDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateDepartmentDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;
}

export class CreateFiscalYearDto {
  @IsString()
  name!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;
}

export class UpsertSequenceDto {
  @IsString()
  branchId!: string;

  @IsString()
  fiscalYearId!: string;

  @IsString()
  documentType!: string;

  @IsString()
  prefix!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  nextNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  padding?: number;
}

export class InviteUserDto {
  @IsString()
  email!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  roleCode!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  defaultBranchId?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { plan: true, _count: { select: { memberships: true, branches: true } } },
    });
  }

  async get(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { plan: true, settings: true, branches: true, departments: true, fiscalYears: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    }
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    const slug = dto.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const plan = await this.prisma.plan.findUnique({ where: { code: 'starter' } });
    const ownerPassword = dto.ownerPassword ?? 'ChangeMe!Owner1';

    return this.prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: dto.name,
            slug,
            legalName: dto.legalName,
            locale: dto.locale ?? 'en-IN',
            timezone: dto.timezone ?? 'Asia/Kolkata',
            currency: dto.currency ?? 'INR',
            taxRegime: dto.taxRegime ?? 'IN_GST',
            planId: plan?.id,
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });
        await this.provisionTenant(tx, tenant.id, {
          ownerEmail: dto.ownerEmail,
          ownerName: dto.ownerName,
          ownerPassword,
        });
        await tx.auditEvent.create({
          data: {
            tenantId: tenant.id,
            action: 'CREATE',
            entityType: 'Tenant',
            entityId: tenant.id,
            next: { name: dto.name, slug },
          },
        });
        return tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          include: { branches: true, departments: true, roles: true, fiscalYears: true },
        });
      },
      { maxWait: 20_000, timeout: 180_000 },
    );
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.get(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async provisionTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
    owner?: { ownerEmail?: string; ownerName?: string; ownerPassword: string },
  ) {
    const permissions = await tx.permission.findMany();
    if (!permissions.length) {
      throw new BadRequestException({ code: 'PERMISSIONS_MISSING', message: 'Permission catalog is not seeded' });
    }
    const permissionByKey = new Map(permissions.map((item) => [item.key, item]));

    for (const [code, template] of Object.entries(ROLE_TEMPLATES)) {
      const role = await tx.role.create({
        data: {
          tenantId,
          code,
          name: template.name,
          description: template.description,
          isSystem: true,
        },
      });
      const keys = template.permissions === '*' ? permissions.map((item) => item.key) : template.permissions;
      await tx.rolePermission.createMany({
        data: keys
          .map((key) => permissionByKey.get(key))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
    }

    const hq = await tx.branch.create({
      data: { tenantId, code: 'HQ', name: 'Head office', isDefault: true },
    });
    await tx.department.createMany({
      data: [
        { tenantId, code: 'SALES', name: 'Sales' },
        { tenantId, code: 'SERVICE', name: 'Service' },
        { tenantId, code: 'ACCOUNTS', name: 'Accounts' },
        { tenantId, code: 'DISPATCH', name: 'Dispatch' },
        { tenantId, code: 'HR', name: 'Human resources' },
      ],
    });

    const now = new Date();
    const fyStart = new Date(now.getFullYear(), 3, 1);
    const start = now >= fyStart ? fyStart : new Date(now.getFullYear() - 1, 3, 1);
    const end = new Date(start.getFullYear() + 1, 2, 31);
    const fiscal = await tx.fiscalYear.create({
      data: {
        tenantId,
        name: `FY ${start.getFullYear()}-${String(end.getFullYear()).slice(-2)}`,
        startsOn: start,
        endsOn: end,
        isCurrent: true,
      },
    });

    const documentTypes = ['SO', 'INV', 'QTN', 'RMA', 'PO', 'PAY', 'TASK', 'JV', 'TKT', 'SHIP', 'PICK', 'PAYSLIP'];
    await tx.documentSequence.createMany({
      data: documentTypes.map((documentType) => ({
        tenantId,
        branchId: hq.id,
        fiscalYearId: fiscal.id,
        documentType,
        prefix: `${documentType}-`,
        nextNumber: 1,
        padding: 5,
      })),
    });

    await tx.tenantSetting.createMany({
      data: [
        { tenantId, key: 'negative_stock', value: { allowed: false } },
        { tenantId, key: 'maker_checker_payments', value: { enabled: true } },
        { tenantId, key: 'attendance_sources', value: { web: true, mobile: true, biometric: false } },
        { tenantId, key: 'sales.max_discount_pct', value: { pct: 25 } },
        { tenantId, key: 'sales.reserve_on_approve', value: { enabled: true } },
        { tenantId, key: 'task.escalate_hours', value: { hours: 24 } },
      ],
    });

    await this.provisionOperationsMasters(tx, tenantId, hq.id);

    if (owner?.ownerEmail) {
      const email = owner.ownerEmail.toLowerCase();
      const existing = await tx.user.findUnique({ where: { email } });
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email,
            displayName: owner.ownerName ?? 'Tenant owner',
            passwordHash: await bcrypt.hash(owner.ownerPassword, 12),
          },
        }));
      const membership = await tx.membership.create({
        data: {
          tenantId,
          userId: user.id,
          status: 'ACTIVE',
          acceptedAt: new Date(),
          defaultBranchId: hq.id,
        },
      });
      const ownerRole = await tx.role.findUniqueOrThrow({
        where: { tenantId_code: { tenantId, code: 'tenant_owner' } },
      });
      await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: ownerRole.id } });
    }
  }

  async provisionOperationsMasters(tx: Prisma.TransactionClient, tenantId: string, branchId?: string) {
    const branch =
      (branchId
        ? await tx.branch.findFirst({ where: { id: branchId, tenantId } })
        : await tx.branch.findFirst({ where: { tenantId, isDefault: true } })) ??
      (await tx.branch.findFirst({ where: { tenantId } }));
    if (!branch) {
      return;
    }

    const warehouse = await tx.warehouse.findUnique({ where: { tenantId_code: { tenantId, code: 'HQ' } } });
    if (!warehouse) {
      await tx.warehouse.create({
        data: { tenantId, branchId: branch.id, code: 'HQ', name: 'Main warehouse', isDefault: true },
      });
    }

    const priceList = await tx.priceList.findUnique({ where: { tenantId_code: { tenantId, code: 'STD' } } });
    if (!priceList) {
      await tx.priceList.create({
        data: { tenantId, code: 'STD', name: 'Standard', isDefault: true },
      });
    }

    const accounts: { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' }[] = [
      { code: '1000', name: 'Cash', type: 'ASSET' },
      { code: '1100', name: 'Bank', type: 'ASSET' },
      { code: '1200', name: 'Accounts receivable', type: 'ASSET' },
      { code: '1300', name: 'Inventory', type: 'ASSET' },
      { code: '2000', name: 'Accounts payable', type: 'LIABILITY' },
      { code: '2100', name: 'Tax payable', type: 'LIABILITY' },
      { code: '2200', name: 'Salary payable', type: 'LIABILITY' },
      { code: '3000', name: 'Owner equity', type: 'EQUITY' },
      { code: '4000', name: 'Sales', type: 'INCOME' },
      { code: '4100', name: 'Sales returns', type: 'INCOME' },
      { code: '5000', name: 'Cost of goods', type: 'EXPENSE' },
      { code: '6000', name: 'Operating expenses', type: 'EXPENSE' },
      { code: '6100', name: 'Salaries', type: 'EXPENSE' },
    ];
    for (const account of accounts) {
      await tx.ledgerAccount.upsert({
        where: { tenantId_code: { tenantId, code: account.code } },
        update: {},
        create: { tenantId, ...account, isSystem: true },
      });
    }

    const extraSettings = [
      { key: 'sales.max_discount_pct', value: { pct: 25 } },
      { key: 'sales.reserve_on_approve', value: { enabled: true } },
      { key: 'task.escalate_hours', value: { hours: 24 } },
    ];
    for (const setting of extraSettings) {
      await tx.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: setting.key } },
        update: {},
        create: { tenantId, key: setting.key, value: setting.value },
      });
    }

    const extraDocs = ['JV', 'TKT', 'SHIP', 'PICK', 'PAYSLIP', 'RMA'];
    const fiscal = await tx.fiscalYear.findFirst({ where: { tenantId, isCurrent: true } });
    if (fiscal) {
      for (const documentType of extraDocs) {
        await tx.documentSequence.upsert({
          where: {
            tenantId_branchId_fiscalYearId_documentType: {
              tenantId,
              branchId: branch.id,
              fiscalYearId: fiscal.id,
              documentType,
            },
          },
          update: {},
          create: {
            tenantId,
            branchId: branch.id,
            fiscalYearId: fiscal.id,
            documentType,
            prefix: `${documentType}-`,
            nextNumber: 1,
            padding: 5,
          },
        });
      }
    }

    await tx.designation.upsert({
      where: { tenantId_code: { tenantId, code: 'TECH' } },
      update: {},
      create: { tenantId, code: 'TECH', name: 'Technician' },
    });
    await tx.shift.upsert({
      where: { tenantId_code: { tenantId, code: 'DAY' } },
      update: {},
      create: { tenantId, code: 'DAY', name: 'Day shift', startTime: '09:30', endTime: '18:30', weeklyOffs: [0] },
    });
    await tx.leavePolicy.upsert({
      where: { tenantId_code: { tenantId, code: 'CL' } },
      update: {},
      create: { tenantId, code: 'CL', name: 'Casual leave', annualDays: 12 },
    });
    await tx.product.upsert({
      where: { tenantId_sku: { tenantId, sku: 'REC-CHARGE' } },
      update: {},
      create: {
        tenantId,
        sku: 'REC-CHARGE',
        name: 'Recurring charge',
        type: 'SERVICE',
        taxRate: 18,
        unitPrice: 0,
        trackStock: false,
      },
    });
  }
}
