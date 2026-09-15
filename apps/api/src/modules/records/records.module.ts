import { Module } from '@nestjs/common';
import { TenantCrudService } from '../../common/utils/tenant-crud';
import { CompanyController, RecordsController } from './records.controller';

@Module({
  controllers: [RecordsController, CompanyController],
  providers: [TenantCrudService],
})
export class RecordsModule {}
