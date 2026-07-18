import { Redis } from 'ioredis'

export interface QueueHealth {
  readonly status: 'up' | 'down'
}

export class QueueConnection {
  private readonly redis: Redis

  public constructor(connectionUrl: string) {
    this.redis = new Redis(connectionUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 2_000,
    })
  }

  public async health(): Promise<QueueHealth> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect()
      }
      return (await this.redis.ping()) === 'PONG' ? { status: 'up' } : { status: 'down' }
    } catch {
      return { status: 'down' }
    }
  }

  public async close(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit()
    }
  }
}
