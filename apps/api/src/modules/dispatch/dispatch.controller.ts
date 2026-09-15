import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreatePickListDto,
  CreateShipmentDto,
  DispatchService,
  PickQtyDto,
  ProofDto,
  TrackingDto,
} from './dispatch.service';

@ApiTags('dispatch')
@ApiBearerAuth()
@Controller()
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('pick-lists')
  @RequirePermissions('dispatch:view')
  @ApiOperation({ summary: 'DSP-001 — pick lists' })
  pickLists(@CurrentUser() user: AuthUser) {
    return this.dispatch.pickLists(user);
  }

  @Post('pick-lists')
  @RequirePermissions('dispatch:create')
  createPick(@CurrentUser() user: AuthUser, @Body() dto: CreatePickListDto) {
    return this.dispatch.createPickList(user, dto);
  }

  @Post('pick-lists/:id/pick')
  @RequirePermissions('dispatch:edit')
  pick(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PickQtyDto) {
    return this.dispatch.pick(user, id, dto);
  }

  @Get('shipments')
  @RequirePermissions('dispatch:view')
  @ApiOperation({ summary: 'DSP-003 — shipments, AWB and tracking' })
  shipments(@CurrentUser() user: AuthUser) {
    return this.dispatch.shipments(user);
  }

  @Post('shipments')
  @RequirePermissions('dispatch:create')
  createShipment(@CurrentUser() user: AuthUser, @Body() dto: CreateShipmentDto) {
    return this.dispatch.createShipment(user, dto);
  }

  @Post('shipments/:id/pack')
  @RequirePermissions('dispatch:edit')
  pack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.pack(user, id);
  }

  @Post('shipments/:id/ship')
  @RequirePermissions('dispatch:edit')
  ship(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TrackingDto) {
    return this.dispatch.ship(user, id, dto);
  }

  @Post('shipments/:id/track')
  @RequirePermissions('dispatch:edit')
  track(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TrackingDto) {
    return this.dispatch.track(user, id, dto);
  }

  @Post('shipments/:id/proof')
  @RequirePermissions('dispatch:edit')
  @ApiOperation({ summary: 'DSP-006 — proof of delivery' })
  proof(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProofDto) {
    return this.dispatch.proof(user, id, dto);
  }

  @Post('shipments/:id/deliver')
  @RequirePermissions('dispatch:edit')
  deliver(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.deliver(user, id);
  }
}
