import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RmaPath, TicketStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { money, qty } from '../../common/utils/money';
import { pageOf, paging, PageQuery } from '../../common/utils/paging';
import { allotWork, completeOpenAssignment, listAssignments } from '../../common/utils/workflow';

export class CreateTicketDto {
  @IsString()
  partyId!: string;
  @IsOptional()
  @IsString()
  productId?: string;
  @IsOptional()
  @IsString()
  serialNo?: string;
  @IsString()
  complaint!: string;
  @IsOptional()
  @IsEnum(RmaPath)
  path?: RmaPath;
  @IsOptional()
  @IsString()
  priority?: string;
  @IsOptional()
  @IsString()
  technicianId?: string;
}

export class DiagnosisDto {
  @IsString()
  notes!: string;
}

export class EstimateDto {
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class TicketPartDto {
  @IsString()
  productId!: string;
  @IsNumber()
  @Min(0.0001)
  qty!: number;
}

export class QualityDto {
  @IsBoolean()
  passed!: boolean;
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AllotDto {
  @IsString()
  employeeId!: string;
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteStepDto {
  @IsOptional()
  @IsString()
  notes?: string;
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
  @IsOptional()
  @IsBoolean()
  passed?: boolean;
  @IsOptional()
  @IsString()
  productId?: string;
  @IsOptional()
  @IsNumber()
  qty?: number;
}

const FLOW: Record<string, TicketStatus> = {
  RECEIVED: 'INSPECTION',
  INSPECTION: 'ESTIMATE',
  ESTIMATE: 'CUSTOMER_APPROVAL',
  CUSTOMER_APPROVAL: 'REPAIR',
  REPAIR: 'QUALITY_CHECK',
  QUALITY_CHECK: 'READY_FOR_DISPATCH',
  READY_FOR_DISPATCH: 'DELIVERED',
};

@Injectable()
export class ServiceCentreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
  ) {}

  async tickets(user: AuthUser, query: PageQuery = {}) {
    const tenantId = requireTenantId(user);
    const { skip, take, page, pageSize, q } = paging(query);
    const where = {
      tenantId,
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: 'insensitive' as const } },
              { complaint: { contains: q, mode: 'insensitive' as const } },
              { serialNo: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.serviceTicket.findMany({
        where,
        include: { technician: true, diagnoses: true, parts: true, qualityChecks: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.serviceTicket.count({ where }),
    ]);
    const withPeople = await Promise.all(
      items.map(async (ticket) => ({
        ...ticket,
        assignments: await listAssignments(this.prisma, tenantId, 'TICKET', ticket.id),
      })),
    );
    return pageOf(withPeople, total, page, pageSize);
  }

  async getTicket(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    const ticket = await this.prisma.serviceTicket.findFirst({
      where: { id, tenantId },
      include: { technician: true, diagnoses: true, parts: true, qualityChecks: true, shipments: true },
    });
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Service ticket not found' });
    }
    return {
      ...ticket,
      assignments: await listAssignments(this.prisma, tenantId, 'TICKET', ticket.id),
      workflow: this.workflowView(ticket.status),
    };
  }

