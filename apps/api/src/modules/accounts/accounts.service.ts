import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, PaymentMethod, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { isBalanced, money, priceLine, qty, sumLines } from '../../common/utils/money';

export class LedgerAccountDto {
  @IsString()
  code!: string;
  @IsString()
  name!: string;
  @IsEnum(AccountType)
  type!: AccountType;
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class PaymentAllocDto {
  @IsString()
  invoiceId!: string;
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreatePaymentDto {
  @IsString()
  partyId!: string;
  @IsNumber()
  amount!: number;
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  reference?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocDto)
  allocations!: PaymentAllocDto[];
}

export class JournalLineDto {
  @IsString()
  accountId!: string;
  @IsOptional()
  @IsNumber()
  debit?: number;
  @IsOptional()
  @IsNumber()
  credit?: number;
  @IsOptional()
  @IsString()
  memo?: string;
  @IsOptional()
  @IsString()
  costCentre?: string;
}

export class CreateJournalDto {
  @IsString()
  narration!: string;
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  accounts(user: AuthUser) {
    return this.prisma.ledgerAccount.findMany({
      where: { tenantId: requireTenantId(user) },
      orderBy: { code: 'asc' },
    });
  }

  createAccount(user: AuthUser, dto: LedgerAccountDto) {
    return this.prisma.ledgerAccount.create({
      data: { tenantId: requireTenantId(user), ...dto },
    });
  }

