import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

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

  const swagger = new DocumentBuilder()
    .setTitle('Refurbicon ERP API')
    .setDescription('Multi-tenant business operations ERP — Phases 1–6. Requirement IDs from SRS v1.0.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document);
  SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });

  return prefix;
}

export async function createNestApp(): Promise<{ app: INestApplication; server: Express }> {
  const server = express();
  const app = await NestFactory.create(AppModule.forRoot(), new ExpressAdapter(server), {
    logger: process.env.VERCEL ? ['error', 'warn', 'log'] : undefined,
  });
  configureApp(app);
  return { app, server };
}
