import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService, CreateTenantDto, UpdateTenantDto } from './tenants.service';
import { PlatformOnly } from '../../common/decorators/platform-only.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @PlatformOnly()
  @ApiOperation({ summary: 'ADM-001 — list all tenants (platform administrator)' })
  list() {
    return this.tenants.list();
  }

  @Post()
  @PlatformOnly()
  @ApiOperation({ summary: 'ADM-001 / TEN-006 — create and provision a tenant' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Get('current')
  @ApiOperation({ summary: 'Active tenant profile and operating settings' })
  current(@CurrentUser() user: AuthUser) {
    return this.tenants.get(user.tenantId!);
  }

  @Get(':id')
  @SkipTenant()
  @ApiOperation({ summary: 'Tenant detail. Platform admin or member of that tenant.' })
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (!user.isPlatformAdmin && user.tenantId !== id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tenant not found' });
    }
    return this.tenants.get(id);
  }

  @Patch(':id')
  @PlatformOnly()
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }
}