  invoices(user: AuthUser) {
    return this.prisma.invoice.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { party: true, lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  payments(user: AuthUser) {
    return this.prisma.payment.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { party: true, allocations: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  vouchers(user: AuthUser) {
    return this.prisma.voucher.findMany({
      where: { tenantId: requireTenantId(user) },
      include: { lines: { include: { account: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async invoiceFromOrder(user: AuthUser, salesOrderId: string) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id: salesOrderId, tenantId },
        include: { lines: { include: { product: true } }, party: true },
      });
      if (!order) {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Sales order not found' });
      }
      if (!['APPROVED', 'RESERVED', 'PARTIALLY_FULFILLED', 'FULFILLED'].includes(order.status)) {
        throw new BadRequestException({ code: 'ORDER_NOT_INVOICEABLE', message: 'Order is not ready to invoice' });
      }
      await this.assertUnlocked(tx, order.fiscalYearId);
      const remaining = order.lines
        .map((line) => ({ line, qty: qty(line.qty).sub(line.qtyInvoiced) }))
        .filter((item) => item.qty.gt(0));
      if (!remaining.length) {
        throw new BadRequestException({ code: 'NOTHING_TO_INVOICE', message: 'Order is fully invoiced' });
      }
      await this.assertCredit(tenantId, order.party, remaining.reduce((sum, item) => sum.add(item.line.lineTotal), money(0)));
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: order.branchId,
        fiscalYearId: order.fiscalYearId,
        documentType: 'INV',
      });
      const priced = remaining.map((item) => ({
        ...priceLine({
          qty: item.qty.toNumber(),
          unitPrice: Number(item.line.unitPrice),
          discountPct: Number(item.line.discountPct),
          taxRate: Number(item.line.taxRate),
        }),
        productId: item.line.productId,
        description: item.line.description,
        salesOrderLineId: item.line.id,
      }));
      const totals = sumLines(priced);
      const due = new Date(order.orderDate);
      due.setDate(due.getDate() + (order.party.paymentTermsDays || 0));
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          branchId: order.branchId,
          fiscalYearId: order.fiscalYearId,
          partyId: order.partyId,
          salesOrderId: order.id,
          number,
          dueDate: due,
          currency: order.currency,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          lines: {
            create: priced.map((line) => ({
              tenantId,
              productId: line.productId,
              salesOrderLineId: line.salesOrderLineId,
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
      for (const item of remaining) {
        await tx.salesOrderLine.update({
          where: { id: item.line.id },
          data: { qtyInvoiced: qty(item.line.qtyInvoiced).add(item.qty) },
        });
      }
      return invoice;
    });
  }

  async postInvoice(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, tenantId },
        include: { lines: true, party: true },
      });
      if (!invoice || !['DRAFT', 'APPROVED'].includes(invoice.status)) {
        throw new BadRequestException({ code: 'INVOICE_NOT_POSTABLE', message: 'Invoice cannot be posted' });
      }
      await this.assertUnlocked(tx, invoice.fiscalYearId);
      const codes = await this.systemAccounts(tx, tenantId);
      const voucherNumber = await this.numbering.next(tx, {
        tenantId,
        branchId: invoice.branchId,
        fiscalYearId: invoice.fiscalYearId,
        documentType: 'JV',
      });
      const lines =
        invoice.kind === 'SALES'
          ? [
              { accountId: codes.ar, debit: invoice.total, credit: money(0), partyId: invoice.partyId, memo: invoice.number },
              { accountId: codes.sales, debit: money(0), credit: invoice.subtotal, memo: invoice.number },
              ...(invoice.taxAmount.gt(0)
                ? [{ accountId: codes.tax, debit: money(0), credit: invoice.taxAmount, memo: invoice.number }]
                : []),
            ]
          : [
              { accountId: codes.expense, debit: invoice.subtotal, credit: money(0), memo: invoice.number },
              ...(invoice.taxAmount.gt(0)
                ? [{ accountId: codes.tax, debit: invoice.taxAmount, credit: money(0), memo: invoice.number }]
                : []),
              { accountId: codes.ap, debit: money(0), credit: invoice.total, partyId: invoice.partyId, memo: invoice.number },
            ];
      if (!isBalanced(lines)) {
        throw new BadRequestException({ code: 'UNBALANCED_JOURNAL', message: 'Invoice journal is not balanced' });
      }
      const voucher = await this.postVoucher(tx, {
        tenantId,
        branchId: invoice.branchId,
        fiscalYearId: invoice.fiscalYearId,
        number: voucherNumber,
        type: invoice.kind === 'SALES' ? 'SALES' : 'PURCHASE',
        narration: `${invoice.kind} invoice ${invoice.number}`,
        lines,
      });
      return tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'POSTED', voucherId: voucher.id },
        include: { lines: true, voucher: { include: { lines: true } } },
      });
    });
  }

  async createPayment(user: AuthUser, dto: CreatePaymentDto) {
    const tenantId = requireTenantId(user);
    const checker = await this.makerChecker(tenantId);
    return this.prisma.$transaction(async (tx) => {
      const branch = await this.numbering.defaultBranch(tx, tenantId, dto.branchId);
      const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
      await this.assertUnlocked(tx, fiscal.id);
      const allocTotal = dto.allocations.reduce((sum, item) => sum.add(money(item.amount)), money(0));
      if (!allocTotal.eq(money(dto.amount))) {
        throw new BadRequestException({ code: 'ALLOCATION_MISMATCH', message: 'Allocations must equal payment amount' });
      }
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        documentType: 'PAY',
      });
      const payment = await tx.payment.create({
        data: {
          tenantId,
          branchId: branch.id,
          partyId: dto.partyId,
          number,
          amount: money(dto.amount),
          method: dto.method ?? 'BANK',
          status: checker ? 'PENDING_APPROVAL' : 'DRAFT',
          reference: dto.reference,
          allocations: {
            create: dto.allocations.map((item) => ({
              tenantId,
              invoiceId: item.invoiceId,
              amount: money(item.amount),
            })),
          },
        },
        include: { allocations: true },
      });
      if (!checker) {
        return this.postPaymentTx(tx, payment.id, tenantId);
      }
      return payment;
    });
  }

  async approvePayment(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction((tx) => this.postPaymentTx(tx, id, tenantId));
  }

  async createJournal(user: AuthUser, dto: CreateJournalDto) {
    const tenantId = requireTenantId(user);
    const lines = dto.lines.map((line) => ({
      accountId: line.accountId,
      debit: money(line.debit ?? 0),
      credit: money(line.credit ?? 0),
      memo: line.memo,
      costCentre: line.costCentre,
    }));
    if (!isBalanced(lines)) {
      throw new BadRequestException({ code: 'UNBALANCED_JOURNAL', message: 'Journal must balance' });
    }
    return this.prisma.$transaction(async (tx) => {
      const branch = await this.numbering.defaultBranch(tx, tenantId, dto.branchId);
      const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
      await this.assertUnlocked(tx, fiscal.id);
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        documentType: 'JV',
      });
      return this.postVoucher(tx, {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        number,
        type: 'JOURNAL',
        narration: dto.narration,
        lines,
      });
    });
  }

  async reverseVoucher(user: AuthUser, id: string) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findFirst({
        where: { id, tenantId },
        include: { lines: true },
      });
      if (!voucher || voucher.status !== 'POSTED') {
        throw new BadRequestException({ code: 'VOUCHER_NOT_REVERSIBLE', message: 'Only posted vouchers can be reversed' });
      }
      await this.assertUnlocked(tx, voucher.fiscalYearId);
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: voucher.branchId,
        fiscalYearId: voucher.fiscalYearId,
        documentType: 'JV',
      });
      const reversal = await this.postVoucher(tx, {
        tenantId,
        branchId: voucher.branchId,
        fiscalYearId: voucher.fiscalYearId,
        number,
        type: voucher.type,
        narration: `Reversal of ${voucher.number}`,
        reversesId: voucher.id,
        lines: voucher.lines.map((line) => ({
          accountId: line.accountId,
          partyId: line.partyId ?? undefined,
          debit: line.credit,
          credit: line.debit,
          memo: `REV ${line.memo ?? voucher.number}`,
        })),
      });
      await tx.voucher.update({ where: { id: voucher.id }, data: { status: 'REVERSED' } });
      return reversal;
    });
  }

  async trialBalance(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { tenantId, voucher: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { tenantId } });
    const byId = new Map(accounts.map((item) => [item.id, item]));
    const rows = grouped.map((row) => {
      const account = byId.get(row.accountId)!;
      const debit = money(row._sum.debit ?? 0);
      const credit = money(row._sum.credit ?? 0);
      return { code: account.code, name: account.name, type: account.type, debit, credit, balance: debit.sub(credit) };
    });
    return {
      rows: rows.sort((a, b) => a.code.localeCompare(b.code)),
      totals: {
        debit: rows.reduce((sum, row) => sum.add(row.debit), money(0)),
        credit: rows.reduce((sum, row) => sum.add(row.credit), money(0)),
      },
    };
  }

  async outstanding(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['POSTED', 'PARTIALLY_PAID'] }, kind: 'SALES' },
      include: { party: true },
    });
    const buckets = { current: money(0), d30: money(0), d60: money(0), d90: money(0) };
    const now = Date.now();
    const rows = invoices.map((invoice) => {
      const due = invoice.dueDate ?? invoice.invoiceDate;
      const days = Math.floor((now - due.getTime()) / 86400_000);
      const open = money(invoice.total).sub(invoice.paidAmount);
      if (days <= 0) {
        buckets.current = buckets.current.add(open);
      } else if (days <= 30) {
        buckets.d30 = buckets.d30.add(open);
      } else if (days <= 60) {
        buckets.d60 = buckets.d60.add(open);
      } else {
        buckets.d90 = buckets.d90.add(open);
      }
      return { id: invoice.id, number: invoice.number, party: invoice.party.name, open, days };
    });
    return { rows, buckets };
  }

  private async postPaymentTx(tx: Prisma.TransactionClient, paymentId: string, tenantId: string) {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, tenantId },
      include: { allocations: { include: { invoice: true } } },
    });
    if (!payment || payment.status === 'POSTED') {
      if (!payment) {
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
      }
      return payment;
    }
    const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
    await this.assertUnlocked(tx, fiscal.id);
    const codes = await this.systemAccounts(tx, tenantId);
    const cashAccount = payment.method === 'CASH' ? codes.cash : codes.bank;
    const voucherNumber = await this.numbering.next(tx, {
      tenantId,
      branchId: payment.branchId,
      fiscalYearId: fiscal.id,
      documentType: 'JV',
    });
    const voucher = await this.postVoucher(tx, {
      tenantId,
      branchId: payment.branchId,
      fiscalYearId: fiscal.id,
      number: voucherNumber,
      type: 'RECEIPT',
      narration: `Receipt ${payment.number}`,
      lines: [
        { accountId: cashAccount, debit: payment.amount, credit: money(0), memo: payment.number },
        { accountId: codes.ar, debit: money(0), credit: payment.amount, partyId: payment.partyId, memo: payment.number },
      ],
    });
    for (const alloc of payment.allocations) {
      const paid = money(alloc.invoice.paidAmount).add(alloc.amount);
      const status = paid.gte(alloc.invoice.total) ? 'PAID' : 'PARTIALLY_PAID';
      if (paid.gt(alloc.invoice.total)) {
        throw new BadRequestException({ code: 'OVER_ALLOCATION', message: 'Allocation exceeds invoice balance' });
      }
      await tx.invoice.update({ where: { id: alloc.invoiceId }, data: { paidAmount: paid, status } });
    }
    return tx.payment.update({
      where: { id: payment.id },
      data: { status: 'POSTED', voucherId: voucher.id },
      include: { allocations: true, voucher: { include: { lines: true } } },
    });
  }

  private async postVoucher(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      fiscalYearId: string;
      number: string;
      type: 'SALES' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL' | 'DEBIT_NOTE' | 'CREDIT_NOTE';
      narration: string;
      reversesId?: string;
      lines: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; partyId?: string; memo?: string; costCentre?: string }[];
    },
  ) {
    if (!isBalanced(input.lines)) {
      throw new BadRequestException({ code: 'UNBALANCED_JOURNAL', message: 'Journal must balance' });
    }
    return tx.voucher.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        fiscalYearId: input.fiscalYearId,
        number: input.number,
        type: input.type,
        status: 'POSTED',
        narration: input.narration,
        postedAt: new Date(),
        reversesId: input.reversesId,
        lines: {
          create: input.lines.map((line) => ({
            tenantId: input.tenantId,
            accountId: line.accountId,
            partyId: line.partyId,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo,
            costCentre: line.costCentre,
          })),
        },
      },
      include: { lines: true },
    });
  }

  private async systemAccounts(tx: Prisma.TransactionClient, tenantId: string) {
    const list = await tx.ledgerAccount.findMany({ where: { tenantId, isSystem: true } });
    const byCode = new Map(list.map((item) => [item.code, item.id]));
    const need = { ar: '1200', bank: '1100', cash: '1000', sales: '4000', tax: '2100', ap: '2000', expense: '6000' };
    const resolved: Record<string, string> = {};
    for (const [key, code] of Object.entries(need)) {
      const id = byCode.get(code);
      if (!id) {
        throw new BadRequestException({ code: 'COA_MISSING', message: `System account ${code} is not provisioned` });
      }
      resolved[key] = id;
    }
    return resolved as Record<keyof typeof need, string>;
  }

  private async assertUnlocked(tx: Prisma.TransactionClient, fiscalYearId: string) {
    const fiscal = await tx.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (fiscal?.isLocked) {
      throw new ForbiddenException({
        code: 'PERIOD_LOCKED',
        message: 'This fiscal year is locked; post a reversal or authorized adjustment',
      });
    }
  }

  private async assertCredit(tenantId: string, party: { id: string; creditLimit: Prisma.Decimal }, extra: Prisma.Decimal) {
    if (money(party.creditLimit).lte(0)) {
      return;
    }
    const open = await this.prisma.invoice.aggregate({
      where: { tenantId, partyId: party.id, kind: 'SALES', status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
      _sum: { total: true, paidAmount: true },
    });
    const outstanding = money(open._sum.total ?? 0).sub(open._sum.paidAmount ?? 0).add(extra);
    if (outstanding.gt(party.creditLimit)) {
      throw new ForbiddenException({
        code: 'CREDIT_LIMIT',
        message: 'Customer credit limit exceeded',
        details: { creditLimit: party.creditLimit, outstanding },
      });
    }
  }

  private async makerChecker(tenantId: string) {
    const setting = await this.prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: 'maker_checker_payments' } },
    });
    return Boolean((setting?.value as { enabled?: boolean } | null)?.enabled);
  }
}
