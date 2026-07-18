import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { parseEnvironment } from '@transportada/config'
import { DatabaseConnection } from '@transportada/database'
import { QueueConnection } from '@transportada/queue'
import type { HealthResponse } from '@transportada/shared'

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private readonly env = parseEnvironment(process.env)
  private readonly database = new DatabaseConnection(this.env.DATABASE_URL)
  private readonly queue = new QueueConnection(this.env.REDIS_URL)

  public live(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    }
  }

  public async ready(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.database.health(), this.queue.health()])
    const status = database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded'

    return {
      status,
      service: 'api',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: database.status,
        redis: redis.status,
      },
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.database.close(), this.queue.close()])
  }
}
