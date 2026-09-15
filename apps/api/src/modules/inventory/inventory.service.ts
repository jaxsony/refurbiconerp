import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType, StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { money, priceLine, qty, sumLines } from '../../common/utils/money';
import { pageOf, paging, PageQuery } from '../../common/utils/paging';

export class UpsertProductDto {
  @IsString()
  sku!: string;
  @IsString()
  name!: string;
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;
  @IsOptional()
  @IsString()
  unit?: string;
  @IsOptional()
  @IsString()
  barcode?: string;
  @IsOptional()
  @IsNumber()
  taxRate?: number;
  @IsOptional()
  @IsNumber()
  unitPrice?: number;
  @IsOptional()
  @IsNumber()
  costPrice?: number;
  @IsOptional()
  @IsNumber()
  reorderLevel?: number;
  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;
  @IsOptional()
  @IsBoolean()
  trackSerial?: boolean;
  @IsOptional()
  @IsBoolean()
  trackBatch?: boolean;
}

export class StockMoveDto {
  @IsString()
  warehouseId!: string;
  @IsString()
  productId!: string;
  @IsNumber()
  @Min(0.0001)
  qty!: number;
  @IsOptional()
  @IsNumber()
  unitCost?: number;
  @IsOptional()
  @IsString()
  note?: string;
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class PoLineDto {
  @IsString()
  productId!: string;
  @IsNumber()
  qty!: number;
  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  partyId!: string;
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  warehouseId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines!: PoLineDto[];
}

export class ReceivePoDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines!: ReceiveLineDto[];
}

export class ReceiveLineDto {
  @IsString()
  lineId!: string;
  @IsNumber()
  qty!: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  async products(user: AuthUser, query: PageQuery = {}) {
    const tenantId = requireTenantId(user);
    const { skip, take, page, pageSize, q } = paging(query);
    const where = {
      tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { sku: { contains: q, mode: 'insensitive' as const } },
              { barcode: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: true, variants: true },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);
    return pageOf(items, total, page, pageSize);
  }

  async createProduct(user: AuthUser, dto: UpsertProductDto) {
    const tenantId = requireTenantId(user);
    const product = await this.prisma.product.upsert({
      where: { tenantId_sku: { tenantId, sku: dto.sku } },
      update: {
        name: dto.name,
        type: dto.type ?? 'GOODS',
        unit: dto.unit ?? 'NOS',
        barcode: dto.barcode,
        taxRate: dto.taxRate ?? 18,
        unitPrice: dto.unitPrice ?? 0,
        costPrice: dto.costPrice ?? 0,
        reorderLevel: dto.reorderLevel ?? 0,
        trackStock: dto.trackStock ?? dto.type !== 'SERVICE',
        trackSerial: dto.trackSerial ?? false,
        trackBatch: dto.trackBatch ?? false,
      },
      create: {
        tenantId,
        sku: dto.sku,
        name: dto.name,
        type: dto.type ?? 'GOODS',
        unit: dto.unit ?? 'NOS',
        barcode: dto.barcode,
        taxRate: dto.taxRate ?? 18,
        unitPrice: dto.unitPrice ?? 0,
        costPrice: dto.costPrice ?? 0,
        reorderLevel: dto.reorderLevel ?? 0,
        trackStock: dto.trackStock ?? dto.type !== 'SERVICE',
        trackSerial: dto.trackSerial ?? false,
        trackBatch: dto.trackBatch ?? false,
      },
    });
    await this.prisma.productVariant.create({
      data: { tenantId, productId: product.id, sku: dto.sku, name: 'Default', isDefault: true, barcode: dto.barcode },
    });
    return product;
  }

