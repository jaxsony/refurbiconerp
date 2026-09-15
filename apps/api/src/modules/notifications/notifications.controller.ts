import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService, PreferenceDto } from './notifications.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  @RequirePermissions('notifications:view')
  @ApiOperation({ summary: 'ADM-006 — in-app notification inbox' })
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user);
  }

  @Post('notifications/:id/read')
  @RequirePermissions('notifications:view')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post('notifications/read-all')
  @RequirePermissions('notifications:view')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Get('notification-preferences')
  @RequirePermissions('notifications:view')
  preferences(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user);
  }

  @Post('notification-preferences')
  @RequirePermissions('notifications:administer')
  upsertPreference(@CurrentUser() user: AuthUser, @Body() dto: PreferenceDto) {
    return this.notifications.upsertPreference(user, dto);
  }
}
