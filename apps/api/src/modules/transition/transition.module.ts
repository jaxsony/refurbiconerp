import { Module } from '@nestjs/common';
import { TransitionController } from './transition.controller';
import { TransitionService } from './transition.service';

@Module({
  controllers: [TransitionController],
  providers: [TransitionService],
  exports: [TransitionService],
})
export class TransitionModule {}
