import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecurrenceFrequency, RecurringKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { money, priceLine } from '../../common/utils/money';
import { advanceScheduleDate, nextOccurrenceKey } from '../../common/utils/people.math';
import { normalizePhone } from '../../common/utils/normalize';

export class RecurringDto {
  @IsString()
  name!: string;
  @IsEnum(RecurringKind)
  kind!: RecurringKind;
  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;
  @IsOptional()
  @IsNumber()
  interval?: number;
  @IsOptional()
  @IsString()
  partyId?: string;
  @IsNumber()
  amount!: number;
  @IsOptional()
  @IsNumber()
  taxRate?: number;
  @IsDateString()
  nextRunAt!: string;
  @IsOptional()
  @IsDateString()
  endsAt?: string;
  @IsOptional()
  @IsNumber()
  dueOffsetDays?: number;
}

export class BankAccountDto {
  @IsString()
  name!: string;
  @IsString()
  maskedNumber!: string;
  @IsOptional()
  @IsString()
  provider?: string;
}

export class BankImportDto {
  @IsString()
  bankAccountId!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankTxnDto)
  transactions!: BankTxnDto[];
}

export class BankTxnDto {
  @IsString()
  providerRef!: string;
  @IsNumber()
  amount!: number;
  @IsDateString()
  txnDate!: string;
  @IsString()
  description!: string;
}

export class MatchDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;
}

export class ChannelDto {
  @IsString()
  provider!: string;
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  phone?: string;
}

export class SendMessageDto {
  @IsString()
  conversationId!: string;
  @IsString()
  body!: string;
  @IsOptional()
  @IsString()
  templateName?: string;
}

export class WhatsAppWebhookDto {
  @IsString()
  eventId!: string;
  @IsOptional()
  @IsString()
  tenantSlug?: string;
  @IsOptional()
  @IsString()
  from?: string;
  @IsOptional()
  @IsString()
  body?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @Allow()
  extra?: unknown;
}

export class ListingDto {
  @IsString()
  channel!: string;
  @IsString()
  productId!: string;
  @IsString()
  listingId!: string;
}

