import { PermissionAction, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PERMISSION_CATALOG, ROLE_TEMPLATES } from '../src/common/constants/permissions';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';

const prisma = new PrismaClient();

async function syncPermissions() {
  for (const [moduleName, action, label] of PERMISSION_CATALOG) {
    const key = `${moduleName}:${action}`;
    await prisma.permission.upsert({
      where: { key },
      update: { label, module: moduleName, action: action as PermissionAction },
      create: { key, module: moduleName, action: action as PermissionAction, label },
    });
  }
  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((item) => [item.key, item]));
  const roles = await prisma.role.findMany();
  for (const role of roles) {
    const template = ROLE_TEMPLATES[role.code];
    if (!template) {
      continue;
    }
    const keys = template.permissions === '*' ? permissions.map((item) => item.key) : template.permissions;
    for (const key of keys) {
      const permission = byKey.get(key);
      if (!permission) {
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
}

async function seedAcmeCatalog(tenantId: string) {
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId, isDefault: true } });
  if (!warehouse) {
    return;
  }
  const product = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId, sku: 'REFURB-PHONE' } },
    update: {},
    create: {
      tenantId,
      sku: 'REFURB-PHONE',
      name: 'Refurbished smartphone',
      type: 'GOODS',
      unit: 'NOS',
      taxRate: 18,
      unitPrice: 12000,
      costPrice: 7000,
      reorderLevel: 5,
      trackStock: true,
    },
  });
  await prisma.productVariant.upsert({
    where: { tenantId_sku: { tenantId, sku: 'REFURB-PHONE' } },
    update: {},
    create: { tenantId, productId: product.id, sku: 'REFURB-PHONE', name: 'Default', isDefault: true },
  });
  const service = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId, sku: 'DIAG-FEE' } },
    update: {},
    create: {
      tenantId,
      sku: 'DIAG-FEE',
      name: 'Diagnosis fee',
      type: 'SERVICE',
      taxRate: 18,
      unitPrice: 499,
      trackStock: false,
    },
  });
  await prisma.productVariant.upsert({
    where: { tenantId_sku: { tenantId, sku: 'DIAG-FEE' } },
    update: {},
    create: { tenantId, productId: service.id, sku: 'DIAG-FEE', name: 'Default', isDefault: true },
  });
  await prisma.stockBalance.upsert({
    where: { tenantId_warehouseId_productId: { tenantId, warehouseId: warehouse.id, productId: product.id } },
    update: { onHand: 25 },
    create: { tenantId, warehouseId: warehouse.id, productId: product.id, onHand: 25 },
  });
  await prisma.party.upsert({
    where: { tenantId_code: { tenantId, code: 'CUS-0001' } },
    update: {},
    create: {
      tenantId,
      type: 'CUSTOMER',
      code: 'CUS-0001',
      name: 'Northwind Traders',
      email: 'buy@northwind.demo',
      phone: '9876543210',
      normalizedEmail: 'buy@northwind.demo',
      normalizedPhone: '9876543210',
      creditLimit: 250000,
      paymentTermsDays: 15,
    },
  });
}

async function seedAcmePeopleAndService(tenantId: string) {
  const owner = await prisma.user.findUnique({ where: { email: 'owner@acme.demo' } });
  const designation = await prisma.designation.findUnique({ where: { tenantId_code: { tenantId, code: 'TECH' } } });
  const shift = await prisma.shift.findUnique({ where: { tenantId_code: { tenantId, code: 'DAY' } } });
  const policy = await prisma.leavePolicy.findUnique({ where: { tenantId_code: { tenantId, code: 'CL' } } });
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId, isDefault: true } });
  if (!owner || !designation || !shift || !policy) {
    return;
  }
  const employee = await prisma.employee.upsert({
    where: { tenantId_code: { tenantId, code: 'EMP-0001' } },
    update: { userId: owner.id, designationId: designation.id, shiftId: shift.id },
    create: {
      tenantId,
      userId: owner.id,
      code: 'EMP-0001',
      name: 'Anika Sharma',
      email: 'owner@acme.demo',
      designationId: designation.id,
      shiftId: shift.id,
      joiningDate: new Date('2024-04-01'),
      bankAccount: '501234567890',
      ifsc: 'HDFC0001234',
    },
  });
  await prisma.leaveBalance.upsert({
    where: {
      tenantId_employeeId_policyId_year: {
        tenantId,
        employeeId: employee.id,
        policyId: policy.id,
        year: new Date().getFullYear(),
      },
    },
    update: {},
    create: { tenantId, employeeId: employee.id, policyId: policy.id, year: new Date().getFullYear(), opening: 12 },
  });
  const existingStructure = await prisma.salaryStructure.findFirst({ where: { tenantId, employeeId: employee.id } });
  if (!existingStructure) {
    await prisma.salaryStructure.create({
      data: {
        tenantId,
        employeeId: employee.id,
        effectiveFrom: new Date('2024-04-01'),
        lines: {
          create: [
            { component: 'Basic', kind: 'EARNING', amount: 40000 },
            { component: 'HRA', kind: 'EARNING', amount: 16000 },
            { component: 'PF', kind: 'DEDUCTION', amount: 4800 },
          ],
        },
      },
    });
  }
  const scheme = await prisma.incentiveScheme.findFirst({ where: { tenantId, name: 'Collections 2%' } });
  if (!scheme) {
    await prisma.incentiveScheme.create({
      data: { tenantId, name: 'Collections 2%', formula: 'PERCENTAGE', rate: 2, holdUntilPaid: true },
    });
  }
  const spare = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId, sku: 'SCREEN-ASM' } },
    update: {},
    create: {
      tenantId,
      sku: 'SCREEN-ASM',
      name: 'Screen assembly',
      type: 'GOODS',
      unitPrice: 2500,
      costPrice: 1200,
      taxRate: 18,
      trackStock: true,
    },
  });
  if (warehouse) {
    await prisma.stockBalance.upsert({
      where: { tenantId_warehouseId_productId: { tenantId, warehouseId: warehouse.id, productId: spare.id } },
      update: { onHand: 10 },
      create: { tenantId, warehouseId: warehouse.id, productId: spare.id, onHand: 10 },
    });
  }
  const bank = await prisma.bankAccount.findFirst({ where: { tenantId, maskedNumber: 'XXXX1234' } });
  if (!bank) {
    await prisma.bankAccount.create({ data: { tenantId, name: 'HDFC Current', maskedNumber: 'XXXX1234', provider: 'manual' } });
  }
  const channel = await prisma.channelAccount.findFirst({ where: { tenantId, provider: 'whatsapp' } });
  if (!channel) {
    await prisma.channelAccount.create({ data: { tenantId, provider: 'whatsapp', name: 'Acme WhatsApp', phone: '918000000001' } });
  }
  const party = await prisma.party.findUnique({ where: { tenantId_code: { tenantId, code: 'CUS-0001' } } });
  const existingSchedule = await prisma.recurringSchedule.findFirst({ where: { tenantId, name: 'Northwind AMC' } });
  if (party && !existingSchedule) {
    await prisma.recurringSchedule.create({
      data: {
        tenantId,
        name: 'Northwind AMC',
        kind: 'AMC',
        frequency: 'MONTHLY',
        partyId: party.id,
        amount: 4999,
        taxRate: 18,
        nextRunAt: new Date(Date.now() - 86400_000),
        dueOffsetDays: 7,
      },
    });
  }
}

