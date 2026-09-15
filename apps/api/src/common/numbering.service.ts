import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class NumberingService {
  async next(
    tx: Pick<Prisma.TransactionClient, 'documentSequence'>,
    input: { tenantId: string; branchId: string; fiscalYearId: string; documentType: string },
  ): Promise<string> {
    const existing = await tx.documentSequence.findUnique({
      where: {
        tenantId_branchId_fiscalYearId_documentType: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          fiscalYearId: input.fiscalYearId,
          documentType: input.documentType,
        },
      },
    });
    const sequence =
      existing ??
      (await tx.documentSequence.create({
        data: {
          ...input,
          prefix: `${input.documentType}-`,
          nextNumber: 1,
          padding: 5,
        },
      }));
    const updated = await tx.documentSequence.update({
      where: { id: sequence.id },
      data: { nextNumber: { increment: 1 } },
    });
    const current = updated.nextNumber - 1;
    return `${updated.prefix}${String(current).padStart(updated.padding, '0')}`;
  }

  async currentFiscalYear(tx: Pick<Prisma.TransactionClient, 'fiscalYear'>, tenantId: string) {
    const fiscal = await tx.fiscalYear.findFirst({
      where: { tenantId, isCurrent: true },
      orderBy: { startsOn: 'desc' },
    });
    if (!fiscal) {
      throw new NotFoundException({ code: 'FISCAL_YEAR_MISSING', message: 'No current fiscal year' });
    }
    return fiscal;
  }

  async defaultBranch(tx: Pick<Prisma.TransactionClient, 'branch'>, tenantId: string, branchId?: string) {
    if (branchId) {
      const branch = await tx.branch.findFirst({ where: { id: branchId, tenantId } });
      if (!branch) {
        throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
      }
      return branch;
    }
    const branch = await tx.branch.findFirst({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'No branch for tenant' });
    }
    return branch;
  }
}
