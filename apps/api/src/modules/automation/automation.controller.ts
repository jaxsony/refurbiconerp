import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';
import {
  AutomationService,
  BankAccountDto,
  BankImportDto,
  ChannelDto,
  ListingDto,
  MarketplaceOrderDto,
  MatchDto,
  RecurringDto,
  SendMessageDto,
  WhatsAppWebhookDto,
} from './automation.service';

@ApiTags('automation')
@ApiBearerAuth()
@Controller()
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('recurring-schedules')
  @RequirePermissions('recurring:view')
  @ApiOperation({ summary: 'REC-001 — recurring rent, salary, AMC and subscriptions' })
  schedules(@CurrentUser() user: AuthUser) {
    return this.automation.schedules(user);
  }

  @Post('recurring-schedules')
  @RequirePermissions('recurring:create')
  createSchedule(@CurrentUser() user: AuthUser, @Body() dto: RecurringDto) {
    return this.automation.createSchedule(user, dto);
  }

  @Post('recurring-schedules/run')
  @RequirePermissions('recurring:edit')
  @ApiOperation({ summary: 'REC-002 — spawn due occurrences once per key' })
  runDue(@CurrentUser() user: AuthUser) {
    return this.automation.runDue(user);
  }

  @Get('bank-accounts')
  @RequirePermissions('banking:view')
  @ApiOperation({ summary: 'BNK-001 — bank accounts and feeds' })
  bankAccounts(@CurrentUser() user: AuthUser) {
    return this.automation.bankAccounts(user);
  }

  @Post('bank-accounts')
  @RequirePermissions('banking:create')
  createBank(@CurrentUser() user: AuthUser, @Body() dto: BankAccountDto) {
    return this.automation.createBankAccount(user, dto);
  }

  @Get('bank-transactions')
  @RequirePermissions('banking:view')
  transactions(@CurrentUser() user: AuthUser) {
    return this.automation.transactions(user);
  }

  @Post('bank-transactions/import')
  @RequirePermissions('banking:create')
  importBank(@CurrentUser() user: AuthUser, @Body() dto: BankImportDto) {
    return this.automation.importBank(user, dto);
  }

  @Post('bank-transactions/:id/match')
  @RequirePermissions('banking:approve')
  match(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MatchDto) {
    return this.automation.match(user, id, dto);
  }

  @Post('bank-transactions/:id/confirm')
  @RequirePermissions('banking:approve')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automation.confirm(user, id);
  }

  @Get('channels')
  @RequirePermissions('whatsapp:view')
  channels(@CurrentUser() user: AuthUser) {
    return this.automation.channels(user);
  }

  @Post('channels')
  @RequirePermissions('whatsapp:edit')
  createChannel(@CurrentUser() user: AuthUser, @Body() dto: ChannelDto) {
    return this.automation.createChannel(user, dto);
  }

  @Get('conversations')
  @RequirePermissions('whatsapp:view')
  @ApiOperation({ summary: 'WAP-001 — WhatsApp conversations' })
  conversations(@CurrentUser() user: AuthUser) {
    return this.automation.conversations(user);
  }

  @Post('conversations/:id/assign')
  @RequirePermissions('whatsapp:edit')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automation.assign(user, id);
  }

  @Post('whatsapp/send')
  @RequirePermissions('whatsapp:create')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.automation.send(user, dto);
  }

  @Public()
  @SkipTenant()
  @Post('webhooks/whatsapp')
  @ApiOperation({ summary: 'WAP-003 — inbound webhook with event idempotency' })
  webhook(@Body() dto: WhatsAppWebhookDto) {
    return this.automation.ingestWhatsApp(dto);
  }

  @Get('marketplace-listings')
  @RequirePermissions('marketplaces:view')
  listings(@CurrentUser() user: AuthUser) {
    return this.automation.listings(user);
  }

  @Post('marketplace-listings')
  @RequirePermissions('marketplaces:edit')
  @ApiOperation({ summary: 'MKT-001 — publish catalogue listing version' })
  publish(@CurrentUser() user: AuthUser, @Body() dto: ListingDto) {
    return this.automation.publishListing(user, dto);
  }

  @Get('marketplace-orders')
  @RequirePermissions('marketplaces:view')
  marketplaceOrders(@CurrentUser() user: AuthUser) {
    return this.automation.marketplaceOrders(user);
  }

  @Post('marketplace-orders')
  @RequirePermissions('marketplaces:create')
  @ApiOperation({ summary: 'MKT-002 — import marketplace orders idempotently' })
  importOrder(@CurrentUser() user: AuthUser, @Body() dto: MarketplaceOrderDto) {
    return this.automation.importMarketplaceOrder(user, dto);
  }
}
