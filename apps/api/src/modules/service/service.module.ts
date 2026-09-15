import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ServiceController } from './service.controller';
import { ServiceCentreService } from './service.service';

@Module({
  imports: [InventoryModule],
  controllers: [ServiceController],
  providers: [ServiceCentreService],
  exports: [ServiceCentreService],
})
export class ServiceModule {}
