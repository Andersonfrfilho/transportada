/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { API_SERVICE_NAME } from '../shared/api.constant'
import type { IdentityReadinessPort } from '../identity/application/identity.port'
import type {
  DatabaseHealthPort,
  DependencyStatus,
  LivenessHealthResponse,
  ReadinessHealthResponse,
} from '../shared/api.types'

type HealthServiceParams = {
  readonly database: DatabaseHealthPort
  readonly identityReadiness: IdentityReadinessPort
  readonly now?: () => Date
}

export class HealthService {
  private readonly database: DatabaseHealthPort
  private readonly identityReadiness: IdentityReadinessPort
  private readonly now: () => Date

  public constructor({ database, identityReadiness, now = () => new Date() }: HealthServiceParams) {
    this.database = database
    this.identityReadiness = identityReadiness
    this.now = now
  }

  public live(): LivenessHealthResponse {
    return {
      service: API_SERVICE_NAME,
      status: 'ok',
      timestamp: this.now().toISOString(),
    }
  }

  public async ready(): Promise<ReadinessHealthResponse> {
    const [database, identity] = await Promise.all([this.checkDatabase(), this.checkIdentity()])

    return {
      dependencies: { database, identity },
      service: API_SERVICE_NAME,
      status: database === 'up' && identity === 'up' ? 'ok' : 'degraded',
      timestamp: this.now().toISOString(),
    }
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.database.healthCheck()
      return 'up'
    } catch {
      return 'down'
    }
  }

  private async checkIdentity(): Promise<DependencyStatus> {
    try {
      return (await this.identityReadiness.checkReadiness()) ? 'up' : 'down'
    } catch {
      return 'down'
    }
  }
}
