import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccessTokenPayload } from './jwt.strategy';
import { LoginDto, SwitchTenantDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { tenant: true, roles: { include: { role: true } } },
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }
    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    const preferred =
      user.memberships.length === 1
        ? user.memberships[0]
        : user.memberships.find((item) => item.tenant.status === 'ACTIVE') ?? user.memberships[0] ?? null;

    let tenantId: string | null = preferred?.tenantId ?? null;
    if (!tenantId && user.isPlatformAdmin) {
      tenantId = await this.defaultTenantId();
    }

    const tokens = await this.issueSession({
      userId: user.id,
      email: user.email,
      tenantId,
      meta,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        actorUserId: user.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      ...tokens,
      requiresTenantSelection: !user.isPlatformAdmin && user.memberships.length !== 1 && !tenantId,
      user: await this.publicProfile(user.id, tenantId),
    };
  }

  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
    const hash = this.hashToken(refreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: 'Refresh token is not valid' });
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession({
      userId: session.userId,
      email: session.user.email,
      tenantId: session.tenantId,
      familyId: session.familyId,
      meta,
    });
  }

  async logout(sessionId: string) {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async switchTenant(user: AuthUser, dto: SwitchTenantDto, meta: { ip?: string; userAgent?: string }) {
    if (!user.isPlatformAdmin) {
      const membership = await this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: dto.tenantId, userId: user.userId } },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenException({ code: 'TENANT_FORBIDDEN', message: 'You are not a member of this tenant' });
      }
    } else {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
      if (!tenant) {
        throw new ForbiddenException({ code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
      }
    }

    await this.prisma.userSession.updateMany({
      where: { id: user.sessionId },
      data: { revokedAt: new Date() },
    });

    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    const tokens = await this.issueSession({
      userId: dbUser.id,
      email: dbUser.email,
      tenantId: dto.tenantId,
      meta,
    });

    await this.prisma.auditEvent.create({
      data: {
        tenantId: dto.tenantId,
        actorUserId: user.userId,
        action: 'SWITCH_TENANT',
        entityType: 'Tenant',
        entityId: dto.tenantId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      ...tokens,
      user: await this.publicProfile(user.userId, dto.tenantId),
    };
  }

  async me(user: AuthUser) {
    return this.publicProfile(user.userId, user.tenantId);
  }

  async resolveAccessUser(payload: AccessTokenPayload): Promise<AuthUser> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid access token' });
    }
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
                branchScopes: true,
              },
            },
          },
        },
      },
    });
    if (!session || session.revokedAt || !session.user.isActive) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session is no longer valid' });
    }
    if (session.userId !== payload.sub) {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Token subject mismatch' });
    }

    let tenantId = payload.tenantId ?? session.tenantId ?? null;
    if (!tenantId && session.user.isPlatformAdmin) {
      tenantId = await this.defaultTenantId();
    }
    if (tenantId && session.tenantId !== tenantId) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { tenantId },
      });
    }

    const membership = tenantId
      ? session.user.memberships.find((item) => item.tenantId === tenantId && item.status === 'ACTIVE')
      : undefined;

    if (tenantId && !session.user.isPlatformAdmin && !membership) {
      throw new UnauthorizedException({ code: 'TENANT_CONTEXT_INVALID', message: 'Tenant context is not valid' });
    }

    const permissions = session.user.isPlatformAdmin
      ? ['*']
      : [...new Set(membership?.roles.flatMap((item) => item.role.permissions.map((p) => p.permission.key)) ?? [])];

    const branchIds = membership
      ? membership.branchScopes.length
        ? membership.branchScopes.map((item) => item.branchId)
        : null
      : null;

    return {
      userId: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      isPlatformAdmin: session.user.isPlatformAdmin,
      tenantId,
      membershipId: membership?.id ?? null,
      permissions,
      branchIds,
      sessionId: session.id,
    };
  }

  async publicProfile(userId: string, tenantId: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: { in: ['ACTIVE', 'INVITED'] } },
          include: {
            tenant: { select: { id: true, name: true, slug: true, status: true, currency: true, timezone: true, locale: true } },
            roles: { include: { role: { select: { code: true, name: true } } } },
            department: { select: { id: true, name: true, code: true } },
            defaultBranch: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    const current = tenantId ? user.memberships.find((item) => item.tenantId === tenantId) : null;
    const tenantSelect = { id: true, name: true, slug: true, status: true, currency: true, timezone: true, locale: true } as const;
    const currentTenant =
      current?.tenant ??
      (tenantId
        ? await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: tenantSelect,
          })
        : null);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId,
      currentTenant,
      roles: current?.roles.map((item) => item.role) ?? [],
      department: current?.department ?? null,
      defaultBranch: current?.defaultBranch ?? null,
      memberships: user.memberships.map((item) => ({
        tenant: item.tenant,
        status: item.status,
        roles: item.roles.map((role) => role.role),
      })),
    };
  }

  private async issueSession(input: {
    userId: string;
    email: string;
    tenantId: string | null;
    familyId?: string;
    meta: { ip?: string; userAgent?: string };
  }) {
    const refreshToken = randomUUID() + randomUUID();
    const session = await this.prisma.userSession.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        refreshTokenHash: this.hashToken(refreshToken),
        familyId: input.familyId ?? randomUUID(),
        ip: input.meta.ip,
        userAgent: input.meta.userAgent,
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: input.userId,
        email: input.email,
        tenantId: input.tenantId,
        sessionId: session.id,
        typ: 'access',
      } satisfies AccessTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: 15 * 60,
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    };
  }

  private async defaultTenantId(): Promise<string | null> {
    const first = await this.prisma.tenant.findFirst({
      where: { status: { notIn: ['SUSPENDED', 'CLOSED'] } },
      orderBy: { createdAt: 'asc' },
    });
    return first?.id ?? null;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlMs(): number {
    return 30 * 24 * 60 * 60 * 1000;
  }
}
