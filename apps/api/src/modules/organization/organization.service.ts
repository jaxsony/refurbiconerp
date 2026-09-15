import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  CreateBranchDto,
  CreateDepartmentDto,
  CreateFiscalYearDto,
  InviteUserDto,
  UpsertSequenceDto,
} from '../tenants/tenants.service';
import { Allow, IsBoolean, IsEmail, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { pageOf, paging, PageQuery } from '../../common/utils/paging';

export class UpdateSettingDto {
  @IsString()
  key!: string;

  @Allow()
  value!: unknown;
}

export class CustomFieldDto {
  @IsString()
  entityType!: string;
  @IsString()
  key!: string;
  @IsString()
  label!: string;
  @IsString()
  fieldType!: string;
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  displayName?: string;
  @IsOptional()
  @IsEmail()
  email?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
  @IsOptional()
  @IsString()
  roleCode?: string;
  @IsOptional()
  @IsString()
  departmentId?: string;
  @IsOptional()
  @IsString()
  defaultBranchId?: string;
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
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  isActive: true,
  lastLoginAt: true,
} as const;

export class ApprovalPolicyDto {
  @IsString()
  name!: string;
  @IsString()
  documentType!: string;
  @IsString()
  requiredRole!: string;
  @IsOptional()
  @IsNumber()
  minAmount?: number;
  @IsOptional()
  @IsNumber()
  maxAmount?: number;
  @IsOptional()
  @IsString()
  departmentId?: string;
  @IsOptional()
  @IsString()
  branchId?: string;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId(user: AuthUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException({ code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context required' });
    }
    return user.tenantId;
  }

  branches(user: AuthUser) {
    return this.prisma.branch.findMany({
      where: { tenantId: this.tenantId(user) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createBranch(user: AuthUser, dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: { ...dto, tenantId: this.tenantId(user) },
    });
  }

  departments(user: AuthUser) {
    return this.prisma.department.findMany({
      where: { tenantId: this.tenantId(user) },
      orderBy: { name: 'asc' },
    });
  }

  createDepartment(user: AuthUser, dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: { ...dto, tenantId: this.tenantId(user) },
    });
  }

  async members(user: AuthUser, query: PageQuery = {}) {
    const tenantId = this.tenantId(user);
    const { skip, take, page, pageSize, q } = paging(query);
    const where = {
      tenantId,
      ...(q
        ? {
            OR: [
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
              { user: { displayName: { contains: q, mode: 'insensitive' as const } } },
              { user: { phone: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const include = {
      user: { select: userSelect },
      roles: { include: { role: { select: { id: true, code: true, name: true } } } },
      department: true,
      defaultBranch: true,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.membership.count({ where }),
    ]);
    return pageOf(items, total, page, pageSize);
  }

  async getMember(user: AuthUser, id: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, tenantId: this.tenantId(user) },
      include: {
        user: { select: userSelect },
        roles: { include: { role: { select: { id: true, code: true, name: true } } } },
        department: true,
        defaultBranch: true,
      },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return membership;
  }

  async invite(user: AuthUser, dto: InviteUserDto) {
    const tenantId = this.tenantId(user);
    const email = dto.email.toLowerCase();
    const role = await this.prisma.role.findUnique({
      where: { tenantId_code: { tenantId, code: dto.roleCode } },
    });
    if (!role) {
      throw new BadRequestException({ code: 'ROLE_NOT_FOUND', message: 'Unknown role for this tenant' });
    }
    const password = dto.password ?? 'ChangeMe!User1';
    const existing = await this.prisma.user.findUnique({ where: { email } });
    const account =
      existing ??
      (await this.prisma.user.create({
        data: {
          email,
          displayName: dto.displayName,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode,
          country: dto.country ?? 'IN',
          passwordHash: await bcrypt.hash(password, 12),
        },
      }));

    const membership = await this.prisma.membership.upsert({
      where: { tenantId_userId: { tenantId, userId: account.id } },
      update: {
        status: 'ACTIVE',
        departmentId: dto.departmentId,
        defaultBranchId: dto.defaultBranchId,
        acceptedAt: new Date(),
      },
      create: {
        tenantId,
        userId: account.id,
        status: 'ACTIVE',
        departmentId: dto.departmentId,
        defaultBranchId: dto.defaultBranchId,
        acceptedAt: new Date(),
      },
    });
    await this.prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await this.prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        actorUserId: user.userId,
        action: 'CREATE',
        entityType: 'Membership',
        entityId: membership.id,
        next: { email, roleCode: dto.roleCode },
      },
    });
    return this.prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
      include: {
        user: { select: userSelect },
        roles: { include: { role: true } },
        department: true,
        defaultBranch: true,
      },
    });
  }

  async updateMember(user: AuthUser, id: string, dto: UpdateMemberDto) {
    const membership = await this.getMember(user, id);
    const tenantId = this.tenantId(user);
    const data: Record<string, unknown> = {};
    if (dto.displayName) data.displayName = dto.displayName;
    if (dto.email) data.email = dto.email.toLowerCase();
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.addressLine1 !== undefined) data.addressLine1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) data.addressLine2 = dto.addressLine2;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.postalCode !== undefined) data.postalCode = dto.postalCode;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);
    if (Object.keys(data).length) {
      await this.prisma.user.update({ where: { id: membership.userId }, data });
    }
    await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        departmentId: dto.departmentId === undefined ? membership.departmentId : dto.departmentId || null,
        defaultBranchId: dto.defaultBranchId === undefined ? membership.defaultBranchId : dto.defaultBranchId || null,
      },
    });
    if (dto.roleCode) {
      const role = await this.prisma.role.findUnique({
        where: { tenantId_code: { tenantId, code: dto.roleCode } },
      });
      if (!role) {
        throw new BadRequestException({ code: 'ROLE_NOT_FOUND', message: 'Unknown role for this tenant' });
      }
      await this.prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      await this.prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
    }
    return this.getMember(user, id);
  }

  roles(user: AuthUser) {
    return this.prisma.role.findMany({
      where: { tenantId: this.tenantId(user) },
      include: { permissions: { include: { permission: true } }, _count: { select: { memberships: true } } },
      orderBy: { name: 'asc' },
    });
  }

  permissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }

  settings(user: AuthUser) {
    return this.prisma.tenantSetting.findMany({
      where: { tenantId: this.tenantId(user) },
      orderBy: { key: 'asc' },
    });
  }

  upsertSetting(user: AuthUser, dto: UpdateSettingDto) {
    const tenantId = this.tenantId(user);
    return this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: dto.key } },
      update: { value: dto.value as object },
      create: { tenantId, key: dto.key, value: dto.value as object },
    });
  }

  fiscalYears(user: AuthUser) {
    return this.prisma.fiscalYear.findMany({
      where: { tenantId: this.tenantId(user) },
      orderBy: { startsOn: 'desc' },
    });
  }

  createFiscalYear(user: AuthUser, dto: CreateFiscalYearDto) {
    return this.prisma.fiscalYear.create({
      data: {
        tenantId: this.tenantId(user),
        name: dto.name,
        startsOn: new Date(dto.startsOn),
        endsOn: new Date(dto.endsOn),
      },
    });
  }

  sequences(user: AuthUser) {
    return this.prisma.documentSequence.findMany({
      where: { tenantId: this.tenantId(user) },
      include: { branch: true, fiscalYear: true },
      orderBy: { documentType: 'asc' },
    });
  }

  upsertSequence(user: AuthUser, dto: UpsertSequenceDto) {
    const tenantId = this.tenantId(user);
    return this.prisma.documentSequence.upsert({
      where: {
        tenantId_branchId_fiscalYearId_documentType: {
          tenantId,
          branchId: dto.branchId,
          fiscalYearId: dto.fiscalYearId,
          documentType: dto.documentType,
        },
      },
      update: { prefix: dto.prefix, nextNumber: dto.nextNumber, padding: dto.padding },
      create: { tenantId, ...dto },
    });
  }

  customFields(user: AuthUser) {
    return this.prisma.customField.findMany({
      where: { tenantId: this.tenantId(user) },
      orderBy: [{ entityType: 'asc' }, { label: 'asc' }],
    });
  }

  createCustomField(user: AuthUser, dto: CustomFieldDto) {
    return this.prisma.customField.create({
      data: { tenantId: this.tenantId(user), ...dto },
    });
  }

  approvalPolicies(user: AuthUser) {
    return this.prisma.approvalPolicy.findMany({
      where: { tenantId: this.tenantId(user) },
      include: { department: true, branch: true },
      orderBy: { name: 'asc' },
    });
  }

  createApprovalPolicy(user: AuthUser, dto: ApprovalPolicyDto) {
    return this.prisma.approvalPolicy.create({
      data: {
        tenantId: this.tenantId(user),
        name: dto.name,
        documentType: dto.documentType,
        requiredRole: dto.requiredRole,
        minAmount: dto.minAmount ?? 0,
        maxAmount: dto.maxAmount,
        departmentId: dto.departmentId,
        branchId: dto.branchId,
      },
    });
  }

  async audit(user: AuthUser, take = 50) {
    return this.prisma.auditEvent.findMany({
      where: { tenantId: this.tenantId(user) },
      include: { actor: { select: { id: true, email: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
  }

  async assertRecordTenant<T extends { tenantId: string }>(user: AuthUser, record: T | null, name: string): Promise<T> {
    if (!record || record.tenantId !== this.tenantId(user)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `${name} not found` });
    }
    return record;
  }
}
