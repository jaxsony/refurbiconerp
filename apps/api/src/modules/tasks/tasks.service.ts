import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecurrenceFrequency, TaskPriority, TaskStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireTenantId } from '../../common/utils/tenant';
import { NotificationsService } from '../notifications/notifications.service';
import { pageOf, paging, PageQuery } from '../../common/utils/paging';
import { allotWork, completeOpenAssignment, listAssignments } from '../../common/utils/workflow';

export class CreateTaskDto {
  @IsString()
  title!: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @IsOptional()
  @IsString()
  ownerUserId?: string;
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  departmentId?: string;
  @IsOptional()
  @IsDateString()
  dueAt?: string;
  @IsOptional()
  @IsDateString()
  slaDueAt?: string;
  @IsOptional()
  @IsString()
  linkedEntityType?: string;
  @IsOptional()
  @IsString()
  linkedEntityId?: string;
  @IsOptional()
  @IsString()
  parentId?: string;
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @IsOptional()
  @IsString()
  ownerUserId?: string;
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class ChecklistDto {
  @IsString()
  label!: string;
}

export class CommentDto {
  @IsString()
  body!: string;
}

export class TimeLogDto {
  @IsInt()
  @Min(1)
  minutes!: number;
  @IsDateString()
  workDate!: string;
  @IsOptional()
  @IsString()
  note?: string;
}

export class AllotWorkDto {
  @IsString()
  employeeId!: string;
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteWorkDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecurringTaskDto {
  @IsString()
  title!: string;
  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;
  @IsOptional()
  @IsInt()
  @Min(1)
  interval?: number;
  @IsDateString()
  nextRunAt!: string;
  @IsOptional()
  @IsString()
  ownerUserId?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, query: { view?: string; status?: TaskStatus; ownerUserId?: string } & PageQuery) {
    const tenantId = requireTenantId(user);
    const { skip, take, page, pageSize, q } = paging(query);
    const where = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { number: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: { checklist: true, watchers: true, timeLogs: true, owner: { select: { id: true, displayName: true } } },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.task.count({ where }),
    ]);
    const withPeople = await Promise.all(
      items.map(async (task) => ({
        ...task,
        assignments: await listAssignments(this.prisma, tenantId, 'TASK', task.id),
      })),
    );
    return pageOf(withPeople, total, page, pageSize);
  }

  async board(user: AuthUser) {
    const page = await this.list(user, { pageSize: 200 });
    const tasks = page.items;
    return {
      view: 'board',
      columns: Object.values(TaskStatus).map((status) => ({
        status,
        tasks: tasks.filter((task) => task.status === status),
      })),
    };
  }

