import { ForbiddenException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { IsBoolean, IsEnum, IsString } from 'class-validator';

export const NOTIFICATION_QUEUE = 'notifications';

export class PreferenceDto {
  @IsString()
  eventKey!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private queue(): Queue | undefined {
    try {
      return this.moduleRef.get<Queue>(getQueueToken(NOTIFICATION_QUEUE), { strict: false });
    } catch {
      return undefined;
    }
  }

  private tenantId(user: AuthUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException({ code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context required' });
    }
    return user.tenantId;
  }

  list(user: AuthUser) {
    return this.prisma.notification.findMany({
      where: { tenantId: this.tenantId(user), userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(user: AuthUser, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, tenantId: this.tenantId(user), userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { tenantId: this.tenantId(user), userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  preferences(user: AuthUser) {
    return this.prisma.notificationPreference.findMany({
      where: { tenantId: this.tenantId(user), userId: user.userId },
    });
  }

  upsertPreference(user: AuthUser, dto: PreferenceDto) {
    const tenantId = this.tenantId(user);
    return this.prisma.notificationPreference.upsert({
      where: {
        tenantId_userId_eventKey_channel: {
          tenantId,
          userId: user.userId,
          eventKey: dto.eventKey,
          channel: dto.channel,
        },
      },
      update: { enabled: dto.enabled },
      create: { tenantId, userId: user.userId, ...dto },
    });
  }

  async notify(input: {
    tenantId: string;
    userId: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    correlationId?: string;
  }) {
    const idempotencyKey = `notify:${input.tenantId}:${input.userId}:${input.entityType ?? 'none'}:${input.entityId ?? input.title}`;
    await this.prisma.jobExecution.upsert({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
      update: {},
      create: {
        tenantId: input.tenantId,
        queue: 'notifications',
        jobName: 'in-app',
        idempotencyKey,
        correlationId: input.correlationId,
        payload: input,
      },
    });
    const queue = this.queue();
    if (queue) {
      try {
        await queue.add(
          'in-app',
          { ...input, idempotencyKey },
          { jobId: `${input.tenantId}:${idempotencyKey}`, removeOnComplete: 100 },
        );
        return;
      } catch {
        // Fall through to in-process delivery when Redis is unavailable.
      }
    }
    await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  }
}
