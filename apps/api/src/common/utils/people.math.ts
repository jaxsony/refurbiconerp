import { money } from './money';

export function attendancePaidDay(status: string) {
  if (status === 'ABSENT' || status === 'WEEKLY_OFF' || status === 'HOLIDAY') {
    return money(0);
  }
  if (status === 'HALF_DAY') {
    return money(0.5);
  }
  return money(1);
}

export function payrollLine(input: {
  workingDays: number;
  paidDays: number;
  earnings: number;
  deductions: number;
  incentives: number;
}) {
  const ratio = input.workingDays <= 0 ? 0 : input.paidDays / input.workingDays;
  const earnings = money(input.earnings).mul(ratio).toDecimalPlaces(2);
  const deductions = money(input.deductions).toDecimalPlaces(2);
  const incentives = money(input.incentives).toDecimalPlaces(2);
  return {
    paidDays: money(input.paidDays),
    earnings,
    deductions,
    incentives,
    netPay: earnings.add(incentives).sub(deductions),
  };
}

export function incentiveAmount(input: {
  formula: 'FIXED' | 'PERCENTAGE' | 'SLAB' | 'TARGET' | 'MARGIN' | 'SCORE';
  rate: number;
  base: number;
  cancelled?: boolean;
  unpaid?: boolean;
  holdUntilPaid?: boolean;
  slabs?: { upto: number; rate: number }[];
}) {
  if (input.cancelled) {
    return { amount: money(0), status: 'REVERSED' as const, reason: 'excluded_cancelled' };
  }
  if (input.unpaid && input.holdUntilPaid) {
    return { amount: money(0), status: 'HELD' as const, reason: 'awaiting_payment' };
  }
  if (input.formula === 'FIXED') {
    return { amount: money(input.rate), status: 'CALCULATED' as const };
  }
  if (input.formula === 'PERCENTAGE' || input.formula === 'MARGIN' || input.formula === 'SCORE') {
    return { amount: money(input.base).mul(input.rate).div(100).toDecimalPlaces(2), status: 'CALCULATED' as const };
  }
  if (input.formula === 'SLAB') {
    const slab = [...(input.slabs ?? [])].sort((a, b) => a.upto - b.upto).find((item) => input.base <= item.upto);
    const rate = slab?.rate ?? input.rate;
    return { amount: money(input.base).mul(rate).div(100).toDecimalPlaces(2), status: 'CALCULATED' as const };
  }
  return { amount: money(input.base).gte(input.rate) ? money(input.base).mul(0.02).toDecimalPlaces(2) : money(0), status: 'CALCULATED' as const };
}

export function nextOccurrenceKey(scheduleId: string, runAt: Date) {
  return `${scheduleId}:${runAt.toISOString().slice(0, 10)}`;
}

export function advanceScheduleDate(from: Date, frequency: string, interval: number) {
  const next = new Date(from);
  const step = Math.max(1, interval);
  if (frequency === 'WEEKLY') {
    next.setUTCDate(next.getUTCDate() + 7 * step);
  } else if (frequency === 'MONTHLY') {
    next.setUTCMonth(next.getUTCMonth() + step);
  } else if (frequency === 'QUARTERLY') {
    next.setUTCMonth(next.getUTCMonth() + 3 * step);
  } else if (frequency === 'ANNUAL') {
    next.setUTCFullYear(next.getUTCFullYear() + step);
  } else {
    next.setUTCDate(next.getUTCDate() + step);
  }
  return next;
}
