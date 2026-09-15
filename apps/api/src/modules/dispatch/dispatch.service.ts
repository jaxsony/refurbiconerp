import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { qty } from '../../common/utils/money';

export class PickLineDto {
  @IsString()
  productId!: string;
  @IsNumber()
  @Min(0.0001)
  qty!: number;
}

export class CreatePickListDto {
  @IsOptional()
  @IsString()
  salesOrderId?: string;
  @IsOptional()
  @IsString()
  ticketId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PickLineDto)
  lines?: PickLineDto[];
}

export class PickQtyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PickedLineDto)
  lines!: PickedLineDto[];
}

export class PickedLineDto {
  @IsString()
  lineId!: string;
  @IsNumber()
  @Min(0)
  pickedQty!: number;
}

export class CreateShipmentDto {
  @IsOptional()
  @IsString()
  pickListId?: string;
  @IsOptional()
  @IsString()
  ticketId?: string;
  @IsOptional()
  @IsString()
  courier?: string;
  @IsOptional()
  @IsNumber()
  freight?: number;
}

export class TrackingDto {
  @IsString()
  status!: string;
  @IsOptional()
  @IsString()
  note?: string;
  @IsOptional()
  @IsString()
  awb?: string;
}

export class ProofDto {
  @IsString()
  kind!: string;
  @IsOptional()
  @IsString()
  url?: string;
  @IsOptional()
  @IsString()
  signature?: string;
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
  ) {}

  pickLists(user: AuthUser) {
    return this.prisma.pickList.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { lines: true, shipments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  shipments(user: AuthUser) {
    return this.prisma.shipment.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { events: true, proofs: true, pickList: true, ticket: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPickList(user: AuthUser, dto: CreatePickListDto) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const branch = await this.numbering.defaultBranch(tx, tenantId);
      const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        documentType: 'PICK',
      });
      let lines = dto.lines ?? [];
      if (dto.salesOrderId) {
        const order = await tx.salesOrder.findFirst({
          where: { id: dto.salesOrderId, tenantId },
          include: { lines: true },
        });
        if (!order) {
          throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Sales order not found' });
        }
        lines = order.lines.map((line) => ({ productId: line.productId, qty: Number(line.qty) - Number(line.qtyFulfilled) }));
      }
      if (dto.ticketId) {
        const parts = await tx.ticketPart.findMany({ where: { ticketId: dto.ticketId } });
        if (parts.length) {
          lines = parts.map((part) => ({ productId: part.productId, qty: Number(part.qty) }));
        }
      }
      const usable = lines.filter((line) => line.qty > 0);
      if (!usable.length) {
        throw new BadRequestException({ code: 'NO_PICK_LINES', message: 'Nothing to pick' });
      }
      return tx.pickList.create({
        data: {
          tenantId,
          number,
          salesOrderId: dto.salesOrderId,
          ticketId: dto.ticketId,
          lines: { create: usable.map((line) => ({ productId: line.productId, qty: qty(line.qty) })) },
        },
        include: { lines: true },
      });
    });
  }

  async pick(user: AuthUser, id: string, dto: PickQtyDto) {
    const tenantId = requireTenantId(user);
    const pickList = await this.prisma.pickList.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!pickList) {
      throw new NotFoundException({ code: 'PICK_NOT_FOUND', message: 'Pick list not found' });
    }
    const warehouse = await this.inventory.defaultWarehouse(tenantId);
    return this.prisma.$transaction(async (tx) => {
      for (const incoming of dto.lines) {
        const line = pickList.lines.find((item) => item.id === incoming.lineId);
        if (!line) {
          throw new NotFoundException({ code: 'PICK_LINE_NOT_FOUND', message: 'Pick line not found' });
        }
        await tx.pickListLine.update({ where: { id: line.id }, data: { pickedQty: qty(incoming.pickedQty) } });
        if (pickList.salesOrderId) {
          await this.inventory.consume(tx, {
            tenantId,
            warehouseId: warehouse.id,
            productId: line.productId,
            qty: qty(incoming.pickedQty),
            referenceType: 'PICK',
            referenceId: pickList.id,
            idempotencyKey: `pick:${line.id}`,
            consumeReservation: true,
          });
        }
      }
      return tx.pickList.update({
        where: { id: pickList.id },
        data: { status: 'PICKED' },
        include: { lines: true },
      });
    });
  }

  async createShipment(user: AuthUser, dto: CreateShipmentDto) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const branch = await this.numbering.defaultBranch(tx, tenantId);
      const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        documentType: 'SHIP',
      });
      return tx.shipment.create({
        data: {
          tenantId,
          number,
          pickListId: dto.pickListId,
          ticketId: dto.ticketId,
          courier: dto.courier,
          freight: dto.freight ?? 0,
          events: { create: { tenantId, status: 'CREATED', note: 'Shipment created' } },
        },
        include: { events: true },
      });
    });
  }

  async pack(user: AuthUser, id: string) {
    return this.setStatus(user, id, 'PACKED', { packedAt: new Date() });
  }

  async ship(user: AuthUser, id: string, dto: TrackingDto) {
    return this.setStatus(user, id, 'SHIPPED', {}, dto);
  }

  async track(user: AuthUser, id: string, dto: TrackingDto) {
    const shipment = await this.requireShipment(user, id);
    await this.prisma.trackingEvent.create({
      data: { tenantId: shipment.tenantId, shipmentId: shipment.id, status: dto.status, note: dto.note },
    });
    return this.prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: dto.status === 'IN_TRANSIT' ? 'IN_TRANSIT' : shipment.status, awb: dto.awb ?? shipment.awb },
      include: { events: true, proofs: true },
    });
  }

  async proof(user: AuthUser, id: string, dto: ProofDto) {
    const shipment = await this.requireShipment(user, id);
    await this.prisma.deliveryProof.create({
      data: { tenantId: shipment.tenantId, shipmentId: shipment.id, kind: dto.kind, url: dto.url, signature: dto.signature },
    });
    return this.prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
      include: { events: true, proofs: true },
    });
  }

  async deliver(user: AuthUser, id: string) {
    const shipment = await this.setStatus(user, id, 'DELIVERED', { deliveredAt: new Date() });
    if (shipment.ticketId) {
      await this.prisma.serviceTicket.update({
        where: { id: shipment.ticketId },
        data: { status: 'DELIVERED' },
      });
    }
    return shipment;
  }

  private async setStatus(
    user: AuthUser,
    id: string,
    status: 'PACKED' | 'SHIPPED' | 'DELIVERED',
    extra: Record<string, unknown>,
    tracking?: TrackingDto,
  ) {
    const shipment = await this.requireShipment(user, id);
    await this.prisma.trackingEvent.create({
      data: {
        tenantId: shipment.tenantId,
        shipmentId: shipment.id,
        status,
        note: tracking?.note,
      },
    });
    return this.prisma.shipment.update({
      where: { id: shipment.id },
      data: { status, ...extra, awb: tracking?.awb ?? shipment.awb },
      include: { events: true, proofs: true, ticket: true },
    });
  }

  private async requireShipment(user: AuthUser, id: string) {
    const shipment = await this.prisma.shipment.findFirst({ where: { id, tenantId: requireTenantId(user) } });
    if (!shipment) {
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    }
    return shipment;
  }
}
