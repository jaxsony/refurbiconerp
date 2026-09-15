import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantCrudService } from '../../common/utils/tenant-crud';

@ApiTags('records')
@ApiBearerAuth()
@Controller('records')
export class RecordsController {
  constructor(private readonly crud: TenantCrudService) {}

  @Get(':resource/:id')
  @ApiOperation({ summary: 'Fetch a tenant record for view' })
  get(@CurrentUser() user: AuthUser, @Param('resource') resource: string, @Param('id') id: string) {
    return this.crud.get(user, resource, id);
  }

  @Patch(':resource/:id')
  @ApiOperation({ summary: 'Update a tenant record' })
  patch(
    @CurrentUser() user: AuthUser,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.crud.update(user, resource, id, body);
  }

  @Delete(':resource/:id')
  @ApiOperation({ summary: 'Soft-delete a tenant record' })
  remove(@CurrentUser() user: AuthUser, @Param('resource') resource: string, @Param('id') id: string) {
    return this.crud.remove(user, resource, id);
  }
}

@ApiTags('company')
@ApiBearerAuth()
@Controller('company')
export class CompanyController {
  constructor(private readonly crud: TenantCrudService) {}

  @Get('deleted')
  @ApiOperation({ summary: 'Company admin — list soft-deleted records' })
  deleted(@CurrentUser() user: AuthUser) {
    return this.crud.listDeleted(user);
  }

  @Post('deleted/:resource/:id/restore')
  @ApiOperation({ summary: 'Company admin — restore a soft-deleted record' })
  restore(@CurrentUser() user: AuthUser, @Param('resource') resource: string, @Param('id') id: string) {
    return this.crud.restore(user, resource, id);
  }
}
