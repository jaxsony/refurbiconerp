import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateImportDto,
  DeviceDto,
  ExportDto,
  OfflineDto,
  TransitionService,
} from './transition.service';

@ApiTags('transition')
@ApiBearerAuth()
@Controller()
export class TransitionController {
  constructor(private readonly transition: TransitionService) {}

  @Get('reports')
  @RequirePermissions('reports:view')
  reports(@CurrentUser() user: AuthUser) {
    return this.transition.reports(user);
  }

  @Post('reports/:key')
  @RequirePermissions('reports:view')
  @ApiOperation({ summary: 'RPT-001 — operational reports' })
  runReport(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.transition.runReport(user, key);
  }

  @Get('imports')
  @RequirePermissions('imports:view')
  @ApiOperation({ summary: 'MIG-001 — import batches' })
  imports(@CurrentUser() user: AuthUser) {
    return this.transition.imports(user);
  }

  @Post('imports')
  @RequirePermissions('imports:create')
  createImport(@CurrentUser() user: AuthUser, @Body() dto: CreateImportDto) {
    return this.transition.createImport(user, dto);
  }

  @Post('imports/:id/commit')
  @RequirePermissions('imports:create')
  commit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transition.commitImport(user, id);
  }

  @Post('imports/:id/rollback')
  @RequirePermissions('imports:administer')
  rollback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transition.rollbackImport(user, id);
  }

  @Get('exports')
  @RequirePermissions('reports:export')
  exports(@CurrentUser() user: AuthUser) {
    return this.transition.exports(user);
  }

  @Post('exports')
  @RequirePermissions('reports:export')
  createExport(@CurrentUser() user: AuthUser, @Body() dto: ExportDto) {
    return this.transition.createExport(user, dto);
  }

  @Get('go-live/readiness')
  @RequirePermissions('settings:view')
  @ApiOperation({ summary: 'GOL-001 — go-live readiness checklist' })
  readiness(@CurrentUser() user: AuthUser) {
    return this.transition.readiness(user);
  }

  @Get('field/devices')
  @ApiOperation({ summary: 'MOB-001 — registered field devices' })
  devices(@CurrentUser() user: AuthUser) {
    return this.transition.devices(user);
  }

  @Post('field/devices')
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: DeviceDto) {
    return this.transition.registerDevice(user, dto);
  }

  @Get('field/sync')
  @ApiOperation({ summary: 'MOB-003 — field sync snapshot' })
  sync(@CurrentUser() user: AuthUser) {
    return this.transition.sync(user);
  }

  @Post('field/offline')
  @ApiOperation({ summary: 'MOB-004 — offline action with idempotency key' })
  offline(@CurrentUser() user: AuthUser, @Body() dto: OfflineDto) {
    return this.transition.offline(user, dto);
  }
}
