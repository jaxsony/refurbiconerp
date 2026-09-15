import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../decorators/current-user.decorator';

export function requireTenantId(user: AuthUser): string {
  if (!user.tenantId) {
    throw new ForbiddenException({ code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context required' });
  }
  return user.tenantId;
}
