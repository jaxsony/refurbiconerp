import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

function sanitizeMessage(message: string) {
  return message
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgresql://***@')
    .replace(/password=\S+/gi, 'password=***');
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId = request.correlationId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (typeof payload === 'object' && payload) {
        const body = payload as Record<string, unknown>;
        code = typeof body.code === 'string' ? body.code : exception.name;
        message =
          typeof body.message === 'string'
            ? body.message
            : Array.isArray(body.message)
              ? body.message.join(', ')
              : exception.message;
        details = body.details ?? body.message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = exception.code;
      message = sanitizeMessage(exception.message);
      if (exception.code === 'P2021' || exception.code === 'P2022') {
        message = 'Database schema is missing. Run npm run db:setup against the production database.';
      }
    } else if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientRustPanicError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      code = 'DATABASE_UNAVAILABLE';
      message = sanitizeMessage(exception.message);
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'DATABASE_VALIDATION';
      message = sanitizeMessage(exception.message);
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack);
      const name = exception.name || exception.constructor.name;
      if (name.startsWith('Prisma') || /database|econnrefused|enotfound|ssl|timeout/i.test(exception.message)) {
        code = 'DATABASE_UNAVAILABLE';
        message = sanitizeMessage(exception.message);
      }
    } else {
      this.logger.error(String(exception));
    }

    response.status(status).json({
      code,
      message,
      details,
      correlationId,
      retryable: status >= 500,
    });
  }
}
