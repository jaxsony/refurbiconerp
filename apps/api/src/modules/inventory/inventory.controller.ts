import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import {
  CreatePurchaseOrderDto,
  InventoryService,
  ReceivePoDto,
  StockMoveDto,
  UpsertProductDto,
} from './inventory.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

class WarehouseDto {
  @IsString()
  code!: string;
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  branchId?: string;
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('products')
  @RequirePermissions('products:view')
  @ApiOperation({ summary: 'INV-001 — items, services, SKU, tax and prices' })
  products(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.inventory.products(user, { page, pageSize, q });
  }

  @Post('products')
  @RequirePermissions('products:create')
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: UpsertProductDto) {
    return this.inventory.createProduct(user, dto);
  }

  @Get('warehouses')
  @RequirePermissions('inventory:view')
  @ApiOperation({ summary: 'INV-002 — stock locations by branch' })
  warehouses(@CurrentUser() user: AuthUser) {
    return this.inventory.warehouses(user);
  }

  @Post('warehouses')
  @RequirePermissions('inventory:edit')
  createWarehouse(@CurrentUser() user: AuthUser, @Body() dto: WarehouseDto) {
    return this.inventory.createWarehouse(user, dto);
  }

  @Get('stock')
  @RequirePermissions('inventory:view')
  stock(@CurrentUser() user: AuthUser) {
    return this.inventory.stock(user);
  }

  @Post('stock/receipts')
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'INV-003 — stock receipt' })
  receive(@CurrentUser() user: AuthUser, @Body() dto: StockMoveDto) {
    return this.inventory.receive(user, dto);
  }

  @Post('stock/adjustments')
  @RequirePermissions('inventory:edit')
  adjust(@CurrentUser() user: AuthUser, @Body() dto: StockMoveDto) {
    return this.inventory.adjust(user, dto);
  }

  @Get('purchase-orders')
  @RequirePermissions('purchase-orders:view')
  @ApiOperation({ summary: 'INV-006 — purchase orders and goods receipts' })
  pos(@CurrentUser() user: AuthUser) {
    return this.inventory.purchaseOrders(user);
  }

  @Post('purchase-orders')
  @RequirePermissions('purchase-orders:create')
  createPo(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.inventory.createPurchaseOrder(user, dto);
  }

  @Post('purchase-orders/:id/approve')
  @RequirePermissions('purchase-orders:approve')
  approvePo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.approvePurchaseOrder(user, id);
  }

  @Post('purchase-orders/:id/receive')
  @RequirePermissions('inventory:create')
  receivePo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReceivePoDto) {
    return this.inventory.receivePurchaseOrder(user, id, dto);
  }

  @Get('inventory/reports/:kind')
  @RequirePermissions('inventory:view')
  @ApiOperation({ summary: 'INV-008 — reorder, ageing, slow-moving and valuation' })
  reports(@CurrentUser() user: AuthUser, @Param('kind') kind: string) {
    return this.inventory.reports(user, kind);
  }
}
