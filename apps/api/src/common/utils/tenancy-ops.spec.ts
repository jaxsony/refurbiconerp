import { TenantGuard } from '../guards/tenant.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../decorators/current-user.decorator';

function contextWith(user: Partial<AuthUser>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('TEN-008 operations stay tenant-scoped', () => {
  it('blocks CRM and sales calls without tenant context', () => {
    const guard = new TenantGuard(new Reflector());
    expect(() =>
      guard.canActivate(
        contextWith({
          userId: 'u1',
          isPlatformAdmin: false,
          tenantId: null,
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
