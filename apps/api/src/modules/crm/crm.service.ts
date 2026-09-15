import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus, OpportunityStage, PartyType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { normalizeEmail, normalizePhone, normalizeTaxId } from '../../common/utils/normalize';
import { pageOf, paging, PageQuery } from '../../common/utils/paging';

export class UpsertPartyDto {
  @IsOptional()
  @IsEnum(PartyType)
  type?: PartyType;
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  code?: string;
  @IsOptional()
  @IsString()
  legalName?: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  taxId?: string;
  @IsOptional()
  @IsString()
  billingAddress?: string;
  @IsOptional()
  @IsString()
  shippingAddress?: string;
  @IsOptional()
  @IsNumber()
  creditLimit?: number;
  @IsOptional()
  @IsNumber()
  paymentTermsDays?: number;
  @IsOptional()
  @IsString()
  priceListId?: string;
}

export class ContactDto {
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  title?: string;
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpsertLeadDto {
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  company?: string;
  @IsOptional()
  @IsString()
  source?: string;
  @IsOptional()
  @IsString()
  ownerUserId?: string;
  @IsOptional()
  @IsNumber()
  value?: number;
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConvertLeadDto {
  @IsOptional()
  @IsEnum(PartyType)
  type?: PartyType;
}

export class UpsertOpportunityDto {
  @IsString()
  partyId!: string;
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  leadId?: string;
  @IsOptional()
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;
  @IsOptional()
  @IsNumber()
  probability?: number;
  @IsOptional()
  @IsNumber()
  value?: number;
  @IsOptional()
  @IsString()
  ownerUserId?: string;
}

export class ActivityDto {
  @IsString()
  kind!: string;
  @IsString()
  title!: string;
  @IsOptional()
  @IsString()
  body?: string;
  @IsOptional()
  @IsString()
  partyId?: string;
  @IsOptional()
  @IsString()
  leadId?: string;
  @IsOptional()
  @IsString()
  opportunityId?: string;
}

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async duplicates(
    tenantId: string,
    input: { email?: string | null; phone?: string | null; taxId?: string | null },
    excludePartyId?: string,
  ) {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const taxId = normalizeTaxId(input.taxId);
    if (!email && !phone && !taxId) {
      return [];
    }
    return this.prisma.party.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(excludePartyId ? { id: { not: excludePartyId } } : {}),
        OR: [
          ...(email ? [{ normalizedEmail: email }] : []),
          ...(phone ? [{ normalizedPhone: phone }] : []),
          ...(taxId ? [{ normalizedTaxId: taxId }] : []),
        ],
      },
      select: { id: true, code: true, name: true, email: true, phone: true, taxId: true },
      take: 10,
    });
  }

  async parties(user: AuthUser, type?: PartyType, query: PageQuery = {}) {
    const tenantId = requireTenantId(user);
    const { skip, take, page, pageSize, q } = paging(query);
    const where = {
      tenantId,
      ...(type
        ? { type: type === 'CUSTOMER' ? { in: ['CUSTOMER' as const, 'BOTH' as const] } : type === 'VENDOR' ? { in: ['VENDOR' as const, 'BOTH' as const] } : type }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q, mode: 'insensitive' as const } },
              { code: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.party.findMany({
        where,
        include: { contacts: true, priceList: true },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.party.count({ where }),
    ]);
    return pageOf(items, total, page, pageSize);
  }

  async getParty(user: AuthUser, id: string) {
    const party = await this.prisma.party.findFirst({
      where: { id, tenantId: requireTenantId(user) },
      include: { contacts: true, opportunities: true, quotations: { take: 20, orderBy: { createdAt: 'desc' } } },
    });
    if (!party) {
      throw new NotFoundException({ code: 'PARTY_NOT_FOUND', message: 'Customer or vendor not found' });
    }
    return party;
  }

  async createParty(user: AuthUser, dto: UpsertPartyDto) {
    const tenantId = requireTenantId(user);
    const duplicates = await this.duplicates(tenantId, dto);
    const count = await this.prisma.party.count({ where: { tenantId } });
    const prefix = dto.type === 'VENDOR' ? 'VEN' : 'CUS';
    const party = await this.prisma.party.create({
      data: {
        tenantId,
        type: dto.type ?? 'CUSTOMER',
        code: dto.code ?? `${prefix}-${String(count + 1).padStart(4, '0')}`,
        name: dto.name,
        legalName: dto.legalName,
        email: dto.email,
        phone: dto.phone,
        taxId: dto.taxId,
        normalizedEmail: normalizeEmail(dto.email),
        normalizedPhone: normalizePhone(dto.phone),
        normalizedTaxId: normalizeTaxId(dto.taxId),
        billingAddress: dto.billingAddress,
        shippingAddress: dto.shippingAddress,
        creditLimit: dto.creditLimit ?? 0,
        paymentTermsDays: dto.paymentTermsDays ?? 0,
        priceListId: dto.priceListId,
      },
    });
    await this.note(tenantId, user.userId, {
      partyId: party.id,
      kind: 'NOTE',
      title: 'Customer created',
      entityType: 'Party',
      entityId: party.id,
    });
    return { ...party, duplicates };
  }

  async updateParty(user: AuthUser, id: string, dto: Partial<UpsertPartyDto>) {
    const existing = await this.getParty(user, id);
    const duplicates = await this.duplicates(
      existing.tenantId,
      { email: dto.email ?? existing.email, phone: dto.phone ?? existing.phone, taxId: dto.taxId ?? existing.taxId },
      existing.id,
    );
    const party = await this.prisma.party.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        email: dto.email,
        phone: dto.phone,
        taxId: dto.taxId,
        normalizedEmail: dto.email !== undefined ? normalizeEmail(dto.email) : undefined,
        normalizedPhone: dto.phone !== undefined ? normalizePhone(dto.phone) : undefined,
        normalizedTaxId: dto.taxId !== undefined ? normalizeTaxId(dto.taxId) : undefined,
        billingAddress: dto.billingAddress,
        shippingAddress: dto.shippingAddress,
        creditLimit: dto.creditLimit,
        paymentTermsDays: dto.paymentTermsDays,
        priceListId: dto.priceListId,
      },
    });
    return { ...party, duplicates };
  }

  async addContact(user: AuthUser, partyId: string, dto: ContactDto) {
    const party = await this.getParty(user, partyId);
    return this.prisma.contact.create({
      data: { tenantId: party.tenantId, partyId: party.id, ...dto },
    });
  }

  leads(user: AuthUser) {
    return this.prisma.lead.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createLead(user: AuthUser, dto: UpsertLeadDto) {
    const tenantId = requireTenantId(user);
    const duplicates = await this.leadDuplicates(tenantId, dto);
    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        source: dto.source ?? 'manual',
        ownerUserId: dto.ownerUserId ?? user.userId,
        value: dto.value ?? 0,
        notes: dto.notes,
        normalizedEmail: normalizeEmail(dto.email),
        normalizedPhone: normalizePhone(dto.phone),
      },
    });
    await this.note(tenantId, user.userId, {
      leadId: lead.id,
      kind: 'NOTE',
      title: 'Lead captured',
      entityType: 'Lead',
      entityId: lead.id,
    });
    return { ...lead, duplicates };
  }

  async updateLead(user: AuthUser, id: string, dto: Partial<UpsertLeadDto> & { status?: LeadStatus; lostReason?: string }) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead not found' });
    }
    return this.prisma.lead.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        source: dto.source,
        ownerUserId: dto.ownerUserId,
        value: dto.value,
        notes: dto.notes,
        status: dto.status,
        lostReason: dto.lostReason,
        nextFollowUpAt: undefined,
        normalizedEmail: dto.email !== undefined ? normalizeEmail(dto.email) : undefined,
        normalizedPhone: dto.phone !== undefined ? normalizePhone(dto.phone) : undefined,
      },
    });
  }

  async convertLead(user: AuthUser, id: string, dto: ConvertLeadDto) {
    const tenantId = requireTenantId(user);
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) {
      throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead not found' });
    }
    if (lead.status === 'CONVERTED' && lead.convertedPartyId) {
      return this.getParty(user, lead.convertedPartyId);
    }
    const created = await this.createParty(user, {
      type: dto.type ?? 'CUSTOMER',
      name: lead.company || lead.name,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
    });
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'CONVERTED', convertedPartyId: created.id },
    });
    const opportunity = await this.prisma.opportunity.create({
      data: {
        tenantId,
        partyId: created.id,
        leadId: lead.id,
        name: lead.company || lead.name,
        value: lead.value,
        ownerUserId: lead.ownerUserId,
        stage: 'QUALIFY',
      },
    });
    await this.note(tenantId, user.userId, {
      partyId: created.id,
      leadId: lead.id,
      opportunityId: opportunity.id,
      kind: 'NOTE',
      title: 'Lead converted',
      entityType: 'Lead',
      entityId: lead.id,
    });
    return { party: created, opportunity };
  }

  opportunities(user: AuthUser) {
    return this.prisma.opportunity.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { party: true, owner: { select: { displayName: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createOpportunity(user: AuthUser, dto: UpsertOpportunityDto) {
    const tenantId = requireTenantId(user);
    await this.getParty(user, dto.partyId);
    const opportunity = await this.prisma.opportunity.create({
      data: {
        tenantId,
        partyId: dto.partyId,
        leadId: dto.leadId,
        name: dto.name,
        stage: dto.stage ?? 'QUALIFY',
        probability: dto.probability ?? 20,
        value: dto.value ?? 0,
        ownerUserId: dto.ownerUserId ?? user.userId,
      },
    });
    await this.note(tenantId, user.userId, {
      partyId: dto.partyId,
      opportunityId: opportunity.id,
      kind: 'NOTE',
      title: 'Opportunity created',
      entityType: 'Opportunity',
      entityId: opportunity.id,
    });
    return opportunity;
  }

  async updateOpportunity(user: AuthUser, id: string, dto: Partial<UpsertOpportunityDto> & { lostReason?: string }) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.opportunity.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException({ code: 'OPPORTUNITY_NOT_FOUND', message: 'Opportunity not found' });
    }
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        name: dto.name,
        stage: dto.stage,
        probability: dto.probability,
        value: dto.value,
        ownerUserId: dto.ownerUserId,
        lostReason: dto.lostReason,
      },
    });
  }

  async timeline(user: AuthUser, partyId: string) {
    const party = await this.getParty(user, partyId);
    const tenantId = party.tenantId;
    const [activities, tasks, quotations, orders, invoices, tickets] = await Promise.all([
      this.prisma.activity.findMany({ where: { tenantId, partyId }, orderBy: { occurredAt: 'desc' }, take: 50 }),
      this.prisma.task.findMany({
        where: { tenantId, linkedEntityType: 'Party', linkedEntityId: partyId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.quotation.findMany({ where: { tenantId, partyId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.salesOrder.findMany({ where: { tenantId, partyId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.invoice.findMany({ where: { tenantId, partyId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.task.findMany({
        where: { tenantId, linkedEntityId: partyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const events = [
      ...activities.map((item) => ({ at: item.occurredAt, kind: item.kind, title: item.title, id: item.id, source: 'activity' })),
      ...tasks.map((item) => ({ at: item.createdAt, kind: 'TASK', title: item.title, id: item.id, source: 'task' })),
      ...quotations.map((item) => ({ at: item.createdAt, kind: 'DOCUMENT', title: `Quotation ${item.number}`, id: item.id, source: 'quotation' })),
      ...orders.map((item) => ({ at: item.createdAt, kind: 'ORDER', title: `Order ${item.number}`, id: item.id, source: 'sales-order' })),
      ...invoices.map((item) => ({ at: item.createdAt, kind: 'INVOICE', title: `Invoice ${item.number}`, id: item.id, source: 'invoice' })),
      ...tickets.map((item) => ({ at: item.createdAt, kind: 'TICKET', title: item.title, id: item.id, source: 'task' })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    return { party, events };
  }

  async addActivity(user: AuthUser, dto: ActivityDto) {
    const tenantId = requireTenantId(user);
    return this.note(tenantId, user.userId, dto);
  }

  async note(
    tenantId: string,
    actorUserId: string,
    dto: {
      kind: string;
      title: string;
      body?: string;
      partyId?: string;
      leadId?: string;
      opportunityId?: string;
      entityType?: string;
      entityId?: string;
    },
  ) {
    return this.prisma.activity.create({
      data: { tenantId, actorUserId, ...dto },
    });
  }

  private leadDuplicates(tenantId: string, dto: UpsertLeadDto) {
    const email = normalizeEmail(dto.email);
    const phone = normalizePhone(dto.phone);
    if (!email && !phone) {
      return Promise.resolve([]);
    }
    return this.prisma.lead.findMany({
      where: {
        tenantId,
        OR: [...(email ? [{ normalizedEmail: email }] : []), ...(phone ? [{ normalizedPhone: phone }] : [])],
      },
      select: { id: true, name: true, email: true, phone: true, status: true },
      take: 10,
    });
  }
}