async function main() {
  await syncPermissions();

  await prisma.plan.upsert({
    where: { code: 'starter' },
    update: {},
    create: {
      code: 'starter',
      name: 'Starter',
      userLimit: 25,
      branchLimit: 3,
      modules: ['platform', 'crm', 'sales', 'accounts', 'hr', 'service', 'dispatch'],
    },
  });
  await prisma.plan.upsert({
    where: { code: 'growth' },
    update: {},
    create: {
      code: 'growth',
      name: 'Growth',
      userLimit: 100,
      branchLimit: 10,
      whatsappMonthlyCap: 5000,
      documentMonthlyCap: 25000,
      modules: ['platform', 'crm', 'sales', 'accounts', 'hr', 'service', 'dispatch', 'banking', 'whatsapp'],
    },
  });

  const adminHash = await bcrypt.hash(process.env.PLATFORM_ADMIN_PASSWORD ?? 'ChangeMe!Admin1', 12);
  await prisma.user.upsert({
    where: { email: process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@refurbicon.local' },
    update: { isPlatformAdmin: true, passwordHash: adminHash, isActive: true },
    create: {
      email: process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@refurbicon.local',
      displayName: 'Platform administrator',
      passwordHash: adminHash,
      isPlatformAdmin: true,
    },
  });

  const tenants = new TenantsService(prisma as unknown as PrismaService);
  const acme = await prisma.tenant.findUnique({ where: { slug: 'acme' } });
  if (!acme) {
    await tenants.create({
      name: 'Acme Refurbishers',
      slug: 'acme',
      legalName: 'Acme Refurbishers Pvt Ltd',
      ownerEmail: 'owner@acme.demo',
      ownerName: 'Anika Sharma',
      ownerPassword: 'ChangeMe!Owner1',
    });
  }
  const globex = await prisma.tenant.findUnique({ where: { slug: 'globex' } });
  if (!globex) {
    await tenants.create({
      name: 'Globex Service',
      slug: 'globex',
      legalName: 'Globex Service LLP',
      ownerEmail: 'owner@globex.demo',
      ownerName: 'Rahul Iyer',
      ownerPassword: 'ChangeMe!Owner1',
    });
  }

  for (const slug of ['acme', 'globex']) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
    await tenants.provisionOperationsMasters(prisma, tenant.id);
  }

  const acmeTenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'acme' } });
  const salesRole = await prisma.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'sales_user' } },
  });
  const salesEmail = 'sales@acme.demo';
  const salesUser = await prisma.user.upsert({
    where: { email: salesEmail },
    update: {},
    create: {
      email: salesEmail,
      displayName: 'Sana Kapoor',
      passwordHash: await bcrypt.hash('ChangeMe!Sales1', 12),
    },
  });
  const membership = await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: acmeTenant.id, userId: salesUser.id } },
    update: { status: 'ACTIVE' },
    create: { tenantId: acmeTenant.id, userId: salesUser.id, status: 'ACTIVE', acceptedAt: new Date() },
  });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: salesRole.id } },
    update: {},
    create: { membershipId: membership.id, roleId: salesRole.id },
  });

  await seedAcmeCatalog(acmeTenant.id);
  await seedAcmePeopleAndService(acmeTenant.id);
  await syncPermissions();

  console.log('Seed complete. Platform admin: admin@refurbicon.local');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
