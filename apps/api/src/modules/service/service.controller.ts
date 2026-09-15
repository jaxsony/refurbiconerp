import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  AllotDto,
  CompleteStepDto,
  CreateTicketDto,
  DiagnosisDto,
  EstimateDto,
  QualityDto,
  ServiceCentreService,
  TicketPartDto,
} from './service.service';

@ApiTags('service')
@ApiBearerAuth()
@Controller()
export class ServiceController {
  constructor(private readonly service: ServiceCentreService) {}

  @Get('service-tickets')
  @RequirePermissions('service-tickets:view')
  @ApiOperation({ summary: 'RMA-001 — service tickets and RMA' })
  tickets(@CurrentUser() user: AuthUser, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.service.tickets(user, { page, pageSize, q });
  }

  @Get('service-tickets/:id')
  @RequirePermissions('service-tickets:view')
  getTicket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getTicket(user, id);
  }

  @Post('service-tickets')
  @RequirePermissions('service-tickets:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.service.createTicket(user, dto);
  }

  @Post('service-tickets/:id/allot')
  @RequirePermissions('service-tickets:edit')
  @ApiOperation({ summary: 'RMA-001 — allot a company employee to the current ticket step' })
  allot(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AllotDto) {
    return this.service.allot(user, id, dto);
  }

  @Post('service-tickets/:id/complete')
  @RequirePermissions('service-tickets:edit')
  @ApiOperation({ summary: 'RMA-001 — mark the current step done and move to the next process' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteStepDto) {
    return this.service.completeStep(user, id, dto);
  }

  @Post('service-tickets/:id/diagnose')
  @RequirePermissions('service-tickets:edit')
  @ApiOperation({ summary: 'RMA-003 — inspection and diagnosis' })
  diagnose(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DiagnosisDto) {
    return this.service.diagnose(user, id, dto);
  }

  @Post('service-tickets/:id/estimate')
  @RequirePermissions('service-tickets:edit')
  estimate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EstimateDto) {
    return this.service.estimate(user, id, dto);
  }

  @Post('service-tickets/:id/authorize')
  @RequirePermissions('service-tickets:approve')
  @ApiOperation({ summary: 'RMA-004 — customer authorization' })
  authorize(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.authorize(user, id);
  }

  @Post('service-tickets/:id/parts')
  @RequirePermissions('service-tickets:edit')
  addPart(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TicketPartDto) {
    return this.service.addPart(user, id, dto);
  }

  @Post('service-tickets/:id/consume-parts')
  @RequirePermissions('service-tickets:edit')
  @ApiOperation({ summary: 'RMA-005 — consume spare parts' })
  consume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.consumeParts(user, id);
  }

  @Post('service-tickets/:id/qc')
  @RequirePermissions('service-tickets:approve')
  @ApiOperation({ summary: 'RMA-006 — quality check' })
  qc(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QualityDto) {
    return this.service.quality(user, id, dto);
  }

  @Post('service-tickets/:id/ready')
  @RequirePermissions('service-tickets:edit')
  ready(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.ready(user, id);
  }
}
