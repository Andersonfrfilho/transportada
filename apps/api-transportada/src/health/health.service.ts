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
  /** Spec 137: janela de cada dependência na prontidão; acima dela a dependência é `down`. */
  readonly readinessTimeoutMs?: number
  /** Spec 078: a revisão publicada; ausente vira `unknown`, nunca campo que some. */
  readonly revision?: string
}

export const READINESS_CHECK_TIMEOUT_MS = 2000

export class HealthService {
  private readonly database: DatabaseHealthPort
  private readonly identityReadiness: IdentityReadinessPort
  private readonly migrationStatus: MigrationStatusPort
  private readonly now: () => Date
  private readonly readinessTimeoutMs: number
  private readonly revision: string

  public constructor({
    database,
    identityReadiness,
    migrationStatus,
    now = () => new Date(),
    readinessTimeoutMs = READINESS_CHECK_TIMEOUT_MS,
    revision = 'unknown',
  }: HealthServiceParams) {
    this.database = database
    this.identityReadiness = identityReadiness
    this.migrationStatus = migrationStatus
    this.now = now
    this.readinessTimeoutMs = readinessTimeoutMs
    this.revision = revision
  }

  public live(): LivenessHealthResponse {
    return {
      revision: this.revision,
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
      revision: this.revision,
      service: API_SERVICE_NAME,
      status: Object.values(dependencies).every((status) => status === 'up') ? 'ok' : 'degraded',
      timestamp: this.now().toISOString(),
    }
  }

  private checkDatabase(): Promise<DependencyStatus> {
    return settleWithin(async () => {
      await this.database.healthCheck()
      return 'up'
    }, this.readinessTimeoutMs)
  }

  /** Não devolve os nomes: `/health/ready` é público e a lista descreve o esquema do banco. */
  private checkMigrations(): Promise<DependencyStatus> {
    return settleWithin(
      async () => ((await this.migrationStatus.countPending()) === 0 ? 'up' : 'down'),
      this.readinessTimeoutMs,
    )
  }

  private checkIdentity(): Promise<DependencyStatus> {
    return settleWithin(
      async () => ((await this.identityReadiness.checkReadiness()) ? 'up' : 'down'),
      this.readinessTimeoutMs,
    )
  }
}

/**
 * Spec 137: dependência que não responde na janela é `down`. Pendurar a prontidão era o sintoma —
 * o balanceador esperava os 10 s do socket e recebia resposta vazia em vez de 503.
 */
async function settleWithin(
  check: () => Promise<DependencyStatus>,
  timeoutMs: number,
): Promise<DependencyStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<DependencyStatus>((resolve) => {
    timer = setTimeout(() => resolve('down'), timeoutMs)
  })
  try {
    return await Promise.race([check().catch((): DependencyStatus => 'down'), deadline])
  } finally {
    clearTimeout(timer)
  }
}
