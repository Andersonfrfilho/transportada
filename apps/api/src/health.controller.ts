import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import type { HealthResponse } from '@transportada/shared'
import { HealthService } from './health.service.js'

@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

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
