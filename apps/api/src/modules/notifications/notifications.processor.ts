import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_QUEUE } from './notifications.service';

@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ tenantId: string; userId: string; title: string; body: string; entityType?: string; entityId?: string; idempotencyKey: string }>) {
    const data = job.data;
    await this.prisma.notification.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        title: data.title,
        body: data.body,
        entityType: data.entityType,
        entityId: data.entityId,
      },
    });
    await this.prisma.jobExecution.updateMany({
      where: { tenantId: data.tenantId, idempotencyKey: data.idempotencyKey },
      data: { status: 'COMPLETED', completedAt: new Date(), attempts: job.attemptsMade + 1 },
    });
  }
}
