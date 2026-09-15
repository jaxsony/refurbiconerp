import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartyType } from '@prisma/client';
import {
  ActivityDto,
  ContactDto,
  ConvertLeadDto,
  CrmService,
  UpsertLeadDto,
  UpsertOpportunityDto,
  UpsertPartyDto,
} from './crm.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('crm')
@ApiBearerAuth()
@Controller()
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('customers')
  @RequirePermissions('customers:view')
  @ApiOperation({ summary: 'SAL-001 / SAL-003 — customers with duplicate-aware matching' })
  customers(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.crm.parties(user, 'CUSTOMER', { page, pageSize, q });
  }

  @Get('vendors')
  @RequirePermissions('customers:view')
  vendors(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.crm.parties(user, 'VENDOR', { page, pageSize, q });
  }

  @Post('vendors')
  @RequirePermissions('customers:create')
  createVendor(@CurrentUser() user: AuthUser, @Body() dto: UpsertPartyDto) {
    return this.crm.createParty(user, { ...dto, type: 'VENDOR' });
  }

  @Get('parties/:id')
  @RequirePermissions('customers:view')
  getParty(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.getParty(user, id);
  }

  @Get('parties/:id/timeline')
  @RequirePermissions('customers:view')
  @ApiOperation({ summary: 'SAL-010 — customer timeline of calls, tasks, documents, orders and invoices' })
  timeline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.timeline(user, id);
  }

  @Post('customers')
  @RequirePermissions('customers:create')
  createCustomer(@CurrentUser() user: AuthUser, @Body() dto: UpsertPartyDto) {
    return this.crm.createParty(user, { ...dto, type: dto.type ?? 'CUSTOMER' });
  }

  @Patch('customers/:id')
  @RequirePermissions('customers:edit')
  updateCustomer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertPartyDto) {
    return this.crm.updateParty(user, id, dto);
  }

  @Post('customers/:id/contacts')
  @RequirePermissions('customers:edit')
  contact(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ContactDto) {
    return this.crm.addContact(user, id, dto);
  }

  @Get('duplicates')
  @RequirePermissions('customers:view')
  @ApiOperation({ summary: 'SAL-003 — probable duplicates by phone, email or tax id' })
  duplicates(
    @CurrentUser() user: AuthUser,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('taxId') taxId?: string,
  ) {
    return this.crm.duplicates(user.tenantId!, { email, phone, taxId });
  }

  @Get('leads')
  @RequirePermissions('leads:view')
  @ApiOperation({ summary: 'SAL-001 / SAL-002 — lead pipeline' })
  leads(@CurrentUser() user: AuthUser) {
    return this.crm.leads(user);
  }

  @Post('leads')
  @RequirePermissions('leads:create')
  createLead(@CurrentUser() user: AuthUser, @Body() dto: UpsertLeadDto) {
    return this.crm.createLead(user, dto);
  }

  @Patch('leads/:id')
  @RequirePermissions('leads:edit')
  updateLead(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertLeadDto) {
    return this.crm.updateLead(user, id, dto);
  }

  @Post('leads/:id/convert')
  @RequirePermissions('leads:edit')
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.crm.convertLead(user, id, dto);
  }

  @Get('opportunities')
  @RequirePermissions('opportunities:view')
  opportunities(@CurrentUser() user: AuthUser) {
    return this.crm.opportunities(user);
  }

  @Post('opportunities')
  @RequirePermissions('opportunities:create')
  createOpp(@CurrentUser() user: AuthUser, @Body() dto: UpsertOpportunityDto) {
    return this.crm.createOpportunity(user, dto);
  }

  @Patch('opportunities/:id')
  @RequirePermissions('opportunities:edit')
  updateOpp(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertOpportunityDto) {
    return this.crm.updateOpportunity(user, id, dto);
  }

  @Post('activities')
  @RequirePermissions('customers:edit')
  activity(@CurrentUser() user: AuthUser, @Body() dto: ActivityDto) {
    return this.crm.addActivity(user, dto);
  }
}
