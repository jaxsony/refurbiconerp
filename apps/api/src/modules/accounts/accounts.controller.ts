import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountsService, CreateJournalDto, CreatePaymentDto, LedgerAccountDto } from './accounts.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('ledger-accounts')
  @RequirePermissions('accounts:view')
  @ApiOperation({ summary: 'ACC-001 — chart of accounts' })
  ledger(@CurrentUser() user: AuthUser) {
    return this.accounts.accounts(user);
  }

  @Post('ledger-accounts')
  @RequirePermissions('accounts:create')
  createAccount(@CurrentUser() user: AuthUser, @Body() dto: LedgerAccountDto) {
    return this.accounts.createAccount(user, dto);
  }

  @Get('invoices')
  @RequirePermissions('invoices:view')
  invoices(@CurrentUser() user: AuthUser) {
    return this.accounts.invoices(user);
  }

  @Post('sales-orders/:id/invoice')
  @RequirePermissions('invoices:create')
  @ApiOperation({ summary: 'ACC-002 / SAL-005 — invoice from sales order' })
  fromOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.invoiceFromOrder(user, id);
  }

  @Post('invoices/:id/post')
  @RequirePermissions('invoices:approve')
  @ApiOperation({ summary: 'ACC-003 / ACC-010 — post balanced sales journal' })
  postInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.postInvoice(user, id);
  }

  @Get('payments')
  @RequirePermissions('payments:view')
  payments(@CurrentUser() user: AuthUser) {
    return this.accounts.payments(user);
  }

  @Post('payments')
  @RequirePermissions('payments:create')
  @ApiOperation({ summary: 'ACC-005 / ACC-009 — receipt with allocation and optional maker-checker' })
  createPayment(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.accounts.createPayment(user, dto);
  }

  @Post('payments/:id/approve')
  @RequirePermissions('payments:approve')
  approvePayment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.approvePayment(user, id);
  }

  @Get('vouchers')
  @RequirePermissions('accounts:view')
  vouchers(@CurrentUser() user: AuthUser) {
    return this.accounts.vouchers(user);
  }

  @Post('journals')
  @RequirePermissions('accounts:approve')
  createJournal(@CurrentUser() user: AuthUser, @Body() dto: CreateJournalDto) {
    return this.accounts.createJournal(user, dto);
  }

  @Post('vouchers/:id/reverse')
  @RequirePermissions('accounts:approve')
  @ApiOperation({ summary: 'ACC-004 / ACC-010 — reverse posted voucher' })
  reverse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.reverseVoucher(user, id);
  }

  @Get('trial-balance')
  @RequirePermissions('accounts:view')
  @ApiOperation({ summary: 'ACC-007 — trial balance from posted journals' })
  trialBalance(@CurrentUser() user: AuthUser) {
    return this.accounts.trialBalance(user);
  }

  @Get('receivables')
  @RequirePermissions('accounts:view')
  @ApiOperation({ summary: 'ACC-005 — customer outstanding and ageing' })
  outstanding(@CurrentUser() user: AuthUser) {
    return this.accounts.outstanding(user);
  }
}
