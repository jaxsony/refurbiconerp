import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApprovalPolicyDto, CustomFieldDto, OrganizationService, UpdateMemberDto, UpdateSettingDto } from './organization.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateBranchDto,
  CreateDepartmentDto,
  CreateFiscalYearDto,
  InviteUserDto,
  UpsertSequenceDto,
} from '../tenants/tenants.service';

@ApiTags('organization')
@ApiBearerAuth()
@Controller()
export class OrganizationController {
  constructor(private readonly org: OrganizationService) {}

  @Get('branches')
  @RequirePermissions('branches:view')
  @ApiOperation({ summary: 'ADM-001 — list branches for the active tenant' })
  branches(@CurrentUser() user: AuthUser) {
    return this.org.branches(user);
  }

  @Post('branches')
  @RequirePermissions('branches:create')
  createBranch(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    return this.org.createBranch(user, dto);
  }

  @Get('departments')
  @RequirePermissions('departments:view')
  departments(@CurrentUser() user: AuthUser) {
    return this.org.departments(user);
  }

  @Post('departments')
  @RequirePermissions('departments:create')
  createDepartment(@CurrentUser() user: AuthUser, @Body() dto: CreateDepartmentDto) {
    return this.org.createDepartment(user, dto);
  }

  @Get('users')
  @RequirePermissions('users:view')
  @ApiOperation({ summary: 'ADM-002 — tenant memberships' })
  users(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.org.members(user, { page, pageSize, q });
  }

  @Get('users/:id')
  @RequirePermissions('users:view')
  getUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.org.getMember(user, id);
  }

  @Patch('users/:id')
  @RequirePermissions('users:edit')
  updateUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.org.updateMember(user, id, dto);
  }

  @Post('users/invites')
  @RequirePermissions('users:create')
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.org.invite(user, dto);
  }

  @Get('roles')
  @RequirePermissions('roles:view')
  roles(@CurrentUser() user: AuthUser) {
    return this.org.roles(user);
  }

  @Get('permissions')
  @RequirePermissions('roles:view')
  permissions() {
    return this.org.permissions();
  }

  @Get('settings')
  @RequirePermissions('settings:view')
  @ApiOperation({ summary: 'TEN-006 — tenant operating settings' })
  settings(@CurrentUser() user: AuthUser) {
    return this.org.settings(user);
  }

  @Post('settings')
  @RequirePermissions('settings:edit')
  upsertSetting(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingDto) {
    return this.org.upsertSetting(user, dto);
  }

  @Get('fiscal-years')
  @RequirePermissions('fiscal-years:view')
  fiscalYears(@CurrentUser() user: AuthUser) {
    return this.org.fiscalYears(user);
  }

  @Post('fiscal-years')
  @RequirePermissions('fiscal-years:create')
  createFiscalYear(@CurrentUser() user: AuthUser, @Body() dto: CreateFiscalYearDto) {
    return this.org.createFiscalYear(user, dto);
  }

  @Get('sequences')
  @RequirePermissions('sequences:view')
  @ApiOperation({ summary: 'ADM-003 — document sequences per branch and year' })
  sequences(@CurrentUser() user: AuthUser) {
    return this.org.sequences(user);
  }

  @Post('sequences')
  @RequirePermissions('sequences:edit')
  upsertSequence(@CurrentUser() user: AuthUser, @Body() dto: UpsertSequenceDto) {
    return this.org.upsertSequence(user, dto);
  }

  @Get('custom-fields')
  @RequirePermissions('settings:view')
  @ApiOperation({ summary: 'ADM-004 — custom fields' })
  customFields(@CurrentUser() user: AuthUser) {
    return this.org.customFields(user);
  }

  @Post('custom-fields')
  @RequirePermissions('settings:edit')
  createCustomField(@CurrentUser() user: AuthUser, @Body() dto: CustomFieldDto) {
    return this.org.createCustomField(user, dto);
  }

  @Get('approval-policies')
  @RequirePermissions('approvals:view')
  approvalPolicies(@CurrentUser() user: AuthUser) {
    return this.org.approvalPolicies(user);
  }

  @Post('approval-policies')
  @RequirePermissions('approvals:administer')
  createApprovalPolicy(@CurrentUser() user: AuthUser, @Body() dto: ApprovalPolicyDto) {
    return this.org.createApprovalPolicy(user, dto);
  }

  @Get('audit-events')
  @RequirePermissions('audit:view')
  @ApiOperation({ summary: 'ADM-005 — immutable audit history' })
  audit(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.org.audit(user, take ? Number(take) : 50);
  }
}
