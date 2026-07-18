/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { API_SERVICE_NAME } from '../shared/api.constant'
import type { DatabaseHealthPort, HealthResponse } from '../shared/api.types'

type HealthServiceParams = {
  readonly database: DatabaseHealthPort
  readonly now?: () => Date
}

export class HealthService {
  private readonly database: DatabaseHealthPort
  private readonly now: () => Date

  public constructor({ database, now = () => new Date() }: HealthServiceParams) {
    this.database = database
    this.now = now
  }

  public live(): HealthResponse {
    return {
      service: API_SERVICE_NAME,
      status: 'ok',
      timestamp: this.now().toISOString(),
    }
  }

  public async ready(): Promise<HealthResponse> {
    try {
      await this.database.healthCheck()

      return {
        dependencies: { database: 'up' },
        service: API_SERVICE_NAME,
        status: 'ok',
        timestamp: this.now().toISOString(),
      }
    } catch {
      return {
        dependencies: { database: 'down' },
        service: API_SERVICE_NAME,
        status: 'degraded',
        timestamp: this.now().toISOString(),
      }
    }
  }
}
