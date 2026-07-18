import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import type { HealthResponse } from '@transportada/shared'
import { WorkerHealthService } from './health.service.js'

@Controller('health')
export class WorkerHealthController {
  public constructor(private readonly healthService: WorkerHealthService) {}

  @Get('live')
  public live(): HealthResponse {
    return this.healthService.live()
  }

  @Get('ready')
  public async ready(): Promise<HealthResponse> {
    const result = await this.healthService.ready()
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result)
    }
    return result
  }
}
