/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

import type { CryptographicConfiguration } from '../config/cryptographic-configuration.schema'
import type { CompanyRole } from '../database/database.schema'
import type { CompanyPermission } from '../identity/domain/authorization.policy'

export type ApiEnvironment = {
  readonly appEnv: string
  /** Token do primeiro acesso (ADR-0022); ausente é rota morta, nunca rota aberta. */
  readonly bootstrapToken: string | undefined
  /** Empresa do ambiente (ADR-0021); ausente mantém a rota de arranque morta (ADR-0022). */
  readonly companyId: string | undefined
  readonly cryptography: CryptographicConfiguration
  readonly databaseUrl: string
  readonly frontendOrigin: string
  readonly keycloak: {
    readonly admin: {
      readonly clientId: string
      readonly clientSecret: string
    }
    readonly audience: string
    readonly issuer: string
    readonly jwksUri: string
  }
  readonly logLevel: LogLevel
  readonly port: number
  /** Cadência do serviço de cron, para a tela dizer quando é o próximo ciclo automático. */
  readonly scheduledDistributionCron: string
  /** Consulta de veículo por placa; `null` desliga o recurso em vez de chamar um provedor inexistente. */
  readonly vehicleLookup: {
    readonly token: string
    readonly url: string
  } | null
}

export type DatabaseHealthPort = {
  healthCheck(): Promise<{ readonly healthy: true }>
  close(): Promise<void>
}

export type ApiLogger = {
  error(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
}

export type RequestTimeoutPort = {
  timeout(request: Request, seconds: number): void
}

export type StoppableServer = {
  stop(): Promise<void>
}

export type HealthStatus = 'ok' | 'degraded'
export type DependencyStatus = 'up' | 'down'

type HealthResponseBase = {
  readonly service: 'api'
  readonly timestamp: string
}

export type LivenessHealthResponse = HealthResponseBase & {
  readonly status: 'ok'
}

export type ReadinessHealthResponse = HealthResponseBase & {
  readonly dependencies: {
    readonly database: DependencyStatus
    readonly identity: DependencyStatus
  }
  readonly status: HealthStatus
}

export type HealthResponse = LivenessHealthResponse | ReadinessHealthResponse

export type ErrorResponse = {
  readonly error: {
    readonly code: string
    readonly correlationId: string
    readonly message: string
  }
}

export type AuthMeResponse = {
  readonly data: {
    readonly company: {
      readonly id: string
    }
    readonly identity: {
      readonly userId: string
    }
    readonly permissions: readonly CompanyPermission[]
    readonly roles: readonly CompanyRole[]
  }
}