  async createTicket(user: AuthUser, dto: CreateTicketDto) {
    const tenantId = requireTenantId(user);
    const ticket = await this.prisma.$transaction(async (tx) => {
      const branch = await this.numbering.defaultBranch(tx, tenantId);
      const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        documentType: 'TKT',
      });
      const slaDueAt = new Date();
      slaDueAt.setHours(slaDueAt.getHours() + 48);
      return tx.serviceTicket.create({
        data: {
          tenantId,
          number,
          partyId: dto.partyId,
          productId: dto.productId,
          serialNo: dto.serialNo,
          complaint: dto.complaint,
          path: dto.path ?? 'PAID_REPAIR',
          priority: dto.priority ?? 'NORMAL',
          technicianId: dto.technicianId,
          slaDueAt,
        },
      });
    });
    if (dto.technicianId) {
      await allotWork(this.prisma, {
        tenantId,
        kind: 'TICKET',
        recordId: ticket.id,
        step: 'RECEIVED',
        employeeId: dto.technicianId,
        allottedBy: user.userId,
      });
    }
    return this.getTicket(user, ticket.id);
  }

  async allot(user: AuthUser, id: string, dto: AllotDto) {
    const ticket = await this.requireTicket(user, id);
    const { employee } = await allotWork(this.prisma, {
      tenantId: ticket.tenantId,
      kind: 'TICKET',
      recordId: ticket.id,
      step: ticket.status,
      employeeId: dto.employeeId,
      allottedBy: user.userId,
      notes: dto.notes,
    });
    await this.prisma.serviceTicket.update({
      where: { id: ticket.id },
      data: { technicianId: employee.id },
    });
    return this.getTicket(user, ticket.id);
  }

  async completeStep(user: AuthUser, id: string, dto: CompleteStepDto) {
    const ticket = await this.requireTicket(user, id);
    await completeOpenAssignment(this.prisma, {
      tenantId: ticket.tenantId,
      kind: 'TICKET',
      recordId: ticket.id,
      step: ticket.status,
      completedBy: user.userId,
      notes: dto.notes,
    });
    if (ticket.status === 'RECEIVED') {
      await this.diagnose(user, id, { notes: dto.notes || 'Intake complete' });
    } else if (ticket.status === 'INSPECTION') {
      await this.estimate(user, id, { amount: dto.amount ?? Number(ticket.estimate ?? 0) });
    } else if (ticket.status === 'ESTIMATE') {
      await this.authorize(user, id);
    } else if (ticket.status === 'CUSTOMER_APPROVAL') {
      if (dto.productId && dto.qty) {
        await this.addPart(user, id, { productId: dto.productId, qty: dto.qty });
      }
      await this.consumeParts(user, id);
    } else if (ticket.status === 'REPAIR') {
      await this.quality(user, id, { passed: dto.passed ?? true, notes: dto.notes });
    } else if (ticket.status === 'QUALITY_CHECK') {
      await this.ready(user, id);
    } else if (ticket.status === 'READY_FOR_DISPATCH') {
      await this.prisma.serviceTicket.update({ where: { id: ticket.id }, data: { status: 'DELIVERED' } });
    } else {
      throw new BadRequestException({ code: 'TICKET_STATUS', message: 'This step cannot be marked done here' });
    }
    return this.getTicket(user, id);
  }

  async diagnose(user: AuthUser, id: string, dto: DiagnosisDto) {
    const ticket = await this.requireTicket(user, id);
    await this.prisma.diagnosis.create({
      data: { tenantId: ticket.tenantId, ticketId: ticket.id, notes: dto.notes },
    });
    return this.advance(ticket, 'RECEIVED');
  }

  async estimate(user: AuthUser, id: string, dto: EstimateDto) {
    const ticket = await this.requireTicket(user, id);
    const amount = ticket.path === 'WARRANTY' ? money(0) : money(dto.amount);
    await this.prisma.serviceTicket.update({ where: { id: ticket.id }, data: { estimate: amount } });
    return this.advance(ticket, 'INSPECTION');
  }

  async authorize(user: AuthUser, id: string) {
    const ticket = await this.requireTicket(user, id);
    await this.prisma.serviceTicket.update({
      where: { id: ticket.id },
      data: { authorizedAt: new Date() },
    });
    return this.advance(ticket, 'ESTIMATE');
  }

  async addPart(user: AuthUser, id: string, dto: TicketPartDto) {
    const ticket = await this.requireTicket(user, id);
    return this.prisma.ticketPart.create({
      data: { tenantId: ticket.tenantId, ticketId: ticket.id, productId: dto.productId, qty: qty(dto.qty) },
    });
  }

  async consumeParts(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    const ticket = await this.requireTicket(user, id);
    const warehouse = await this.inventory.defaultWarehouse(tenantId);
    return this.prisma.$transaction(async (tx) => {
      const parts = await tx.ticketPart.findMany({ where: { ticketId: ticket.id, consumed: false } });
      for (const part of parts) {
        await this.inventory.consume(tx, {
          tenantId,
          warehouseId: warehouse.id,
          productId: part.productId,
          qty: qty(part.qty),
          referenceType: 'TICKET',
          referenceId: ticket.id,
          idempotencyKey: `tkt-part:${part.id}`,
        });
        await tx.ticketPart.update({ where: { id: part.id }, data: { consumed: true } });
      }
      return this.advance(ticket, 'CUSTOMER_APPROVAL');
    });
  }

  async quality(user: AuthUser, id: string, dto: QualityDto) {
    const ticket = await this.requireTicket(user, id);
    await this.prisma.qualityCheck.create({
      data: { tenantId: ticket.tenantId, ticketId: ticket.id, passed: dto.passed, notes: dto.notes },
    });
    if (!dto.passed) {
      return this.prisma.serviceTicket.update({
        where: { id: ticket.id },
        data: { status: 'REPAIR' },
        include: { diagnoses: true, parts: true, qualityChecks: true },
      });
    }
    await this.prisma.serviceTicket.update({ where: { id: ticket.id }, data: { qcPassedAt: new Date() } });
    return this.advance(ticket, 'REPAIR');
  }

  async ready(user: AuthUser, id: string) {
    const ticket = await this.requireTicket(user, id);
    if (!ticket.qcPassedAt) {
      throw new BadRequestException({ code: 'QC_REQUIRED', message: 'Quality check must pass before dispatch' });
    }
    return this.advance(ticket, 'QUALITY_CHECK');
  }

  private async advance(ticket: { id: string; status: TicketStatus }, expected: TicketStatus) {
    if (ticket.status !== expected) {
      throw new BadRequestException({
        code: 'TICKET_STATUS',
        message: `Ticket must be ${expected} before this step`,
      });
    }
    return this.prisma.serviceTicket.update({
      where: { id: ticket.id },
      data: { status: FLOW[expected] },
      include: { diagnoses: true, parts: true, qualityChecks: true, technician: true },
    });
  }

  private workflowView(status: TicketStatus) {
    const steps = Object.keys(FLOW);
    const current = steps.indexOf(status);
    return {
      current: status,
      next: FLOW[status] ?? null,
      steps: [...steps, 'DELIVERED'].map((step, index) => ({
        key: step,
        label: step.replace(/_/g, ' '),
        state: step === 'DELIVERED' && status === 'DELIVERED' ? 'done' : index < current ? 'done' : step === status ? 'active' : 'todo',
      })),
    };
  }

  private async requireTicket(user: AuthUser, id: string) {
    const ticket = await this.prisma.serviceTicket.findFirst({ where: { id, tenantId: requireTenantId(user) } });
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Service ticket not found' });
    }
    if (ticket.status === 'CANCELLED' || ticket.status === 'DELIVERED') {
      throw new BadRequestException({ code: 'TICKET_CLOSED', message: 'Ticket is closed' });
    }
    return ticket;
  }
}
