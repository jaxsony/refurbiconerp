import { PermissionsGuard } from './permissions.guard';
import { TenantGuard } from './tenant.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../decorators/current-user.decorator';

function contextWith(user: Partial<AuthUser>, handlerMeta: Record<string, unknown> = {}): ExecutionContext {
  const reflectorValues = handlerMeta;
  const ctx = {
    getHandler: () => reflectorValues,
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return ctx;
}

describe('TEN-001 tenant context', () => {
  it('rejects tenant-scoped calls without tenantId', () => {
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

describe('TEN-008 permissions cannot elevate across roles', () => {
  it('denies missing permission keys', () => {
    const reflector = {
      getAllAndOverride: () => ['users:administer'],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() =>
      guard.canActivate(
        contextWith({
          userId: 'u1',
          isPlatformAdmin: false,
          tenantId: 't1',
          permissions: ['users:view'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
