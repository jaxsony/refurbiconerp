import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

function restoreVercelRewriteUrl(req: Request, _res: Response, next: NextFunction) {
  const prefix = `/${process.env.API_PREFIX ?? 'api/v1'}`;
  const current = (req.url ?? '/').split('?')[0];
  if (
    current === prefix ||
    current.startsWith(`${prefix}/`) ||
    current === '/docs' ||
    current.startsWith('/docs/')
  ) {
    next();
    return;
  }

  const candidates = [
    req.headers['x-forwarded-uri'],
    req.headers['x-invoke-path'],
    req.headers['x-matched-path'],
    req.originalUrl,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const path = candidate.split('?')[0];
    if (path === prefix || path.startsWith(`${prefix}/`) || path === '/docs' || path.startsWith('/docs/')) {
      const queryIndex = (req.url ?? '').indexOf('?');
      const query =
        queryIndex >= 0
          ? (req.url ?? '').slice(queryIndex)
          : candidate.includes('?')
            ? candidate.slice(candidate.indexOf('?'))
            : '';
      req.url = path + query;
      break;
    }
  }
  next();
}

export function configureApp(app: INestApplication): string {
  const prefix = process.env.API_PREFIX ?? 'api/v1';
  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const configured = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const extras = [
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
        process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : '',
      ].filter(Boolean);
      const allowed = new Set([...configured, ...extras]);
      if (allowed.has(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  if (!process.env.VERCEL || process.env.ENABLE_SWAGGER === 'true') {
    const swagger = new DocumentBuilder()
      .setTitle('Refurbicon ERP API')
      .setDescription('Multi-tenant business operations ERP — Phases 1–6. Requirement IDs from SRS v1.0.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('docs', app, document);
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
  }

  return prefix;
}

function assertRequiredEnv() {
  const missing = ['DATABASE_URL', 'JWT_ACCESS_SECRET'].filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export async function createNestApp(): Promise<{ app: INestApplication; server: Express }> {
  assertRequiredEnv();
  const server = express();
  server.use(restoreVercelRewriteUrl);
  const app = await NestFactory.create(AppModule.forRoot(), new ExpressAdapter(server), {
    logger: process.env.VERCEL ? ['error', 'warn', 'log'] : undefined,
  });
  configureApp(app);
  return { app, server };
}