  warehouses(user: AuthUser) {
    return this.prisma.warehouse.findMany({
      where: { tenantId: requireTenantId(user) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createWarehouse(user: AuthUser, dto: { code: string; name: string; branchId?: string }) {
    const tenantId = requireTenantId(user);
    const branch = await this.numbering.defaultBranch(this.prisma, tenantId, dto.branchId);
    return this.prisma.warehouse.create({
      data: { tenantId, branchId: branch.id, code: dto.code, name: dto.name },
    });
  }

  stock(user: AuthUser) {
    return this.prisma.stockBalance.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { product: true, warehouse: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async consume(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      warehouseId: string;
      productId: string;
      qty: Prisma.Decimal;
      referenceType: string;
      referenceId: string;
      idempotencyKey: string;
      consumeReservation?: boolean;
    },
  ) {
    return this.applyMovement(tx, {
      ...input,
      type: 'ISSUE',
    });
  }

  async receive(user: AuthUser, dto: StockMoveDto) {
    return this.move(requireTenantId(user), { ...dto, type: 'RECEIPT', referenceType: 'ADJUSTMENT', referenceId: dto.idempotencyKey ?? `recv:${Date.now()}` });
  }

  async adjust(user: AuthUser, dto: StockMoveDto & { direction?: 'IN' | 'OUT' }) {
    const type: StockMovementType = dto.direction === 'OUT' ? 'ISSUE' : 'ADJUSTMENT';
    return this.move(requireTenantId(user), {
      ...dto,
      type,
      referenceType: 'ADJUSTMENT',
      referenceId: dto.idempotencyKey ?? `adj:${Date.now()}`,
    });
  }

  async resolvePrice(tenantId: string, partyId: string | undefined, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
    }
    if (partyId) {
      const specific = await this.prisma.partyPrice.findUnique({
        where: { tenantId_partyId_productId: { tenantId, partyId, productId } },
      });
      if (specific) {
        return { product, unitPrice: money(specific.price), taxRate: money(product.taxRate) };
      }
      const party = await this.prisma.party.findFirst({ where: { id: partyId, tenantId } });
      if (party?.priceListId) {
        const item = await this.prisma.priceListItem.findUnique({
          where: { priceListId_productId: { priceListId: party.priceListId, productId } },
        });
        if (item) {
          return { product, unitPrice: money(item.price), taxRate: money(product.taxRate) };
        }
      }
    }
    const def = await this.prisma.priceList.findFirst({ where: { tenantId, isDefault: true } });
    if (def) {
      const item = await this.prisma.priceListItem.findUnique({
        where: { priceListId_productId: { priceListId: def.id, productId } },
      });
      if (item) {
        return { product, unitPrice: money(item.price), taxRate: money(product.taxRate) };
      }
    }
    return { product, unitPrice: money(product.unitPrice), taxRate: money(product.taxRate) };
  }

  async defaultWarehouse(tenantId: string, warehouseId?: string, branchId?: string) {
    if (warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId } });
      if (!warehouse) {
        throw new NotFoundException({ code: 'WAREHOUSE_NOT_FOUND', message: 'Warehouse not found' });
      }
      return warehouse;
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    if (!warehouse) {
      throw new NotFoundException({ code: 'WAREHOUSE_NOT_FOUND', message: 'No warehouse for tenant' });
    }
    return warehouse;
  }

  async allowNegative(tenantId: string) {
    const setting = await this.prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: 'negative_stock' } },
    });
    return Boolean((setting?.value as { allowed?: boolean } | null)?.allowed);
  }

  async reserveLines(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      warehouseId: string;
      salesOrderId: string;
      lines: { id: string; productId: string; qty: Prisma.Decimal; trackStock: boolean }[];
    },
  ) {
    const allowNegative = await this.allowNegative(input.tenantId);
    for (const line of input.lines) {
      if (!line.trackStock) {
        continue;
      }
      const key = `reserve:${input.salesOrderId}:${line.id}`;
      const existing = await tx.stockReservation.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: key } },
      });
      if (existing) {
        continue;
      }
      const balance = await this.lockBalance(tx, input.tenantId, input.warehouseId, line.productId);
      const nextReserved = qty(balance.reserved).add(line.qty);
      const available = qty(balance.onHand).sub(nextReserved);
      if (!allowNegative && available.isNegative()) {
        throw new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          message: 'Insufficient stock for reservation',
          details: { productId: line.productId, available: qty(balance.onHand).sub(balance.reserved).toString() },
        });
      }
      await tx.stockBalance.update({
        where: { id: balance.id },
        data: { reserved: nextReserved },
      });
      await tx.stockReservation.create({
        data: {
          tenantId: input.tenantId,
          warehouseId: input.warehouseId,
          productId: line.productId,
          salesOrderId: input.salesOrderId,
          salesOrderLineId: line.id,
          qty: line.qty,
          idempotencyKey: key,
        },
      });
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { qtyReserved: line.qty },
      });
    }
  }

  async releaseOrder(tx: Prisma.TransactionClient, tenantId: string, salesOrderId: string) {
    const reservations = await tx.stockReservation.findMany({
      where: { tenantId, salesOrderId, status: 'ACTIVE' },
    });
    for (const reservation of reservations) {
      const balance = await this.lockBalance(tx, tenantId, reservation.warehouseId, reservation.productId);
      const next = qty(balance.reserved).sub(reservation.qty);
      await tx.stockBalance.update({
        where: { id: balance.id },
        data: { reserved: next.isNegative() ? 0 : next },
      });
      await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: 'RELEASED' } });
    }
  }

  async issueForFulfilment(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; warehouseId: string; salesOrderId: string; lineId: string; productId: string; qty: Prisma.Decimal },
  ) {
    const key = `issue:${input.salesOrderId}:${input.lineId}:${input.qty.toString()}:${Date.now()}`;
    await this.applyMovement(tx, {
      tenantId: input.tenantId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: 'ISSUE',
      qty: input.qty,
      referenceType: 'SalesOrder',
      referenceId: input.salesOrderId,
      idempotencyKey: key,
      consumeReservation: true,
    });
  }

  async returnStock(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; warehouseId: string; salesOrderId: string; productId: string; qty: Prisma.Decimal },
  ) {
    await this.applyMovement(tx, {
      tenantId: input.tenantId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: 'RETURN',
      qty: input.qty,
      referenceType: 'SalesOrder',
      referenceId: input.salesOrderId,
      idempotencyKey: `return:${input.salesOrderId}:${input.productId}:${input.qty.toString()}:${Date.now()}`,
    });
  }

  purchaseOrders(user: AuthUser) {
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { party: true, lines: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPurchaseOrder(user: AuthUser, dto: CreatePurchaseOrderDto) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const branch = await this.numbering.defaultBranch(tx, tenantId, dto.branchId);
      const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
      const warehouse = await this.defaultWarehouse(tenantId, dto.warehouseId, branch.id);
      const number = await this.numbering.next(tx, { tenantId, branchId: branch.id, fiscalYearId: fiscal.id, documentType: 'PO' });
      const priced = [];
      for (const line of dto.lines) {
        const resolved = await this.resolvePrice(tenantId, dto.partyId, line.productId);
        priced.push({
          ...priceLine({
            qty: line.qty,
            unitPrice: line.unitPrice ?? Number(resolved.unitPrice),
            taxRate: Number(resolved.taxRate),
          }),
          productId: line.productId,
          description: resolved.product.name,
        });
      }
      const totals = sumLines(priced);
      return tx.purchaseOrder.create({
        data: {
          tenantId,
          branchId: branch.id,
          fiscalYearId: fiscal.id,
          warehouseId: warehouse.id,
          partyId: dto.partyId,
          number,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          lines: {
            create: priced.map((line) => ({
              tenantId,
              productId: line.productId,
              description: line.description,
              qty: line.qty,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              lineSubtotal: line.lineSubtotal,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: { lines: true, party: true },
      });
    });
  }

  async approvePurchaseOrder(user: AuthUser, id: string) {
    const po = await this.requirePo(user, id);
    if (po.status !== 'DRAFT') {
      throw new BadRequestException({ code: 'PO_NOT_DRAFT', message: 'Only draft purchase orders can be approved' });
    }
    return this.prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'APPROVED' } });
  }

  async receivePurchaseOrder(user: AuthUser, id: string, dto: ReceivePoDto) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: { lines: { include: { product: true } } },
      });
      if (!po || (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED')) {
        throw new BadRequestException({ code: 'PO_NOT_RECEIVABLE', message: 'Purchase order cannot be received' });
      }
      for (const incoming of dto.lines) {
        const line = po.lines.find((item) => item.id === incoming.lineId);
        if (!line) {
          throw new NotFoundException({ code: 'PO_LINE_NOT_FOUND', message: 'PO line not found' });
        }
        const remaining = qty(line.qty).sub(line.qtyReceived);
        const receiveQty = qty(incoming.qty);
        if (receiveQty.gt(remaining)) {
          throw new BadRequestException({ code: 'OVER_RECEIVE', message: 'Cannot receive more than ordered' });
        }
        await this.applyMovement(tx, {
          tenantId,
          warehouseId: po.warehouseId,
          productId: line.productId,
          type: 'RECEIPT',
          qty: receiveQty,
          unitCost: money(line.unitPrice),
          referenceType: 'PurchaseOrder',
          referenceId: po.id,
          idempotencyKey: `po:${po.id}:${line.id}:${line.qtyReceived.toString()}:${receiveQty.toString()}`,
        });
        if (line.product.trackSerial || line.product.trackBatch) {
          await tx.serialLot.create({
            data: {
              tenantId,
              warehouseId: po.warehouseId,
              productId: line.productId,
              batchNo: line.product.trackBatch ? `B-${po.number}` : undefined,
              qty: receiveQty,
            },
          });
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { qtyReceived: qty(line.qtyReceived).add(receiveQty) },
        });
      }
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
      const allReceived = refreshed.every((line) => qty(line.qtyReceived).gte(line.qty));
      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
        include: { lines: true },
      });
    });
  }

  async reports(user: AuthUser, kind: string) {
    const tenantId = requireTenantId(user);
    const balances = await this.prisma.stockBalance.findMany({
      where: { tenantId },
      include: { product: true, warehouse: true },
    });
    if (kind === 'reorder') {
      return balances
        .filter((row) => qty(row.onHand).sub(row.reserved).lte(row.product.reorderLevel))
        .map((row) => ({
          product: row.product.name,
          sku: row.product.sku,
          warehouse: row.warehouse.code,
          available: qty(row.onHand).sub(row.reserved),
          reorderLevel: row.product.reorderLevel,
        }));
    }
    if (kind === 'valuation') {
      return balances.map((row) => ({
        product: row.product.name,
        sku: row.product.sku,
        warehouse: row.warehouse.code,
        onHand: row.onHand,
        unitCost: row.product.costPrice,
        value: qty(row.onHand).mul(row.product.costPrice).toDecimalPlaces(2),
      }));
    }
    if (kind === 'ageing' || kind === 'slow-moving') {
      const movements = await this.prisma.stockMovement.groupBy({
        by: ['productId'],
        where: { tenantId, createdAt: { gte: new Date(Date.now() - 90 * 86400_000) } },
        _sum: { qty: true },
      });
      const moved = new Set(movements.map((item) => item.productId));
      return balances
        .filter((row) => !moved.has(row.productId) && qty(row.onHand).gt(0))
        .map((row) => ({ product: row.product.name, sku: row.product.sku, onHand: row.onHand, warehouse: row.warehouse.code }));
    }
    throw new BadRequestException({ code: 'UNKNOWN_REPORT', message: 'Unknown inventory report' });
  }

  private async requirePo(user: AuthUser, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: requireTenantId(user) },
      include: { lines: true },
    });
    if (!po) {
      throw new NotFoundException({ code: 'PO_NOT_FOUND', message: 'Purchase order not found' });
    }
    return po;
  }

  private async move(
    tenantId: string,
    input: StockMoveDto & { type: StockMovementType; referenceType: string; referenceId: string },
  ) {
    return this.prisma.$transaction((tx) =>
      this.applyMovement(tx, {
        tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        type: input.type,
        qty: qty(input.qty),
        unitCost: input.unitCost !== undefined ? money(input.unitCost) : undefined,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey ?? `${input.type}:${input.warehouseId}:${input.productId}:${Date.now()}`,
        note: input.note,
      }),
    );
  }

  private async applyMovement(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      warehouseId: string;
      productId: string;
      type: StockMovementType;
      qty: Prisma.Decimal;
      unitCost?: Prisma.Decimal;
      referenceType: string;
      referenceId: string;
      idempotencyKey: string;
      note?: string;
      consumeReservation?: boolean;
    },
  ) {
    const dup = await tx.stockMovement.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (dup) {
      return dup;
    }
    const allowNegative = await this.allowNegative(input.tenantId);
    const balance = await this.lockBalance(tx, input.tenantId, input.warehouseId, input.productId);
    let onHand = qty(balance.onHand);
    let reserved = qty(balance.reserved);
    if (input.type === 'RECEIPT' || input.type === 'TRANSFER_IN' || input.type === 'RETURN' || input.type === 'ADJUSTMENT') {
      if (input.type === 'ADJUSTMENT') {
        onHand = onHand.add(input.qty);
      } else {
        onHand = onHand.add(input.qty);
      }
    } else {
      onHand = onHand.sub(input.qty);
      if (input.consumeReservation) {
        reserved = reserved.sub(input.qty);
        if (reserved.isNegative()) {
          reserved = qty(0);
        }
      }
    }
    if (!allowNegative && onHand.isNegative()) {
      throw new ConflictException({ code: 'NEGATIVE_STOCK', message: 'Negative stock is not allowed for this tenant' });
    }
    await tx.stockBalance.update({ where: { id: balance.id }, data: { onHand, reserved } });
    return tx.stockMovement.create({
      data: {
        tenantId: input.tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        type: input.type,
        qty: input.qty,
        unitCost: input.unitCost,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey,
        note: input.note,
      },
    });
  }

  private async lockBalance(tx: Prisma.TransactionClient, tenantId: string, warehouseId: string, productId: string) {
    let row = await tx.stockBalance.findUnique({
      where: { tenantId_warehouseId_productId: { tenantId, warehouseId, productId } },
    });
    if (!row) {
      row = await tx.stockBalance.create({ data: { tenantId, warehouseId, productId } });
    }
    return tx.stockBalance.update({
      where: { id: row.id },
      data: { updatedAt: new Date() },
    });
  }
}
