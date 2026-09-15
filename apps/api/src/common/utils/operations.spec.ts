import { money, priceLine, isBalanced, sumLines } from './money';
import { normalizeEmail, normalizePhone, normalizeTaxId } from './normalize';

describe('SAL-006 line pricing', () => {
  it('applies discount then GST', () => {
    const line = priceLine({ qty: 2, unitPrice: 1000, discountPct: 10, taxRate: 18 });
    expect(line.lineSubtotal.toFixed(2)).toBe('1800.00');
    expect(line.taxAmount.toFixed(2)).toBe('324.00');
    expect(line.lineTotal.toFixed(2)).toBe('2124.00');
  });

  it('sums a quote without re-entry drift', () => {
    const totals = sumLines([
      priceLine({ qty: 1, unitPrice: 12000, taxRate: 18 }),
      priceLine({ qty: 1, unitPrice: 499, taxRate: 18 }),
    ]);
    expect(totals.subtotal.toFixed(2)).toBe('12499.00');
    expect(totals.total.toFixed(2)).toBe('14748.82');
  });
});

describe('SAL-003 duplicate keys', () => {
  it('normalizes Indian mobile numbers and GSTIN', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(normalizeEmail('  Buy@Northwind.DEMO ')).toBe('buy@northwind.demo');
    expect(normalizeTaxId('27AAPFU0939F1ZV')).toBe('27AAPFU0939F1ZV');
  });
});

describe('ACC-003 balanced journals', () => {
  it('accepts a sales invoice posting', () => {
    expect(
      isBalanced([
        { debit: money(14748.82), credit: 0 },
        { debit: 0, credit: money(12499) },
        { debit: 0, credit: money(2249.82) },
      ]),
    ).toBe(true);
  });

  it('rejects an unbalanced voucher', () => {
    expect(isBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 90 }])).toBe(false);
  });
});

describe('INV-004 negative stock policy', () => {
  it('treats available as on-hand minus reserved', () => {
    const onHand = money(10);
    const reserved = money(8);
    const available = onHand.sub(reserved);
    expect(available.sub(3).isNegative()).toBe(true);
  });
});
