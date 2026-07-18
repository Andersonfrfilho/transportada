import { Module } from '@nestjs/common'
import { WorkerHealthController } from './health.controller.js'
import { WorkerHealthService } from './health.service.js'

@Module({
  controllers: [WorkerHealthController],
  providers: [WorkerHealthService],
})
export class WorkerAppModule {}
