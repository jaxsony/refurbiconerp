import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateQuotationDto,
  CreateSalesOrderDto,
  QtyLinesDto,
  SalesService,
  SalesTargetDto,
} from './sales.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('sales')
@ApiBearerAuth()
@Controller()
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('quotations')
  @RequirePermissions('quotations:view')
  @ApiOperation({ summary: 'SAL-004 — quotations, revisions, approvals and expiries' })
  quotations(@CurrentUser() user: AuthUser) {
    return this.sales.quotations(user);
  }

  @Get('quotations/:id')
  @RequirePermissions('quotations:view')
  getQuote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.getQuotation(user, id);
  }

  @Post('quotations')
  @RequirePermissions('quotations:create')
  createQuote(@CurrentUser() user: AuthUser, @Body() dto: CreateQuotationDto) {
    return this.sales.createQuotation(user, dto);
  }

  @Post('quotations/:id/approve')
  @RequirePermissions('quotations:approve')
  approveQuote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.approveQuotation(user, id);
  }

  @Post('quotations/:id/revise')
  @RequirePermissions('quotations:create')
  revise(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateQuotationDto) {
    return this.sales.reviseQuotation(user, id, dto);
  }

  @Post('quotations/:id/convert')
  @RequirePermissions('sales-orders:create')
  @ApiOperation({ summary: 'SAL-005 — convert approved quotation to sales order without re-entry' })
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.convertQuotation(user, id);
  }

  @Get('sales-orders')
  @RequirePermissions('sales-orders:view')
  orders(@CurrentUser() user: AuthUser) {
    return this.sales.salesOrders(user);
  }

  @Get('sales-orders/:id')
  @RequirePermissions('sales-orders:view')
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.getOrder(user, id);
  }

  @Post('sales-orders')
  @RequirePermissions('sales-orders:create')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesOrderDto) {
    return this.sales.createSalesOrder(user, dto);
  }

  @Post('sales-orders/:id/approve')
  @RequirePermissions('sales-orders:approve')
  @ApiOperation({ summary: 'SAL-007 — approve and reserve inventory at the configured stage' })
  approveOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.approveOrder(user, id);
  }

  @Post('sales-orders/:id/reserve')
  @RequirePermissions('sales-orders:approve')
  reserve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.reserveOrder(user, id);
  }

  @Post('sales-orders/:id/fulfil')
  @RequirePermissions('sales-orders:edit')
  @ApiOperation({ summary: 'SAL-008 — partial fulfilment' })
  fulfil(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QtyLinesDto) {
    return this.sales.fulfil(user, id, dto);
  }

  @Post('sales-orders/:id/cancel')
  @RequirePermissions('sales-orders:cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.cancelOrder(user, id);
  }

  @Post('sales-orders/:id/returns')
  @RequirePermissions('sales-orders:edit')
  returns(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QtyLinesDto) {
    return this.sales.returnOrder(user, id, dto);
  }

  @Get('sales/performance')
  @RequirePermissions('reports:view')
  @ApiOperation({ summary: 'SAL-009 — targets, collections, margin' })
  performance(@CurrentUser() user: AuthUser) {
    return this.sales.performance(user);
  }

  @Post('sales-targets')
  @RequirePermissions('quotations:approve')
  createTarget(@CurrentUser() user: AuthUser, @Body() dto: SalesTargetDto) {
    return this.sales.createTarget(user, dto);
  }
}
