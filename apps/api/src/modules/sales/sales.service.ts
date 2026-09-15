import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { money, priceLine, qty, sumLines } from '../../common/utils/money';
import { InventoryService } from '../inventory/inventory.service';
import { CrmService } from '../crm/crm.service';

export class DocumentLineDto {
  @IsString()
  productId!: string;
  @IsNumber()
  @Min(0.0001)
  qty!: number;
  @IsOptional()
  @IsNumber()
  unitPrice?: number;
  @IsOptional()
  @IsNumber()
  discountPct?: number;
}

export class CreateQuotationDto {
  @IsString()
  partyId!: string;
  @IsOptional()
  @IsString()
  opportunityId?: string;
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsDateString()
  validUntil?: string;
  @IsOptional()
  @IsString()
  notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentLineDto)
  lines!: DocumentLineDto[];
}

export class CreateSalesOrderDto extends CreateQuotationDto {}

export class QtyLineDto {
  @IsString()
  lineId!: string;
  @IsNumber()
  qty!: number;
}

export class QtyLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QtyLineDto)
  lines!: QtyLineDto[];
}

export class SalesTargetDto {
  @IsOptional()
  @IsString()
  userId?: string;
  @IsOptional()
  @IsString()
  departmentId?: string;
  @IsDateString()
  periodStart!: string;
  @IsDateString()
  periodEnd!: string;
  @IsNumber()
  amount!: number;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
    private readonly crm: CrmService,
  ) {}

  quotations(user: AuthUser) {
    return this.prisma.quotation.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { party: true, lines: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  salesOrders(user: AuthUser) {
    return this.prisma.salesOrder.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { party: true, lines: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQuotation(user: AuthUser, id: string) {
    const doc = await this.prisma.quotation.findFirst({
      where: { id, tenantId: requireTenantId(user) },
      include: { party: true, lines: { include: { product: true } } },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'QUOTATION_NOT_FOUND', message: 'Quotation not found' });
    }
    return doc;
  }

  async getOrder(user: AuthUser, id: string) {
    const doc = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId: requireTenantId(user) },
      include: { party: true, lines: { include: { product: true } }, invoices: true },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Sales order not found' });
    }
    return doc;
  }

  async createQuotation(user: AuthUser, dto: CreateQuotationDto) {
    const tenantId = requireTenantId(user);
    await this.crm.getParty(user, dto.partyId);
    return this.prisma.$transaction(async (tx) => {
      const ctx = await this.docContext(tx, tenantId, dto);
      const priced = await this.priceLines(tenantId, dto.partyId, dto.lines, user);
      const totals = sumLines(priced);
      const quotation = await tx.quotation.create({
        data: {
          tenantId,
          branchId: ctx.branch.id,
          fiscalYearId: ctx.fiscal.id,
          warehouseId: ctx.warehouse.id,
          partyId: dto.partyId,
          opportunityId: dto.opportunityId,
          number: ctx.number,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : new Date(Date.now() + 14 * 86400_000),
          notes: dto.notes,
          ...totals,
          lines: { create: priced.map((line) => this.lineData(tenantId, line)) },
        },
        include: { lines: true, party: true },
      });
      await this.crm.note(tenantId, user.userId, {
        partyId: dto.partyId,
        kind: 'DOCUMENT',
        title: `Quotation ${quotation.number}`,
        entityType: 'Quotation',
        entityId: quotation.id,
      });
      return quotation;
    });
  }

  async approveQuotation(user: AuthUser, id: string) {
    const quotation = await this.getQuotation(user, id);
    if (!['DRAFT', 'PENDING_APPROVAL', 'SENT'].includes(quotation.status)) {
      throw new BadRequestException({ code: 'QUOTATION_NOT_APPROVABLE', message: 'Quotation cannot be approved' });
    }
    if (quotation.validUntil && quotation.validUntil < new Date()) {
      await this.prisma.quotation.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException({ code: 'QUOTATION_EXPIRED', message: 'Quotation has expired' });
    }
    return this.prisma.quotation.update({ where: { id }, data: { status: 'APPROVED' } });
  }

  async reviseQuotation(user: AuthUser, id: string, dto: CreateQuotationDto) {
    const previous = await this.getQuotation(user, id);
    const next = await this.createQuotation(user, { ...dto, partyId: dto.partyId ?? previous.partyId });
    await this.prisma.quotation.update({
      where: { id: next.id },
      data: { revisionOfId: previous.id, version: previous.version + 1 },
    });
    await this.prisma.quotation.update({ where: { id: previous.id }, data: { status: 'CANCELLED' } });
    return this.getQuotation(user, next.id);
  }

  async convertQuotation(user: AuthUser, id: string) {
    const quotation = await this.getQuotation(user, id);
    if (quotation.status !== 'APPROVED') {
      throw new BadRequestException({ code: 'QUOTATION_NOT_APPROVED', message: 'Approve the quotation before converting' });
    }
    const existing = await this.prisma.salesOrder.findFirst({
      where: { tenantId: quotation.tenantId, quotationId: quotation.id },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(tx, {
        tenantId: quotation.tenantId,
        branchId: quotation.branchId,
        fiscalYearId: quotation.fiscalYearId,
        documentType: 'SO',
      });
      const warehouse = quotation.warehouseId
        ? await this.inventory.defaultWarehouse(quotation.tenantId, quotation.warehouseId)
        : await this.inventory.defaultWarehouse(quotation.tenantId, undefined, quotation.branchId);
      const order = await tx.salesOrder.create({
        data: {
          tenantId: quotation.tenantId,
          branchId: quotation.branchId,
          fiscalYearId: quotation.fiscalYearId,
          warehouseId: warehouse.id,
          partyId: quotation.partyId,
          quotationId: quotation.id,
          number,
          status: 'DRAFT',
          currency: quotation.currency,
          subtotal: quotation.subtotal,
          discountAmount: quotation.discountAmount,
          taxAmount: quotation.taxAmount,
          total: quotation.total,
          notes: quotation.notes,
          lines: {
            create: quotation.lines.map((line) => ({
              tenantId: quotation.tenantId,
              productId: line.productId,
              description: line.description,
              qty: line.qty,
              unitPrice: line.unitPrice,
              discountPct: line.discountPct,
              taxRate: line.taxRate,
              lineSubtotal: line.lineSubtotal,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: { lines: true, party: true },
      });
      await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'CONVERTED' } });
      await this.crm.note(quotation.tenantId, user.userId, {
        partyId: quotation.partyId,
        kind: 'ORDER',
        title: `Order ${order.number} from ${quotation.number}`,
        entityType: 'SalesOrder',
        entityId: order.id,
      });
      return order;
    });
  }

  async createSalesOrder(user: AuthUser, dto: CreateSalesOrderDto) {
    const tenantId = requireTenantId(user);
    await this.crm.getParty(user, dto.partyId);
    return this.prisma.$transaction(async (tx) => {
      const ctx = await this.docContext(tx, tenantId, { ...dto, documentType: 'SO' });
      const priced = await this.priceLines(tenantId, dto.partyId, dto.lines, user);
      const totals = sumLines(priced);
      const order = await tx.salesOrder.create({
        data: {
          tenantId,
          branchId: ctx.branch.id,
          fiscalYearId: ctx.fiscal.id,
          warehouseId: ctx.warehouse.id,
          partyId: dto.partyId,
          number: ctx.number,
          notes: dto.notes,
          ...totals,
          lines: { create: priced.map((line) => this.lineData(tenantId, line)) },
        },
        include: { lines: true, party: true },
      });
      await this.crm.note(tenantId, user.userId, {
        partyId: dto.partyId,
        kind: 'ORDER',
        title: `Order ${order.number}`,
        entityType: 'SalesOrder',
        entityId: order.id,
      });
      return order;
    });
  }

  async approveOrder(user: AuthUser, id: string) {
    const order = await this.getOrder(user, id);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException({ code: 'ORDER_NOT_DRAFT', message: 'Only draft orders can be approved' });
    }
    const setting = await this.prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId: order.tenantId, key: 'sales.reserve_on_approve' } },
    });
    const reserve = (setting?.value as { enabled?: boolean } | null)?.enabled !== false;
    return this.prisma.$transaction(async (tx) => {
      await tx.salesOrder.update({ where: { id: order.id }, data: { status: 'APPROVED' } });
      if (reserve) {
        return this.reserveTx(tx, order);
      }
      return tx.salesOrder.findFirstOrThrow({ where: { id: order.id }, include: { lines: true, party: true } });
    });
  }

  async reserveOrder(user: AuthUser, id: string) {
    const order = await this.getOrder(user, id);
    return this.prisma.$transaction((tx) => this.reserveTx(tx, order));
  }

  async fulfil(user: AuthUser, id: string, dto: QtyLinesDto) {
    const order = await this.getOrder(user, id);
    if (!['RESERVED', 'APPROVED', 'PARTIALLY_FULFILLED'].includes(order.status)) {
      throw new BadRequestException({ code: 'ORDER_NOT_FULFILABLE', message: 'Order cannot be fulfilled' });
    }
    return this.prisma.$transaction(async (tx) => {
      for (const incoming of dto.lines) {
        const line = order.lines.find((item) => item.id === incoming.lineId);
        if (!line) {
          throw new NotFoundException({ code: 'LINE_NOT_FOUND', message: 'Order line not found' });
        }
        const remaining = qty(line.qty).sub(line.qtyFulfilled);
        const issueQty = qty(incoming.qty);
        if (issueQty.gt(remaining)) {
          throw new BadRequestException({ code: 'OVER_FULFIL', message: 'Cannot fulfil more than ordered' });
        }
        if (line.product.trackStock) {
          await this.inventory.issueForFulfilment(tx, {
            tenantId: order.tenantId,
            warehouseId: order.warehouseId,
            salesOrderId: order.id,
            lineId: line.id,
            productId: line.productId,
            qty: issueQty,
          });
        }
        await tx.salesOrderLine.update({
          where: { id: line.id },
          data: { qtyFulfilled: qty(line.qtyFulfilled).add(issueQty) },
        });
      }
      const lines = await tx.salesOrderLine.findMany({ where: { salesOrderId: order.id } });
      const all = lines.every((line) => qty(line.qtyFulfilled).gte(line.qty));
      return tx.salesOrder.update({
        where: { id: order.id },
        data: { status: all ? 'FULFILLED' : 'PARTIALLY_FULFILLED' },
        include: { lines: true, party: true },
      });
    });
  }

  async cancelOrder(user: AuthUser, id: string) {
    const order = await this.getOrder(user, id);
    if (order.status === 'FULFILLED') {
      throw new BadRequestException({ code: 'ORDER_FULFILLED', message: 'Fulfilled orders cannot be cancelled' });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.inventory.releaseOrder(tx, order.tenantId, order.id);
      return tx.salesOrder.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
        include: { lines: true },
      });
    });
  }

  async returnOrder(user: AuthUser, id: string, dto: QtyLinesDto) {
    const order = await this.getOrder(user, id);
    return this.prisma.$transaction(async (tx) => {
      for (const incoming of dto.lines) {
        const line = order.lines.find((item) => item.id === incoming.lineId);
        if (!line) {
          throw new NotFoundException({ code: 'LINE_NOT_FOUND', message: 'Order line not found' });
        }
        const ret = qty(incoming.qty);
        if (ret.add(line.qtyReturned).gt(line.qtyFulfilled)) {
          throw new BadRequestException({ code: 'OVER_RETURN', message: 'Cannot return more than fulfilled' });
        }
        if (line.product.trackStock) {
          await this.inventory.returnStock(tx, {
            tenantId: order.tenantId,
            warehouseId: order.warehouseId,
            salesOrderId: order.id,
            productId: line.productId,
            qty: ret,
          });
        }
        await tx.salesOrderLine.update({
          where: { id: line.id },
          data: { qtyReturned: qty(line.qtyReturned).add(ret) },
        });
      }
      return tx.salesOrder.findFirstOrThrow({ where: { id: order.id }, include: { lines: true, party: true } });
    });
  }

  async createTarget(user: AuthUser, dto: SalesTargetDto) {
    return this.prisma.salesTarget.create({
      data: {
        tenantId: requireTenantId(user),
        userId: dto.userId,
        departmentId: dto.departmentId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        amount: money(dto.amount),
      },
    });
  }

  async performance(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const [orders, invoices, targets] = await Promise.all([
      this.prisma.salesOrder.findMany({ where: { tenantId, status: { not: 'CANCELLED' } } }),
      this.prisma.invoice.findMany({ where: { tenantId, kind: 'SALES', status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] } } }),
      this.prisma.salesTarget.findMany({ where: { tenantId } }),
    ]);
    const revenue = invoices.reduce((sum, item) => sum.add(item.total), money(0));
    const collected = invoices.reduce((sum, item) => sum.add(item.paidAmount), money(0));
    const cogs = orders.reduce((sum, item) => sum.add(item.subtotal.mul(0)), money(0));
    const margin = revenue.sub(cogs);
    return {
      orders: orders.length,
      revenue,
      collected,
      outstanding: revenue.sub(collected),
      grossMargin: margin,
      targets,
    };
  }

  private async reserveTx(
    tx: Prisma.TransactionClient,
    order: Awaited<ReturnType<SalesService['getOrder']>>,
  ) {
    await this.inventory.reserveLines(tx, {
      tenantId: order.tenantId,
      warehouseId: order.warehouseId,
      salesOrderId: order.id,
      lines: order.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        qty: qty(line.qty).sub(line.qtyReserved),
        trackStock: line.product.trackStock,
      })),
    });
    return tx.salesOrder.update({
      where: { id: order.id },
      data: { status: 'RESERVED', reservedAt: new Date() },
      include: { lines: true, party: true },
    });
  }

  private async docContext(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: { branchId?: string; documentType?: string },
  ) {
    const branch = await this.numbering.defaultBranch(tx, tenantId, dto.branchId);
    const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
    const warehouse = await this.inventory.defaultWarehouse(tenantId, undefined, branch.id);
    const number = await this.numbering.next(tx, {
      tenantId,
      branchId: branch.id,
      fiscalYearId: fiscal.id,
      documentType: dto.documentType ?? 'QTN',
    });
    return { branch, fiscal, warehouse, number };
  }

  private async priceLines(tenantId: string, partyId: string, lines: DocumentLineDto[], user: AuthUser) {
    const maxDiscount = await this.maxDiscount(tenantId);
    const priced = [];
    for (const line of lines) {
      const resolved = await this.inventory.resolvePrice(tenantId, partyId, line.productId);
      const discountPct = line.discountPct ?? 0;
      if (discountPct > maxDiscount && !user.permissions.includes('quotations:approve') && !user.isPlatformAdmin) {
        throw new ForbiddenException({
          code: 'DISCOUNT_LIMIT',
          message: `Discount exceeds tenant limit of ${maxDiscount}%`,
        });
      }
      priced.push({
        ...priceLine({
          qty: line.qty,
          unitPrice: line.unitPrice ?? Number(resolved.unitPrice),
          discountPct,
          taxRate: Number(resolved.taxRate),
        }),
        productId: line.productId,
        description: resolved.product.name,
      });
    }
    return priced;
  }

  private lineData(tenantId: string, line: ReturnType<typeof priceLine> & { productId: string; description: string }) {
    return {
      tenantId,
      productId: line.productId,
      description: line.description,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      taxRate: line.taxRate,
      lineSubtotal: line.lineSubtotal,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
    };
  }

  private async maxDiscount(tenantId: string) {
    const setting = await this.prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: 'sales.max_discount_pct' } },
    });
    return (setting?.value as { pct?: number } | null)?.pct ?? 25;
  }
}
