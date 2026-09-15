import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SwitchTenantDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';

@ApiTags('identity')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'TEN-001 / identity — sign in and receive rotating session tokens' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public()
  @Post('auth/refresh')
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access token' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('auth/logout')
  @ApiOperation({ summary: 'Revoke the current device session' })
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sessionId);
    return { ok: true };
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Post('auth/tenant-context')
  @ApiOperation({ summary: 'TEN-007 — explicitly switch the active tenant context' })
  switchTenant(@CurrentUser() user: AuthUser, @Body() dto: SwitchTenantDto, @Req() req: Request) {
    return this.auth.switchTenant(user, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @ApiBearerAuth()
  @SkipTenant()
  @Get('me')
  @ApiOperation({ summary: 'Current user, memberships and active tenant' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
