import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import {
  AllotWorkDto,
  ChecklistDto,
  CommentDto,
  CompleteWorkDto,
  CreateTaskDto,
  RecurringTaskDto,
  TasksService,
  TimeLogDto,
  UpdateTaskDto,
} from './tasks.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks')
  @RequirePermissions('tasks:view')
  @ApiOperation({ summary: 'TSK-001 / TSK-004 — list, board, calendar and workload views' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('view') view?: string,
    @Query('status') status?: TaskStatus,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    if (view === 'board') {
      return this.tasks.board(user);
    }
    if (view === 'calendar') {
      return this.tasks.calendar(user);
    }
    if (view === 'workload') {
      return this.tasks.workload(user);
    }
    return this.tasks.list(user, { status, ownerUserId, page, pageSize, q });
  }

  @Get('tasks/:id')
  @RequirePermissions('tasks:view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.get(user, id);
  }

  @Post('tasks')
  @RequirePermissions('tasks:create')
  @ApiOperation({ summary: 'TSK-001 — create personal, team or department task' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Post('tasks/from-entity')
  @RequirePermissions('tasks:create')
  @ApiOperation({ summary: 'TSK-006 — convert a lead, order, ticket or approval into a linked task' })
  fromEntity(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.fromEntity(user, dto);
  }

  @Patch('tasks/:id')
  @RequirePermissions('tasks:edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user, id, dto);
  }

  @Post('tasks/:id/allot')
  @RequirePermissions('tasks:edit')
  @ApiOperation({ summary: 'TSK-001 — allot a company employee to the current task step' })
  allot(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AllotWorkDto) {
    return this.tasks.allot(user, id, dto);
  }

  @Post('tasks/:id/complete')
  @RequirePermissions('tasks:edit')
  @ApiOperation({ summary: 'TSK-001 — mark the current step done and move to the next process' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteWorkDto) {
    return this.tasks.completeStep(user, id, dto);
  }

  @Post('tasks/:id/checklist')
  @RequirePermissions('tasks:edit')
  @ApiOperation({ summary: 'TSK-002 — checklist items' })
  checklist(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ChecklistDto) {
    return this.tasks.addChecklist(user, id, dto);
  }

  @Post('tasks/:id/checklist/:itemId/toggle')
  @RequirePermissions('tasks:edit')
  toggle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.tasks.toggleChecklist(user, id, itemId);
  }

  @Post('tasks/:id/comments')
  @RequirePermissions('tasks:edit')
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.tasks.comment(user, id, dto);
  }

  @Post('tasks/:id/watch')
  @RequirePermissions('tasks:edit')
  watch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.watch(user, id);
  }

  @Post('tasks/:id/dependencies')
  @RequirePermissions('tasks:edit')
  depend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { dependsOnTaskId: string }) {
    return this.tasks.depend(user, id, body.dependsOnTaskId);
  }

  @Post('tasks/:id/time-logs')
  @RequirePermissions('tasks:edit')
  @ApiOperation({ summary: 'TSK-007 — capture time spent' })
  timeLog(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TimeLogDto) {
    return this.tasks.logTime(user, id, dto);
  }

  @Post('recurring-tasks')
  @RequirePermissions('tasks:create')
  @ApiOperation({ summary: 'TSK-003 — recurring task rules' })
  recurring(@CurrentUser() user: AuthUser, @Body() dto: RecurringTaskDto) {
    return this.tasks.createRecurring(user, dto);
  }

  @Post('recurring-tasks/spawn')
  @RequirePermissions('tasks:create')
  spawn(@CurrentUser() user: AuthUser) {
    return this.tasks.spawnDue(user);
  }

  @Post('tasks/escalate-overdue')
  @RequirePermissions('tasks:edit')
  @ApiOperation({ summary: 'TSK-005 — escalate overdue tasks' })
  escalate(@CurrentUser() user: AuthUser) {
    return this.tasks.escalateOverdue(user);
  }
}
