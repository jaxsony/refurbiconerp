import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Missing identity' });
    }
    if (user.isPlatformAdmin) {
      return true;
    }
    const ok = required.every((permission) => user.permissions.includes(permission));
    if (!ok) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSION',
        message: 'You do not have permission for this action',
        details: required,
      });
    }
    return true;
  }
}
