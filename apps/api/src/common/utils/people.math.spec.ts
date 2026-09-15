import { attendancePaidDay, incentiveAmount, nextOccurrenceKey, payrollLine, advanceScheduleDate } from './people.math';
import { money } from './money';

describe('HR-007 payroll proration', () => {
  it('scales earnings by paid days and keeps deductions intact', () => {
    const line = payrollLine({ workingDays: 26, paidDays: 13, earnings: 40000, deductions: 4800, incentives: 200 });
    expect(line.earnings.toFixed(2)).toBe('20000.00');
    expect(line.deductions.toFixed(2)).toBe('4800.00');
    expect(line.incentives.toFixed(2)).toBe('200.00');
    expect(line.netPay.toFixed(2)).toBe('15400.00');
  });
});

describe('HR-003 attendance paid day', () => {
  it('pays a late day in full and a half day at 0.5', () => {
    expect(attendancePaidDay('LATE').toFixed(2)).toBe('1.00');
    expect(attendancePaidDay('HALF_DAY').toFixed(2)).toBe('0.50');
    expect(attendancePaidDay('ABSENT').toFixed(2)).toBe('0.00');
  });
});

describe('INC-002 hold until paid', () => {
  it('holds unpaid collections when the scheme requires it', () => {
    const held = incentiveAmount({ formula: 'PERCENTAGE', rate: 2, base: 0, unpaid: true, holdUntilPaid: true });
    expect(held.status).toBe('HELD');
    expect(held.amount.toFixed(2)).toBe('0.00');
  });

  it('pays percentage of collected base', () => {
    const paid = incentiveAmount({ formula: 'PERCENTAGE', rate: 2, base: 10000, unpaid: false, holdUntilPaid: true });
    expect(paid.status).toBe('CALCULATED');
    expect(paid.amount.toFixed(2)).toBe('200.00');
  });
});

describe('REC-002 occurrence key', () => {
  it('is unique per schedule and calendar day', () => {
    const key = nextOccurrenceKey('sch-1', new Date('2026-09-15T10:00:00.000Z'));
    expect(key).toBe('sch-1:2026-09-15');
    expect(nextOccurrenceKey('sch-1', new Date('2026-09-15T23:00:00.000Z'))).toBe(key);
  });

  it('advances monthly without duplicating the same day key', () => {
    const start = new Date('2026-09-15T00:00:00.000Z');
    const next = advanceScheduleDate(start, 'MONTHLY', 1);
    expect(nextOccurrenceKey('sch-1', next)).not.toBe(nextOccurrenceKey('sch-1', start));
    expect(next.getUTCMonth()).toBe(9);
  });
});