export class MarketplaceOrderDto {
  @IsString()
  channel!: string;
  @IsString()
  externalId!: string;
  @IsOptional()
  @IsString()
  partyId?: string;
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  schedules(user: AuthUser) {
    return this.prisma.recurringSchedule.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { occurrences: true },
      orderBy: { nextRunAt: 'asc' },
    });
  }

  createSchedule(user: AuthUser, dto: RecurringDto) {
    return this.prisma.recurringSchedule.create({
      data: {
        tenantId: requireTenantId(user),
        name: dto.name,
        kind: dto.kind,
        frequency: dto.frequency,
        interval: dto.interval ?? 1,
        partyId: dto.partyId,
        amount: money(dto.amount),
        taxRate: dto.taxRate ?? 0,
        nextRunAt: new Date(dto.nextRunAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        dueOffsetDays: dto.dueOffsetDays ?? 0,
      },
    });
  }

  async runDue(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const due = await this.prisma.recurringSchedule.findMany({
      where: { tenantId, status: 'ACTIVE', nextRunAt: { lte: new Date() } },
    });
    const created = [];
    for (const schedule of due) {
      const result = await this.spawn(schedule);
      if (result) {
        created.push(result);
      }
    }
    return created;
  }

  bankAccounts(user: AuthUser) {
    return this.prisma.bankAccount.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { transactions: { take: 50, orderBy: { txnDate: 'desc' } } },
    });
  }

  createBankAccount(user: AuthUser, dto: BankAccountDto) {
    return this.prisma.bankAccount.create({
      data: { tenantId: requireTenantId(user), ...dto, provider: dto.provider ?? 'manual' },
    });
  }

  transactions(user: AuthUser) {
    return this.prisma.bankTransaction.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { bankAccount: true },
      orderBy: { txnDate: 'desc' },
    });
  }

  async importBank(user: AuthUser, dto: BankImportDto) {
    const tenantId = requireTenantId(user);
    const account = await this.prisma.bankAccount.findFirst({ where: { id: dto.bankAccountId, tenantId } });
    if (!account) {
      throw new NotFoundException({ code: 'BANK_ACCOUNT_NOT_FOUND', message: 'Bank account not found' });
    }
    const saved = [];
    for (const txn of dto.transactions) {
      try {
        const row = await this.prisma.bankTransaction.create({
          data: {
            tenantId,
            bankAccountId: account.id,
            providerRef: txn.providerRef,
            amount: money(txn.amount),
            txnDate: new Date(txn.txnDate),
            description: txn.description,
          },
        });
        saved.push(row);
      } catch (error) {
        if ((error as Prisma.PrismaClientKnownRequestError).code !== 'P2002') {
          throw error;
        }
      }
    }
    return this.suggestMatches(tenantId, saved.map((row) => row.id));
  }

  async match(user: AuthUser, id: string, dto: MatchDto) {
    const tenantId = requireTenantId(user);
    const txn = await this.prisma.bankTransaction.findFirst({ where: { id, tenantId } });
    if (!txn) {
      throw new NotFoundException({ code: 'BANK_TXN_NOT_FOUND', message: 'Transaction not found' });
    }
    return this.prisma.bankTransaction.update({
      where: { id: txn.id },
      data: { invoiceId: dto.invoiceId, matchStatus: dto.invoiceId ? 'SUGGESTED' : 'UNMATCHED' },
    });
  }

  async confirm(user: AuthUser, id: string) {
    const txn = await this.prisma.bankTransaction.findFirst({ where: { id, tenantId: requireTenantId(user) } });
    if (!txn) {
      throw new NotFoundException({ code: 'BANK_TXN_NOT_FOUND', message: 'Transaction not found' });
    }
    return this.prisma.bankTransaction.update({ where: { id: txn.id }, data: { matchStatus: 'CONFIRMED' } });
  }

  channels(user: AuthUser) {
    return this.prisma.channelAccount.findMany({ where: { tenantId: requireTenantId(user) } });
  }

  createChannel(user: AuthUser, dto: ChannelDto) {
    return this.prisma.channelAccount.create({ data: { tenantId: requireTenantId(user), ...dto } });
  }

  conversations(user: AuthUser) {
    return this.prisma.conversation.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 }, channel: true },
      orderBy: { id: 'desc' },
    });
  }

  async send(user: AuthUser, dto: SendMessageDto) {
    const tenantId = requireTenantId(user);
    const conversation = await this.prisma.conversation.findFirst({ where: { id: dto.conversationId, tenantId } });
    if (!conversation) {
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' });
    }
    if (conversation.optOut) {
      throw new ConflictException({ code: 'OPTED_OUT', message: 'Recipient has opted out' });
    }
    return this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'OUT',
        body: dto.body,
        templateName: dto.templateName,
        status: 'SENT',
      },
    });
  }

  async assign(user: AuthUser, id: string) {
    return this.prisma.conversation.updateMany({
      where: { id, tenantId: requireTenantId(user) },
      data: { ownerUserId: user.userId, status: 'ASSIGNED' },
    });
  }

  async ingestWhatsApp(dto: WhatsAppWebhookDto) {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'whatsapp', eventId: dto.eventId } },
    });
    if (existing) {
      return { duplicate: true, id: existing.id };
    }
    const tenant = dto.tenantSlug
      ? await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } })
      : await this.prisma.tenant.findFirst({ where: { slug: 'acme' } });
    const event = await this.prisma.webhookEvent.create({
      data: {
        tenantId: tenant?.id,
        provider: 'whatsapp',
        eventId: dto.eventId,
        payload: dto as unknown as Prisma.InputJsonValue,
        processed: true,
      },
    });
    if (!tenant) {
      return event;
    }
    const channel =
      (await this.prisma.channelAccount.findFirst({ where: { tenantId: tenant.id, provider: 'whatsapp' } })) ??
      (await this.prisma.channelAccount.create({
        data: { tenantId: tenant.id, provider: 'whatsapp', name: 'WhatsApp', phone: dto.phone },
      }));
    const phone = normalizePhone(dto.from ?? dto.phone ?? '');
    const party = phone
      ? await this.prisma.party.findFirst({ where: { tenantId: tenant.id, normalizedPhone: phone } })
      : null;
    let conversation = await this.prisma.conversation.findFirst({
      where: { tenantId: tenant.id, channelId: channel.id, partyId: party?.id ?? undefined, status: { not: 'CLOSED' } },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { tenantId: tenant.id, channelId: channel.id, partyId: party?.id, status: 'OPEN' },
      });
    }
    try {
      await this.prisma.message.create({
        data: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: 'IN',
          body: dto.body ?? '',
          eventId: dto.eventId,
          status: 'RECEIVED',
        },
      });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code !== 'P2002') {
        throw error;
      }
    }
    return { event, conversationId: conversation.id };
  }

  listings(user: AuthUser) {
    return this.prisma.marketplaceListing.findMany({ where: { tenantId: requireTenantId(user) } });
  }

  async publishListing(user: AuthUser, dto: ListingDto) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.marketplaceListing.findUnique({
      where: { tenantId_channel_listingId: { tenantId, channel: dto.channel, listingId: dto.listingId } },
    });
    if (existing) {
      return this.prisma.marketplaceListing.update({
        where: { id: existing.id },
        data: { version: { increment: 1 }, productId: dto.productId },
      });
    }
    return this.prisma.marketplaceListing.create({ data: { tenantId, ...dto } });
  }

  marketplaceOrders(user: AuthUser) {
    return this.prisma.marketplaceOrder.findMany({
      where: { tenantId: requireTenantId(user) },
      orderBy: { id: 'desc' },
    });
  }

  async importMarketplaceOrder(user: AuthUser, dto: MarketplaceOrderDto) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.marketplaceOrder.findUnique({
      where: { tenantId_channel_externalId: { tenantId, channel: dto.channel, externalId: dto.externalId } },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.marketplaceOrder.create({
      data: {
        tenantId,
        channel: dto.channel,
        externalId: dto.externalId,
        status: 'IMPORTED',
        payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async spawn(schedule: {
    id: string;
    tenantId: string;
    name: string;
    frequency: RecurrenceFrequency;
    interval: number;
    partyId: string | null;
    amount: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    nextRunAt: Date;
    endsAt: Date | null;
    dueOffsetDays: number;
  }) {
    const occurKey = nextOccurrenceKey(schedule.id, schedule.nextRunAt);
    const existing = await this.prisma.recurringOccurrence.findUnique({
      where: { tenantId_occurKey: { tenantId: schedule.tenantId, occurKey } },
    });
    if (existing) {
      return existing;
    }
    let invoiceId: string | undefined;
    if (schedule.partyId) {
      const product =
        (await this.prisma.product.findFirst({ where: { tenantId: schedule.tenantId, sku: 'REC-CHARGE' } })) ??
        (await this.prisma.product.findFirst({ where: { tenantId: schedule.tenantId, type: 'SERVICE' } }));
      if (product) {
        const branch = await this.numbering.defaultBranch(this.prisma, schedule.tenantId);
        const fiscal = await this.numbering.currentFiscalYear(this.prisma, schedule.tenantId);
        const number = await this.numbering.next(this.prisma, {
          tenantId: schedule.tenantId,
          branchId: branch.id,
          fiscalYearId: fiscal.id,
          documentType: 'INV',
        });
        const line = priceLine({ qty: 1, unitPrice: Number(schedule.amount), taxRate: Number(schedule.taxRate) });
        const due = new Date(schedule.nextRunAt);
        due.setDate(due.getDate() + schedule.dueOffsetDays);
        const invoice = await this.prisma.invoice.create({
          data: {
            tenantId: schedule.tenantId,
            branchId: branch.id,
            fiscalYearId: fiscal.id,
            partyId: schedule.partyId,
            number,
            dueDate: due,
            subtotal: line.lineSubtotal,
            taxAmount: line.taxAmount,
            total: line.lineTotal,
            notes: schedule.name,
            lines: {
              create: {
                tenantId: schedule.tenantId,
                productId: product.id,
                description: schedule.name,
                qty: line.qty,
                unitPrice: line.unitPrice,
                taxRate: line.taxRate,
                lineSubtotal: line.lineSubtotal,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
              },
            },
          },
        });
        invoiceId = invoice.id;
      }
    }
    const occurrence = await this.prisma.recurringOccurrence.create({
      data: {
        tenantId: schedule.tenantId,
        scheduleId: schedule.id,
        occurKey,
        runAt: schedule.nextRunAt,
        invoiceId,
      },
    });
    const nextRunAt = advanceScheduleDate(schedule.nextRunAt, schedule.frequency, schedule.interval);
    const ended = schedule.endsAt && nextRunAt > schedule.endsAt;
    await this.prisma.recurringSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt, status: ended ? 'TERMINATED' : 'ACTIVE' },
    });
    return occurrence;
  }

  private async suggestMatches(tenantId: string, ids: string[]) {
    const txns = await this.prisma.bankTransaction.findMany({ where: { tenantId, id: { in: ids } } });
    for (const txn of txns) {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          tenantId,
          kind: 'SALES',
          status: { in: ['POSTED', 'PARTIALLY_PAID'] },
          total: txn.amount,
          paidAmount: { lt: txn.amount },
        },
      });
      if (invoice) {
        await this.prisma.bankTransaction.update({
          where: { id: txn.id },
          data: { invoiceId: invoice.id, matchStatus: 'SUGGESTED' },
        });
      }
    }
    return this.prisma.bankTransaction.findMany({ where: { tenantId, id: { in: ids } } });
  }
}
