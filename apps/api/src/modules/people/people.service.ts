import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceSource, IncentiveFormula, LeaveStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { isBalanced, money } from '../../common/utils/money';
import { attendancePaidDay, incentiveAmount, payrollLine } from '../../common/utils/people.math';
import { pageOf, paging, PageQuery } from '../../common/utils/paging';

export class EmployeeDto {
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  code?: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  userId?: string;
  @IsOptional()
  @IsString()
  departmentId?: string;
  @IsOptional()
  @IsString()
  designationId?: string;
  @IsOptional()
  @IsString()
  shiftId?: string;
  @IsOptional()
  @IsDateString()
  joiningDate?: string;
  @IsOptional()
  @IsString()
  bankAccount?: string;
  @IsOptional()
  @IsString()
  ifsc?: string;
}

export class ClockDto {
  @IsOptional()
  @IsString()
  employeeId?: string;
  @IsOptional()
  @IsNumber()
  latitude?: number;
  @IsOptional()
  @IsNumber()
  longitude?: number;
  @IsOptional()
  @IsEnum(AttendanceSource)
  source?: AttendanceSource;
}

export class LeaveRequestDto {
  @IsString()
  employeeId!: string;
  @IsString()
  policyId!: string;
  @IsDateString()
  fromDate!: string;
  @IsDateString()
  toDate!: string;
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PayrollDto {
  @IsDateString()
  periodStart!: string;
  @IsDateString()
  periodEnd!: string;
  @IsOptional()
  @IsNumber()
  workingDays?: number;
}

export class SchemeDto {
  @IsString()
  name!: string;
  @IsEnum(IncentiveFormula)
  formula!: IncentiveFormula;
  @IsNumber()
  rate!: number;
  @IsOptional()
  @IsBoolean()
  holdUntilPaid?: boolean;
}

export class CodeNameDto {
  @IsString()
  code!: string;
  @IsString()
  name!: string;
}

export class ShiftDto extends CodeNameDto {
  @IsString()
  startTime!: string;
  @IsString()
  endTime!: string;
}

export class HolidayDto {
  @IsString()
  name!: string;
  @IsDateString()
  date!: string;
}

export class LeavePolicyDto {
  @IsString()
  code!: string;
  @IsString()
  name!: string;
  @IsNumber()
  annualDays!: number;
  @IsOptional()
  @IsBoolean()
  encashable?: boolean;
}

export class LeaveDecisionDto {
  @IsEnum(LeaveStatus)
  status!: LeaveStatus;
}

export class CalculateIncentiveDto {
  @IsString()
  schemeId!: string;
  @IsDateString()
  periodStart!: string;
  @IsDateString()
  periodEnd!: string;
}

export class SalaryLineDto {
  @IsString()
  component!: string;
  @IsString()
  kind!: string;
  @IsNumber()
  amount!: number;
}

export class SalaryStructureDto {
  @IsString()
  employeeId!: string;
  @IsDateString()
  effectiveFrom!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryLineDto)
  lines!: SalaryLineDto[];
}

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  async employees(user: AuthUser, query: PageQuery = {}) {
    const tenantId = requireTenantId(user);
    const { skip, take, page, pageSize, q } = paging(query);
    const where = {
      tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { code: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: { designation: true, shift: true },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return pageOf(items, total, page, pageSize);
  }

  async createEmployee(user: AuthUser, dto: EmployeeDto) {
    const tenantId = requireTenantId(user);
    const count = await this.prisma.employee.count({ where: { tenantId } });
    const employee = await this.prisma.employee.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code ?? `EMP-${String(count + 1).padStart(4, '0')}`,
        email: dto.email,
        phone: dto.phone,
        userId: dto.userId,
        departmentId: dto.departmentId,
        designationId: dto.designationId,
        shiftId: dto.shiftId,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : new Date(),
        bankAccount: dto.bankAccount,
        ifsc: dto.ifsc,
      },
    });
    const policies = await this.prisma.leavePolicy.findMany({ where: { tenantId } });
    const year = new Date().getFullYear();
    for (const policy of policies) {
      await this.prisma.leaveBalance.upsert({
        where: {
          tenantId_employeeId_policyId_year: { tenantId, employeeId: employee.id, policyId: policy.id, year },
        },
        update: {},
        create: { tenantId, employeeId: employee.id, policyId: policy.id, year, opening: policy.annualDays },
      });
    }
    return employee;
  }

  designations(user: AuthUser) {
    return this.prisma.designation.findMany({ where: { tenantId: requireTenantId(user) } });
  }

  createDesignation(user: AuthUser, dto: CodeNameDto) {
    return this.prisma.designation.create({ data: { tenantId: requireTenantId(user), ...dto } });
  }

  shifts(user: AuthUser) {
    return this.prisma.shift.findMany({ where: { tenantId: requireTenantId(user) } });
  }

  createShift(user: AuthUser, dto: ShiftDto) {
    return this.prisma.shift.create({
      data: { tenantId: requireTenantId(user), weeklyOffs: [0], ...dto },
    });
  }

  holidays(user: AuthUser) {
    return this.prisma.holiday.findMany({ where: { tenantId: requireTenantId(user) }, orderBy: { date: 'asc' } });
  }

  createHoliday(user: AuthUser, dto: HolidayDto) {
    return this.prisma.holiday.create({
      data: { tenantId: requireTenantId(user), name: dto.name, date: new Date(dto.date) },
    });
  }

  attendance(user: AuthUser, employeeId?: string) {
    return this.prisma.attendance.findMany({
      where: { tenantId: requireTenantId(user), ...(employeeId ? { employeeId } : {}) },
      include: { employee: true },
      orderBy: { workDate: 'desc' },
      take: 200,
    });
  }

  async clockIn(user: AuthUser, dto: ClockDto) {
    const tenantId = requireTenantId(user);
    const employee = await this.resolveEmployee(user, dto.employeeId);
    const workDate = this.day(new Date());
    const existing = await this.prisma.attendance.findUnique({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId: employee.id, workDate } },
    });
    if (existing?.clockInAt) {
      return existing;
    }
    const shift = employee.shift;
    const now = new Date();
    let lateMinutes = 0;
    if (shift) {
      const [h, m] = shift.startTime.split(':').map(Number);
      const start = new Date(now);
      start.setHours(h, m, 0, 0);
      lateMinutes = Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000));
    }
    const status = lateMinutes > 10 ? 'LATE' : 'PRESENT';
    return this.prisma.attendance.upsert({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId: employee.id, workDate } },
      update: { clockInAt: now, source: dto.source ?? 'WEB', latitude: dto.latitude, longitude: dto.longitude, lateMinutes, status, paidDay: attendancePaidDay(status) },
      create: {
        tenantId,
        employeeId: employee.id,
        workDate,
        clockInAt: now,
        source: dto.source ?? 'WEB',
        latitude: dto.latitude,
        longitude: dto.longitude,
        lateMinutes,
        status,
        paidDay: attendancePaidDay(status),
      },
    });
  }

  async clockOut(user: AuthUser, dto: ClockDto) {
    const tenantId = requireTenantId(user);
    const employee = await this.resolveEmployee(user, dto.employeeId);
    const workDate = this.day(new Date());
    const row = await this.prisma.attendance.findUnique({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId: employee.id, workDate } },
    });
    if (!row) {
      throw new BadRequestException({ code: 'NOT_CLOCKED_IN', message: 'Clock in first' });
    }
    const now = new Date();
    let otMinutes = 0;
    if (employee.shift) {
      const [h, m] = employee.shift.endTime.split(':').map(Number);
      const end = new Date(now);
      end.setHours(h, m, 0, 0);
      otMinutes = Math.max(0, Math.round((now.getTime() - end.getTime()) / 60000));
    }
    return this.prisma.attendance.update({
      where: { id: row.id },
      data: { clockOutAt: now, otMinutes },
    });
  }

  leavePolicies(user: AuthUser) {
    return this.prisma.leavePolicy.findMany({ where: { tenantId: requireTenantId(user) } });
  }

  createLeavePolicy(user: AuthUser, dto: LeavePolicyDto) {
    return this.prisma.leavePolicy.create({
      data: {
        tenantId: requireTenantId(user),
        code: dto.code,
        name: dto.name,
        annualDays: dto.annualDays,
        encashable: dto.encashable ?? false,
      },
    });
  }

  salaryStructures(user: AuthUser, employeeId?: string) {
    return this.prisma.salaryStructure.findMany({
      where: { tenantId: requireTenantId(user), ...(employeeId ? { employeeId } : {}) },
      include: { lines: true, employee: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  createSalaryStructure(user: AuthUser, dto: SalaryStructureDto) {
    return this.prisma.salaryStructure.create({
      data: {
        tenantId: requireTenantId(user),
        employeeId: dto.employeeId,
        effectiveFrom: new Date(dto.effectiveFrom),
        lines: { create: dto.lines },
      },
      include: { lines: true },
    });
  }

  leaveRequests(user: AuthUser) {
    return this.prisma.leaveRequest.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { employee: true, policy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requestLeave(user: AuthUser, dto: LeaveRequestDto) {
    const tenantId = requireTenantId(user);
    const days = Math.max(1, Math.round((new Date(dto.toDate).getTime() - new Date(dto.fromDate).getTime()) / 86400_000) + 1);
    return this.prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        policyId: dto.policyId,
        fromDate: new Date(dto.fromDate),
        toDate: new Date(dto.toDate),
        days,
        reason: dto.reason,
      },
    });
  }

  async decideLeave(user: AuthUser, id: string, status: LeaveStatus) {
    const tenantId = requireTenantId(user);
    const req = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!req) {
      throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', message: 'Leave request not found' });
    }
    if (status === 'APPROVED') {
      const year = req.fromDate.getFullYear();
      const balance = await this.prisma.leaveBalance.findUnique({
        where: { tenantId_employeeId_policyId_year: { tenantId, employeeId: req.employeeId, policyId: req.policyId, year } },
      });
      if (balance) {
        await this.prisma.leaveBalance.update({
          where: { id: balance.id },
          data: { used: money(balance.used).add(req.days) },
        });
      }
    }
    return this.prisma.leaveRequest.update({ where: { id }, data: { status } });
  }

  payrollRuns(user: AuthUser) {
    return this.prisma.payrollRun.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { lines: { include: { employee: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async previewPayroll(user: AuthUser, dto: PayrollDto) {
    const tenantId = requireTenantId(user);
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    const workingDays = dto.workingDays ?? 26;
    const run = await this.prisma.payrollRun.create({
      data: { tenantId, periodStart: start, periodEnd: end, workingDays, status: 'PREVIEWED' },
    });
    const employees = await this.prisma.employee.findMany({ where: { tenantId, status: 'ACTIVE' }, include: { structures: { include: { lines: true }, orderBy: { effectiveFrom: 'desc' }, take: 1 } } });
    for (const employee of employees) {
      const attendance = await this.prisma.attendance.findMany({
        where: { tenantId, employeeId: employee.id, workDate: { gte: start, lte: end } },
      });
      const recordedPaid = attendance.reduce((sum, row) => sum.add(row.paidDay), money(0));
      const missingDays = Math.max(0, workingDays - attendance.length);
      const paidDays = attendance.length ? recordedPaid.add(missingDays) : money(workingDays);
      const structure = employee.structures[0];
      const earnings = structure?.lines.filter((l) => l.kind === 'EARNING').reduce((s, l) => s.add(l.amount), money(0)) ?? money(0);
      const deductions = structure?.lines.filter((l) => l.kind === 'DEDUCTION').reduce((s, l) => s.add(l.amount), money(0)) ?? money(0);
      const awards = await this.prisma.incentiveAward.findMany({
        where: { tenantId, employeeId: employee.id, status: 'APPROVED', periodStart: { gte: start }, periodEnd: { lte: end } },
      });
      const incentives = awards.reduce((s, a) => s.add(a.amount), money(0));
      const line = payrollLine({
        workingDays,
        paidDays: Number(paidDays),
        earnings: Number(earnings),
        deductions: Number(deductions),
        incentives: Number(incentives),
      });
      await this.prisma.payrollLine.create({
        data: {
          tenantId,
          runId: run.id,
          employeeId: employee.id,
          ...line,
          trace: { attendance: attendance.length, awards: awards.map((a) => a.id) },
        },
      });
    }
    return this.prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id }, include: { lines: { include: { employee: true } } } });
  }

  async approvePayroll(user: AuthUser, id: string) {
    return this.transitionPayroll(user, id, 'APPROVED');
  }

  async lockPayroll(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!run) {
      throw new NotFoundException({ code: 'PAYROLL_NOT_FOUND', message: 'Payroll run not found' });
    }
    if (run.status !== 'APPROVED') {
      throw new BadRequestException({ code: 'PAYROLL_NOT_APPROVED', message: 'Approve payroll before locking' });
    }
    const total = run.lines.reduce((sum, line) => sum.add(line.netPay), money(0));
    if (total.gt(0)) {
      await this.postPayrollJournal(tenantId, run.id, total);
    }
    return this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'LOCKED', lockedAt: new Date() },
      include: { lines: { include: { employee: true } } },
    });
  }

  async publishPayroll(user: AuthUser, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId: requireTenantId(user) } });
    if (!run) {
      throw new NotFoundException({ code: 'PAYROLL_NOT_FOUND', message: 'Payroll run not found' });
    }
    if (run.status !== 'LOCKED') {
      throw new BadRequestException({ code: 'PAYROLL_NOT_LOCKED', message: 'Lock payroll before publishing payslips' });
    }
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'PUBLISHED' } });
    await this.prisma.payrollLine.updateMany({ where: { runId: run.id }, data: { publishedAt: new Date() } });
    return this.prisma.payrollRun.findUniqueOrThrow({ where: { id }, include: { lines: { include: { employee: true } } } });
  }

  schemes(user: AuthUser) {
    return this.prisma.incentiveScheme.findMany({ where: { tenantId: requireTenantId(user) } });
  }

  createScheme(user: AuthUser, dto: SchemeDto) {
    return this.prisma.incentiveScheme.create({
      data: { tenantId: requireTenantId(user), name: dto.name, formula: dto.formula, rate: dto.rate, holdUntilPaid: dto.holdUntilPaid ?? true },
    });
  }

  awards(user: AuthUser) {
    return this.prisma.incentiveAward.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { employee: true, scheme: true },
      orderBy: { periodStart: 'desc' },
    });
  }

  async calculateIncentives(user: AuthUser, dto: CalculateIncentiveDto) {
    const tenantId = requireTenantId(user);
    const scheme = await this.prisma.incentiveScheme.findFirst({ where: { id: dto.schemeId, tenantId } });
    if (!scheme) {
      throw new NotFoundException({ code: 'SCHEME_NOT_FOUND', message: 'Scheme not found' });
    }
    const periodStart = dto.periodStart;
    const periodEnd = dto.periodEnd;
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, kind: 'SALES', invoiceDate: { gte: new Date(periodStart), lte: new Date(periodEnd) } },
    });
    const employees = await this.prisma.employee.findMany({ where: { tenantId, status: 'ACTIVE' } });
    const created = [];
    for (const employee of employees) {
      const base = invoices.reduce((s, inv) => s.add(inv.paidAmount), money(0));
      const result = incentiveAmount({
        formula: scheme.formula,
        rate: Number(scheme.rate),
        base: Number(base),
        unpaid: Number(base) <= 0,
        holdUntilPaid: scheme.holdUntilPaid,
      });
      const existing = await this.prisma.incentiveAward.findFirst({
        where: {
          tenantId,
          schemeId: scheme.id,
          employeeId: employee.id,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
        },
      });
      if (existing) {
        created.push(existing);
        continue;
      }
      const award = await this.prisma.incentiveAward.create({
        data: {
          tenantId,
          schemeId: scheme.id,
          employeeId: employee.id,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          amount: result.amount,
          status: result.status,
          trace: { formula: scheme.formula, base: Number(base), invoices: invoices.map((i) => i.id) },
        },
      });
      created.push(award);
    }
    return created;
  }

  async approveAward(user: AuthUser, id: string) {
    const award = await this.prisma.incentiveAward.findFirst({ where: { id, tenantId: requireTenantId(user) } });
    if (!award) {
      throw new NotFoundException({ code: 'AWARD_NOT_FOUND', message: 'Award not found' });
    }
    return this.prisma.incentiveAward.update({ where: { id }, data: { status: 'APPROVED' } });
  }

  async reverseAward(user: AuthUser, id: string) {
    return this.prisma.incentiveAward.updateMany({
      where: { id, tenantId: requireTenantId(user) },
      data: { status: 'REVERSED' },
    });
  }

  async ess(user: AuthUser) {
    const employee = await this.resolveEmployee(user);
    const [attendance, leave, payslips, incentives] = await Promise.all([
      this.prisma.attendance.findMany({ where: { employeeId: employee.id }, orderBy: { workDate: 'desc' }, take: 40 }),
      this.prisma.leaveRequest.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payrollLine.findMany({ where: { employeeId: employee.id, publishedAt: { not: null } }, include: { run: true } }),
      this.prisma.incentiveAward.findMany({ where: { employeeId: employee.id } }),
    ]);
    return { employee: this.maskBank(user, employee), attendance, leave, payslips, incentives };
  }

  private maskBank<T extends { bankAccount: string | null; ifsc: string | null }>(user: AuthUser, employee: T): T {
    if (user.permissions.includes('employees:edit') || user.permissions.includes('payroll:approve') || user.isPlatformAdmin) {
      return employee;
    }
    return { ...employee, bankAccount: employee.bankAccount ? '****' : null, ifsc: employee.ifsc ? '****' : null };
  }

  private async postPayrollJournal(tenantId: string, runId: string, total: ReturnType<typeof money>) {
    const salaries = await this.prisma.ledgerAccount.findFirst({ where: { tenantId, code: '6100' } });
    const payable = await this.prisma.ledgerAccount.findFirst({ where: { tenantId, code: '2200' } });
    if (!salaries || !payable) {
      throw new BadRequestException({ code: 'COA_MISSING', message: 'Salary accounts 6100/2200 are not provisioned' });
    }
    const lines = [
      { accountId: salaries.id, debit: total, credit: money(0), memo: runId },
      { accountId: payable.id, debit: money(0), credit: total, memo: runId },
    ];
    if (!isBalanced(lines)) {
      throw new BadRequestException({ code: 'UNBALANCED_JOURNAL', message: 'Payroll journal is not balanced' });
    }
    const branch = await this.numbering.defaultBranch(this.prisma, tenantId);
    const fiscal = await this.numbering.currentFiscalYear(this.prisma, tenantId);
    const number = await this.numbering.next(this.prisma, {
      tenantId,
      branchId: branch.id,
      fiscalYearId: fiscal.id,
      documentType: 'JV',
    });
    return this.prisma.voucher.create({
      data: {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        number,
        type: 'JOURNAL',
        status: 'POSTED',
        narration: `Payroll lock ${runId}`,
        postedAt: new Date(),
        lines: {
          create: lines.map((line) => ({
            tenantId,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo,
          })),
        },
      },
    });
  }

  private async transitionPayroll(user: AuthUser, id: string, status: 'APPROVED' | 'LOCKED' | 'PUBLISHED', extra: Record<string, unknown> = {}) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, tenantId: requireTenantId(user) } });
    if (!run) {
      throw new NotFoundException({ code: 'PAYROLL_NOT_FOUND', message: 'Payroll run not found' });
    }
    return this.prisma.payrollRun.update({ where: { id }, data: { status, ...extra } });
  }

  private async resolveEmployee(user: AuthUser, employeeId?: string) {
    const tenantId = requireTenantId(user);
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId }, include: { shift: true } });
      if (!employee) {
        throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' });
      }
      return employee;
    }
    const mine = await this.prisma.employee.findFirst({ where: { tenantId, userId: user.userId }, include: { shift: true } });
    if (!mine) {
      throw new ForbiddenException({ code: 'EMPLOYEE_PROFILE_MISSING', message: 'No employee profile linked to this user' });
    }
    return mine;
  }

  private day(date: Date) {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  }
}