  async calendar(user: AuthUser) {
    const page = await this.list(user, { pageSize: 200 });
    const tasks = page.items;
    return {
      view: 'calendar',
      items: tasks
        .filter((task) => task.dueAt)
        .map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt, status: task.status })),
    };
  }

  async workload(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const tasks = await this.prisma.task.findMany({
      where: { tenantId, status: { notIn: ['DONE', 'CANCELLED'] } },
      include: { owner: { select: { id: true, displayName: true } } },
    });
    const now = new Date();
    const byOwner = new Map<string, { ownerUserId: string; name: string; open: number; overdue: number }>();
    for (const task of tasks) {
      const key = task.ownerUserId ?? 'unassigned';
      const row = byOwner.get(key) ?? {
        ownerUserId: key,
        name: task.owner?.displayName ?? 'Unassigned',
        open: 0,
        overdue: 0,
      };
      row.open += 1;
      if (task.dueAt && task.dueAt < now) {
        row.overdue += 1;
      }
      byOwner.set(key, row);
    }
    return { view: 'workload', rows: [...byOwner.values()] };
  }

  async get(user: AuthUser, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId: requireTenantId(user) },
      include: {
        checklist: { orderBy: { sortOrder: 'asc' } },
        comments: { include: { author: { select: { displayName: true, email: true } } }, orderBy: { createdAt: 'asc' } },
        watchers: true,
        timeLogs: true,
        blockedBy: true,
        children: true,
      },
    });
    if (!task) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found' });
    }
    return {
      ...task,
      assignments: await listAssignments(this.prisma, task.tenantId, 'TASK', task.id),
    };
  }

  async allot(user: AuthUser, id: string, dto: AllotWorkDto) {
    const task = await this.get(user, id);
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'TASK_CLOSED', message: 'Task is closed' });
    }
    const { employee } = await allotWork(this.prisma, {
      tenantId: task.tenantId,
      kind: 'TASK',
      recordId: task.id,
      step: task.status,
      employeeId: dto.employeeId,
      allottedBy: user.userId,
      notes: dto.notes,
    });
    await this.prisma.task.update({
      where: { id: task.id },
      data: { ownerUserId: employee.userId ?? task.ownerUserId },
    });
    return this.get(user, id);
  }

  async completeStep(user: AuthUser, id: string, dto: CompleteWorkDto) {
    const task = await this.get(user, id);
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'TASK_CLOSED', message: 'Task is closed' });
    }
    await completeOpenAssignment(this.prisma, {
      tenantId: task.tenantId,
      kind: 'TASK',
      recordId: task.id,
      step: task.status,
      completedBy: user.userId,
      notes: dto.notes,
    });
    const next = task.status === 'OPEN' || task.status === 'BLOCKED' ? 'IN_PROGRESS' : 'DONE';
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: next, completedAt: next === 'DONE' ? new Date() : null },
    });
    return this.get(user, id);
  }

  async create(user: AuthUser, dto: CreateTaskDto) {
    const tenantId = requireTenantId(user);
    return this.prisma.$transaction(async (tx) => {
      const branch = await this.numbering.defaultBranch(tx, tenantId, dto.branchId);
      const fiscal = await this.numbering.currentFiscalYear(tx, tenantId);
      const number = await this.numbering.next(tx, {
        tenantId,
        branchId: branch.id,
        fiscalYearId: fiscal.id,
        documentType: 'TASK',
      });
      const slaHours = await this.escalateHours(tx, tenantId);
      const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
      const task = await tx.task.create({
        data: {
          tenantId,
          number,
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? 'NORMAL',
          ownerUserId: dto.ownerUserId ?? user.userId,
          createdByUserId: user.userId,
          branchId: branch.id,
          departmentId: dto.departmentId,
          dueAt,
          slaDueAt: dto.slaDueAt ? new Date(dto.slaDueAt) : dueAt ? new Date(dueAt.getTime() + slaHours * 3600_000) : undefined,
          linkedEntityType: dto.linkedEntityType,
          linkedEntityId: dto.linkedEntityId,
          parentId: dto.parentId,
        },
      });
      await tx.taskWatcher.createMany({
        data: [
          { tenantId, taskId: task.id, userId: user.userId },
          ...(dto.ownerUserId && dto.ownerUserId !== user.userId
            ? [{ tenantId, taskId: task.id, userId: dto.ownerUserId }]
            : []),
        ],
        skipDuplicates: true,
      });
      return task;
    }).then(async (task) => {
      if (dto.employeeId) {
        await this.allot(user, task.id, { employeeId: dto.employeeId });
      }
      if (task.ownerUserId) {
        await this.notifications.notify({
          tenantId: task.tenantId,
          userId: task.ownerUserId,
          title: 'Task assigned',
          body: task.title,
          entityType: 'Task',
          entityId: task.id,
        });
      }
      return this.get(user, task.id);
    });
  }

  async fromEntity(user: AuthUser, dto: CreateTaskDto) {
    if (!dto.linkedEntityType || !dto.linkedEntityId) {
      throw new BadRequestException({ code: 'LINK_REQUIRED', message: 'linkedEntityType and linkedEntityId are required' });
    }
    return this.create(user, dto);
  }

  async update(user: AuthUser, id: string, dto: UpdateTaskDto) {
    const existing = await this.get(user, id);
    const completedAt = dto.status === 'DONE' ? new Date() : dto.status ? null : existing.completedAt;
    const task = await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        ownerUserId: dto.ownerUserId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        completedAt,
      },
    });
    if (dto.status === 'DONE' && task.ownerUserId) {
      await this.notifications.notify({
        tenantId: task.tenantId,
        userId: task.ownerUserId,
        title: 'Task completed',
        body: task.title,
        entityType: 'Task',
        entityId: task.id,
      });
    }
    return task;
  }

  async addChecklist(user: AuthUser, id: string, dto: ChecklistDto) {
    const task = await this.get(user, id);
    return this.prisma.taskChecklistItem.create({
      data: { tenantId: task.tenantId, taskId: task.id, label: dto.label },
    });
  }

  async toggleChecklist(user: AuthUser, id: string, itemId: string) {
    const task = await this.get(user, id);
    const item = await this.prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId: task.id } });
    if (!item) {
      throw new NotFoundException({ code: 'CHECKLIST_NOT_FOUND', message: 'Checklist item not found' });
    }
    return this.prisma.taskChecklistItem.update({ where: { id: item.id }, data: { done: !item.done } });
  }

  async comment(user: AuthUser, id: string, dto: CommentDto) {
    const task = await this.get(user, id);
    const mentions = [...dto.body.matchAll(/@([^\s]+)/g)].map((match) => match[1]);
    return this.prisma.taskComment.create({
      data: { tenantId: task.tenantId, taskId: task.id, authorUserId: user.userId, body: dto.body, mentions },
    });
  }

  async watch(user: AuthUser, id: string) {
    const task = await this.get(user, id);
    return this.prisma.taskWatcher.upsert({
      where: { taskId_userId: { taskId: task.id, userId: user.userId } },
      update: {},
      create: { tenantId: task.tenantId, taskId: task.id, userId: user.userId },
    });
  }

  async depend(user: AuthUser, id: string, dependsOnTaskId: string) {
    const task = await this.get(user, id);
    const other = await this.get(user, dependsOnTaskId);
    if (other.status !== 'DONE' && task.status !== 'BLOCKED') {
      await this.prisma.task.update({ where: { id: task.id }, data: { status: 'BLOCKED' } });
    }
    return this.prisma.taskDependency.create({
      data: { tenantId: task.tenantId, taskId: task.id, dependsOnTaskId: other.id },
    });
  }

  async logTime(user: AuthUser, id: string, dto: TimeLogDto) {
    const task = await this.get(user, id);
    return this.prisma.taskTimeLog.create({
      data: {
        tenantId: task.tenantId,
        taskId: task.id,
        userId: user.userId,
        minutes: dto.minutes,
        workDate: new Date(dto.workDate),
        note: dto.note,
      },
    });
  }

  async createRecurring(user: AuthUser, dto: RecurringTaskDto) {
    const tenantId = requireTenantId(user);
    return this.prisma.recurringTaskRule.create({
      data: {
        tenantId,
        title: dto.title,
        frequency: dto.frequency,
        interval: dto.interval ?? 1,
        nextRunAt: new Date(dto.nextRunAt),
        ownerUserId: dto.ownerUserId ?? user.userId,
      },
    });
  }

  async spawnDue(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const due = await this.prisma.recurringTaskRule.findMany({
      where: { tenantId, isActive: true, nextRunAt: { lte: new Date() } },
    });
    const created = [];
    for (const rule of due) {
      const task = await this.create(user, {
        title: rule.title,
        ownerUserId: rule.ownerUserId ?? undefined,
        linkedEntityType: 'RecurringTaskRule',
        linkedEntityId: rule.id,
      });
      await this.prisma.task.update({ where: { id: task.id }, data: { recurrenceId: rule.id } });
      await this.prisma.recurringTaskRule.update({
        where: { id: rule.id },
        data: { nextRunAt: this.advance(rule.nextRunAt, rule.frequency, rule.interval) },
      });
      created.push(task);
    }
    return created;
  }

  async escalateOverdue(user: AuthUser) {
    const tenantId = requireTenantId(user);
    const hours = await this.escalateHours(this.prisma, tenantId);
    const cutoff = new Date(Date.now() - hours * 3600_000);
    const overdue = await this.prisma.task.findMany({
      where: {
        tenantId,
        status: { notIn: ['DONE', 'CANCELLED'] },
        OR: [{ slaDueAt: { lte: new Date() } }, { dueAt: { lte: cutoff } }],
      },
    });
    for (const task of overdue) {
      if (task.priority !== 'URGENT') {
        await this.prisma.task.update({ where: { id: task.id }, data: { priority: 'URGENT' } });
      }
      if (task.ownerUserId) {
        await this.notifications.notify({
          tenantId,
          userId: task.ownerUserId,
          title: 'Task escalated',
          body: `${task.title} is overdue`,
          entityType: 'Task',
          entityId: task.id,
        });
      }
    }
    return { escalated: overdue.length };
  }

  private advance(from: Date, frequency: RecurrenceFrequency, interval: number) {
    const next = new Date(from);
    switch (frequency) {
      case 'DAILY':
        next.setDate(next.getDate() + interval);
        break;
      case 'WEEKLY':
        next.setDate(next.getDate() + 7 * interval);
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3 * interval);
        break;
      case 'ANNUAL':
        next.setFullYear(next.getFullYear() + interval);
        break;
      default:
        next.setDate(next.getDate() + interval);
    }
    return next;
  }

  private async escalateHours(db: { tenantSetting: { findUnique: Function } }, tenantId: string) {
    const setting = await db.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: 'task.escalate_hours' } },
    });
    const hours = (setting?.value as { hours?: number } | null)?.hours;
    return hours ?? 24;
  }
}
