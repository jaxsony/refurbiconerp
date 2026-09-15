import { Prisma } from '@prisma/client';

export function money(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

export function qty(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(4);
}

export type LineInput = {
  qty: number | string;
  unitPrice: number | string;
  discountPct?: number | string;
  taxRate?: number | string;
};

export type LineTotals = {
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountPct: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

export function priceLine(input: LineInput): LineTotals {
  const q = qty(input.qty);
  const unit = money(input.unitPrice);
  const discountPct = money(input.discountPct ?? 0);
  const taxRate = money(input.taxRate ?? 0);
  const gross = q.mul(unit).toDecimalPlaces(2);
  const discount = gross.mul(discountPct).div(100).toDecimalPlaces(2);
  const lineSubtotal = gross.sub(discount);
  const taxAmount = lineSubtotal.mul(taxRate).div(100).toDecimalPlaces(2);
  return {
    qty: q,
    unitPrice: unit,
    discountPct,
    taxRate,
    lineSubtotal,
    taxAmount,
    lineTotal: lineSubtotal.add(taxAmount),
  };
}

export function sumLines(lines: LineTotals[]) {
  return lines.reduce(
    (acc, line) => {
      const gross = line.qty.mul(line.unitPrice).toDecimalPlaces(2);
      return {
        subtotal: acc.subtotal.add(line.lineSubtotal),
        discountAmount: acc.discountAmount.add(gross.sub(line.lineSubtotal)),
        taxAmount: acc.taxAmount.add(line.taxAmount),
        total: acc.total.add(line.lineTotal),
      };
    },
    { subtotal: money(0), discountAmount: money(0), taxAmount: money(0), total: money(0) },
  );
}

export function isBalanced(lines: { debit: Prisma.Decimal | number | string; credit: Prisma.Decimal | number | string }[]): boolean {
  const debit = lines.reduce((sum, line) => sum.add(money(line.debit)), money(0));
  const credit = lines.reduce((sum, line) => sum.add(money(line.credit)), money(0));
  return debit.eq(credit);
}
