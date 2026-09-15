import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ONLY_KEY } from '../decorators/platform-only.decorator';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      return true;
    }
    if (platformOnly) {
      if (!user.isPlatformAdmin) {
        throw new ForbiddenException({ code: 'PLATFORM_ONLY', message: 'Platform administrator required' });
      }
      return true;
    }
    if (skipTenant) {
      return true;
    }
    if (user.isPlatformAdmin && !user.tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'Select a tenant context before accessing tenant data',
      });
    }
    if (!user.tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'An active tenant context is required',
      });
    }
    return true;
  }
}
