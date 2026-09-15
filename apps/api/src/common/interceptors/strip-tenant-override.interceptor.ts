import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class StripTenantOverrideInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ body?: Record<string, unknown>; query?: Record<string, unknown> }>();
    if (request.body && typeof request.body === 'object' && 'tenantId' in request.body) {
      delete request.body.tenantId;
    }
    if (request.query && typeof request.query === 'object' && 'tenantId' in request.query) {
      delete request.query.tenantId;
    }
    return next.handle();
  }
}
