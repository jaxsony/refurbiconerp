import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CalculateIncentiveDto,
  ClockDto,
  CodeNameDto,
  EmployeeDto,
  HolidayDto,
  LeaveDecisionDto,
  LeavePolicyDto,
  LeaveRequestDto,
  PayrollDto,
  PeopleService,
  SalaryStructureDto,
  SchemeDto,
  ShiftDto,
} from './people.service';

@ApiTags('people')
@ApiBearerAuth()
@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('employees')
  @RequirePermissions('employees:view')
  @ApiOperation({ summary: 'HR-001 — employee master' })
  employees(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.people.employees(user, { page, pageSize, q });
  }

  @Post('employees')
  @RequirePermissions('employees:create')
  createEmployee(@CurrentUser() user: AuthUser, @Body() dto: EmployeeDto) {
    return this.people.createEmployee(user, dto);
  }

  @Get('designations')
  @RequirePermissions('employees:view')
  designations(@CurrentUser() user: AuthUser) {
    return this.people.designations(user);
  }

  @Post('designations')
  @RequirePermissions('employees:create')
  createDesignation(@CurrentUser() user: AuthUser, @Body() dto: CodeNameDto) {
    return this.people.createDesignation(user, dto);
  }

  @Get('shifts')
  @RequirePermissions('attendance:view')
  @ApiOperation({ summary: 'HR-003 — shifts' })
  shifts(@CurrentUser() user: AuthUser) {
    return this.people.shifts(user);
  }

  @Post('shifts')
  @RequirePermissions('employees:create')
  createShift(@CurrentUser() user: AuthUser, @Body() dto: ShiftDto) {
    return this.people.createShift(user, dto);
  }

  @Get('holidays')
  @RequirePermissions('attendance:view')
  holidays(@CurrentUser() user: AuthUser) {
    return this.people.holidays(user);
  }

  @Post('holidays')
  @RequirePermissions('employees:edit')
  createHoliday(@CurrentUser() user: AuthUser, @Body() dto: HolidayDto) {
    return this.people.createHoliday(user, dto);
  }

  @Get('attendance')
  @RequirePermissions('attendance:view')
  @ApiOperation({ summary: 'HR-003 — attendance register' })
  attendance(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId?: string) {
    return this.people.attendance(user, employeeId);
  }

  @Post('attendance/clock-in')
  @RequirePermissions('attendance:create')
  clockIn(@CurrentUser() user: AuthUser, @Body() dto: ClockDto) {
    return this.people.clockIn(user, dto);
  }

  @Post('attendance/clock-out')
  @RequirePermissions('attendance:create')
  clockOut(@CurrentUser() user: AuthUser, @Body() dto: ClockDto) {
    return this.people.clockOut(user, dto);
  }

  @Post('field/clock-in')
  @RequirePermissions('attendance:create')
  @ApiOperation({ summary: 'MOB-002 — field clock-in' })
  fieldClockIn(@CurrentUser() user: AuthUser, @Body() dto: ClockDto) {
    return this.people.clockIn(user, { ...dto, source: dto.source ?? 'MOBILE' });
  }

  @Post('field/clock-out')
  @RequirePermissions('attendance:create')
  fieldClockOut(@CurrentUser() user: AuthUser, @Body() dto: ClockDto) {
    return this.people.clockOut(user, { ...dto, source: dto.source ?? 'MOBILE' });
  }

  @Get('leave-policies')
  @RequirePermissions('leave:view')
  @ApiOperation({ summary: 'HR-004 — leave policies' })
  leavePolicies(@CurrentUser() user: AuthUser) {
    return this.people.leavePolicies(user);
  }

  @Post('leave-policies')
  @RequirePermissions('employees:edit')
  createLeavePolicy(@CurrentUser() user: AuthUser, @Body() dto: LeavePolicyDto) {
    return this.people.createLeavePolicy(user, dto);
  }

  @Get('leave-requests')
  @RequirePermissions('leave:view')
  leaveRequests(@CurrentUser() user: AuthUser) {
    return this.people.leaveRequests(user);
  }

  @Post('leave-requests')
  @RequirePermissions('leave:create')
  requestLeave(@CurrentUser() user: AuthUser, @Body() dto: LeaveRequestDto) {
    return this.people.requestLeave(user, dto);
  }

  @Post('leave-requests/:id/decide')
  @RequirePermissions('leave:approve')
  decideLeave(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LeaveDecisionDto) {
    return this.people.decideLeave(user, id, dto.status);
  }

  @Get('salary-structures')
  @RequirePermissions('payroll:view')
  @ApiOperation({ summary: 'HR-005 — salary structures' })
  salaryStructures(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId?: string) {
    return this.people.salaryStructures(user, employeeId);
  }

  @Post('salary-structures')
  @RequirePermissions('payroll:create')
  createSalaryStructure(@CurrentUser() user: AuthUser, @Body() dto: SalaryStructureDto) {
    return this.people.createSalaryStructure(user, dto);
  }

  @Get('payroll-runs')
  @RequirePermissions('payroll:view')
  @ApiOperation({ summary: 'HR-007 — payroll preview, approve, lock, publish' })
  payrollRuns(@CurrentUser() user: AuthUser) {
    return this.people.payrollRuns(user);
  }

  @Post('payroll-runs/preview')
  @RequirePermissions('payroll:create')
  previewPayroll(@CurrentUser() user: AuthUser, @Body() dto: PayrollDto) {
    return this.people.previewPayroll(user, dto);
  }

  @Post('payroll-runs/:id/approve')
  @RequirePermissions('payroll:approve')
  approvePayroll(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.people.approvePayroll(user, id);
  }

  @Post('payroll-runs/:id/lock')
  @RequirePermissions('payroll:approve')
  lockPayroll(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.people.lockPayroll(user, id);
  }

  @Post('payroll-runs/:id/publish')
  @RequirePermissions('payroll:approve')
  publishPayroll(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.people.publishPayroll(user, id);
  }

  @Get('incentive-schemes')
  @RequirePermissions('incentives:view')
  @ApiOperation({ summary: 'INC-001 — incentive schemes' })
  schemes(@CurrentUser() user: AuthUser) {
    return this.people.schemes(user);
  }

  @Post('incentive-schemes')
  @RequirePermissions('incentives:create')
  createScheme(@CurrentUser() user: AuthUser, @Body() dto: SchemeDto) {
    return this.people.createScheme(user, dto);
  }

  @Get('incentive-awards')
  @RequirePermissions('incentives:view')
  awards(@CurrentUser() user: AuthUser) {
    return this.people.awards(user);
  }

  @Post('incentive-awards/calculate')
  @RequirePermissions('incentives:create')
  @ApiOperation({ summary: 'INC-002 — calculate incentives with hold-until-paid' })
  calculate(@CurrentUser() user: AuthUser, @Body() dto: CalculateIncentiveDto) {
    return this.people.calculateIncentives(user, dto);
  }

  @Post('incentive-awards/:id/approve')
  @RequirePermissions('incentives:approve')
  approveAward(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.people.approveAward(user, id);
  }

  @Post('incentive-awards/:id/reverse')
  @RequirePermissions('incentives:approve')
  reverseAward(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.people.reverseAward(user, id);
  }

  @Get('ess/me')
  @ApiOperation({ summary: 'HR-010 — employee self-service' })
  ess(@CurrentUser() user: AuthUser) {
    return this.people.ess(user);
  }
}
