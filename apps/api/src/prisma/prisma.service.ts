import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

function withActive(model: string, where: Record<string, unknown> | undefined) {
  const meta = Prisma.dmmf.datamodel.models.find((item) => item.name === model);
  if (!meta?.fields.some((field) => field.name === 'deletedAt')) {
    return where;
  }
  if (where && Object.prototype.hasOwnProperty.call(where, 'deletedAt')) {
    return where;
  }
  return { ...(where ?? {}), deletedAt: null };
}

export function createPrismaClient() {
  return new PrismaClient({
    log: process.env.VERCEL ? ['error'] : ['error', 'warn'],
  }).$extends({
    name: 'softDelete',
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          args.where = withActive(model, args.where as Record<string, unknown> | undefined);
          return query(args);
        },
        async findFirst({ model, args, query }) {
          args.where = withActive(model, args.where as Record<string, unknown> | undefined);
          return query(args);
        },
        async findFirstOrThrow({ model, args, query }) {
          args.where = withActive(model, args.where as Record<string, unknown> | undefined);
          return query(args);
        },
        async count({ model, args, query }) {
          args.where = withActive(model, args.where as Record<string, unknown> | undefined);
          return query(args);
        },
      },
    },
  });
}

export type AppPrisma = ReturnType<typeof createPrismaClient>;

@Injectable()
export class PrismaService extends PrismaClient {}
