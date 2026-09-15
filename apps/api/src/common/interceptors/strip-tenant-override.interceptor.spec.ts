import { StripTenantOverrideInterceptor } from './strip-tenant-override.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('TEN-002 client payloads cannot override tenant context', () => {
  it('removes tenantId from body and query', (done) => {
    const interceptor = new StripTenantOverrideInterceptor();
    const request = { body: { tenantId: 'attacker-tenant', name: 'ok' }, query: { tenantId: 'attacker-tenant' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
    interceptor.intercept(context, { handle: () => of({ ok: true }) } as CallHandler).subscribe(() => {
      expect(request.body.tenantId).toBeUndefined();
      expect(request.body.name).toBe('ok');
      expect(request.query.tenantId).toBeUndefined();
      done();
    });
  });
});
