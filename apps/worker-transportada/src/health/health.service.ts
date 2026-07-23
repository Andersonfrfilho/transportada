/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { HealthDependencyPort, WorkerHealthResponse } from '../shared/worker.types.js'

type WorkerHealthServiceParams = {
  readonly database: HealthDependencyPort
  readonly now?: () => Date
  readonly rabbitMq: HealthDependencyPort
  readonly storage: HealthDependencyPort
}

export class WorkerHealthService {
  readonly #database: HealthDependencyPort
  readonly #now: () => Date
  readonly #rabbitMq: HealthDependencyPort
  readonly #storage: HealthDependencyPort

  constructor({ database, now = () => new Date(), rabbitMq, storage }: WorkerHealthServiceParams) {
    this.#database = database
    this.#now = now
    this.#rabbitMq = rabbitMq
    this.#storage = storage
  }

  live(): WorkerHealthResponse {
    return {
      service: 'worker',
      status: 'ok',
      timestamp: this.#now().toISOString(),
    }
  }

  async ready(): Promise<WorkerHealthResponse> {
    const [database, rabbitMq, storage] = await Promise.allSettled([
      this.#database.healthCheck(),
      this.#rabbitMq.healthCheck(),
      this.#storage.healthCheck(),
    ])
    const dependencies = {
      database: database.status === 'fulfilled' ? ('up' as const) : ('down' as const),
      rabbitmq: rabbitMq.status === 'fulfilled' ? ('up' as const) : ('down' as const),
      storage: storage.status === 'fulfilled' ? ('up' as const) : ('down' as const),
    }

    return {
      dependencies,
      service: 'worker',
      status:
        dependencies.database === 'up' &&
        dependencies.rabbitmq === 'up' &&
        dependencies.storage === 'up'
          ? 'ok'
          : 'degraded',
      timestamp: this.#now().toISOString(),
    }
  }
}
