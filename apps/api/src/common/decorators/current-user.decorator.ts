import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = {
  userId: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  tenantId: string | null;
  membershipId: string | null;
  permissions: string[];
  branchIds: string[] | null;
  sessionId: string;
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
