/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { API_SERVICE_NAME } from '../shared/api.constant'
import type { IdentityReadinessPort } from '../identity/application/identity.port'
import type {
  DatabaseHealthPort,
  DependencyStatus,
  LivenessHealthResponse,
  MigrationStatusPort,
  ReadinessHealthResponse,
} from '../shared/api.types'

type HealthServiceParams = {
  readonly database: DatabaseHealthPort
  readonly identityReadiness: IdentityReadinessPort
  readonly migrationStatus: MigrationStatusPort
  readonly now?: () => Date
}

export class HealthService {
  private readonly database: DatabaseHealthPort
  private readonly identityReadiness: IdentityReadinessPort
  private readonly migrationStatus: MigrationStatusPort
  private readonly now: () => Date

  public constructor({
    database,
    identityReadiness,
    migrationStatus,
    now = () => new Date(),
  }: HealthServiceParams) {
    this.database = database
    this.identityReadiness = identityReadiness
    this.migrationStatus = migrationStatus
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
    const [database, identity, migrations] = await Promise.all([
      this.checkDatabase(),
      this.checkIdentity(),
      this.checkMigrations(),
    ])
    const dependencies = { database, identity, migrations }

    return {
      dependencies,
      service: API_SERVICE_NAME,
      status: Object.values(dependencies).every((status) => status === 'up') ? 'ok' : 'degraded',
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

  /** Não devolve os nomes: `/health/ready` é público e a lista descreve o esquema do banco. */
  private async checkMigrations(): Promise<DependencyStatus> {
    try {
      return (await this.migrationStatus.countPending()) === 0 ? 'up' : 'down'
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
