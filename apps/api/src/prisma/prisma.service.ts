import { lookup } from 'node:dns/promises';
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

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

function parseDatabaseUrl(raw: string) {
  const parsed = new URL(raw);
  const schema = parsed.searchParams.get('schema') ?? 'public';
  const sslMode = parsed.searchParams.get('sslmode');
  const useSsl =
    sslMode === 'require' ||
    sslMode === 'no-verify' ||
    parsed.hostname.includes('supabase') ||
    parsed.hostname.includes('pooler.supabase.com');
  return {
    hostname: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent((parsed.pathname || '/postgres').replace(/^\//, '') || 'postgres'),
    schema,
    useSsl,
  };
}

async function resolveHost(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  const ipv4 = records.find((item) => item.family === 4);
  const ipv6 = records.find((item) => item.family === 6);
  const picked = ipv4 ?? ipv6;
  if (!picked) {
    throw new Error(`No DNS records found for ${hostname}`);
  }
  return picked;
}

let sharedPool: Pool | undefined;

export async function createPrismaClient() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }
  const parsed = parseDatabaseUrl(raw);
  const serverless = Boolean(process.env.VERCEL);
  if (!sharedPool) {
    const host = await resolveHost(parsed.hostname);
    sharedPool = new Pool({
      host: host.address,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      max: serverless ? 1 : 8,
      idleTimeoutMillis: serverless ? 5_000 : 30_000,
      connectionTimeoutMillis: 4_000,
      allowExitOnIdle: true,
      ssl: parsed.useSsl ? { rejectUnauthorized: false, servername: parsed.hostname } : undefined,
    });
  }
  const adapter = new PrismaPg(sharedPool, { schema: parsed.schema });
  return new PrismaClient({
    adapter,
    log: serverless ? ['error'] : ['error', 'warn'],
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

export type AppPrisma = ReturnType<typeof createPrismaClient> extends Promise<infer T> ? T : never;

@Injectable()
export class PrismaService extends PrismaClient {}
