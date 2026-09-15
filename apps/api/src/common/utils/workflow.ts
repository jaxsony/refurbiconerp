import { BadRequestException, NotFoundException } from '@nestjs/common';

export const TICKET_STEPS = [
  'RECEIVED',
  'INSPECTION',
  'ESTIMATE',
  'CUSTOMER_APPROVAL',
  'REPAIR',
  'QUALITY_CHECK',
  'READY_FOR_DISPATCH',
  'DELIVERED',
] as const;

export const TASK_STEPS = ['OPEN', 'IN_PROGRESS', 'DONE'] as const;

export type WorkKind = 'TICKET' | 'TASK';

const includeEmployee = { employee: { select: { id: true, name: true, code: true, phone: true, email: true } } };

export async function requireEmployee(prisma: any, tenantId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId, status: 'ACTIVE' },
  });
  if (!employee) {
    throw new BadRequestException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Choose an active company employee' });
  }
  return employee;
}

export async function listAssignments(prisma: any, tenantId: string, kind: WorkKind, recordId: string) {
  return prisma.workAssignment.findMany({
    where: { tenantId, kind, recordId },
    include: includeEmployee,
    orderBy: { allottedAt: 'asc' },
  });
}

export async function openAssignment(prisma: any, tenantId: string, kind: WorkKind, recordId: string, step: string) {
  return prisma.workAssignment.findFirst({
    where: { tenantId, kind, recordId, step, completedAt: null },
    include: includeEmployee,
    orderBy: { allottedAt: 'desc' },
  });
}

export async function allotWork(
  prisma: any,
  input: {
    tenantId: string;
    kind: WorkKind;
    recordId: string;
    step: string;
    employeeId: string;
    allottedBy: string;
    notes?: string;
  },
) {
  const employee = await requireEmployee(prisma, input.tenantId, input.employeeId);
  await prisma.workAssignment.updateMany({
    where: { tenantId: input.tenantId, kind: input.kind, recordId: input.recordId, step: input.step, completedAt: null },
    data: { completedAt: new Date(), notes: 'Reassigned' },
  });
  const assignment = await prisma.workAssignment.create({
    data: {
      tenantId: input.tenantId,
      kind: input.kind,
      recordId: input.recordId,
      step: input.step,
      employeeId: employee.id,
      allottedBy: input.allottedBy,
      notes: input.notes,
    },
    include: includeEmployee,
  });
  return { employee, assignment };
}

export async function completeOpenAssignment(
  prisma: any,
  input: { tenantId: string; kind: WorkKind; recordId: string; step: string; completedBy: string; notes?: string },
) {
  const open = await openAssignment(prisma, input.tenantId, input.kind, input.recordId, input.step);
  if (!open) {
    throw new BadRequestException({
      code: 'ALLOT_REQUIRED',
      message: 'Allot an employee to this step before marking it done',
    });
  }
  return prisma.workAssignment.update({
    where: { id: open.id },
    data: { completedAt: new Date(), completedBy: input.completedBy, notes: input.notes ?? open.notes },
    include: includeEmployee,
  });
}

export function unknownRecord(name: string): never {
  throw new NotFoundException({ code: 'NOT_FOUND', message: `${name} not found` });
}
