/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

/** infRespTec — quem desenvolveu o sistema emissor, declarado por instalação. */
export type CteTechnicalResponsibleEnvironment = {
  readonly cnpj: string
  readonly email: string
  readonly fone: string
  readonly xContato: string
}

export type WorkerEnvironment = {
  readonly appEnv: string
  readonly cteTechnicalResponsible?: CteTechnicalResponsibleEnvironment
  readonly databaseUrl: string
  readonly foundationSyntheticConsumerEnabled: boolean
  readonly foundationSyntheticEffectDelayMs: number
  readonly logLevel: LogLevel
  readonly port: number
  readonly prefetch: number
  readonly queuePrefix: string
  readonly rabbitMqUrl: string
  readonly sentryDsn: string | undefined
  readonly sentryEnvironment: string
}

export type HealthDependencyPort = {
  healthCheck(): Promise<{ readonly healthy: true }>
}

export type DatabasePort = HealthDependencyPort & {
  close(): Promise<void>
}

export type RabbitMqPort = DatabasePort

export type WorkerLogger = {
  error(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
}

export type DependencyStatus = 'up' | 'down'

export type WorkerHealthResponse = {
  readonly service: 'worker'
  readonly status: 'ok' | 'degraded'
  readonly timestamp: string
  readonly dependencies?: {
    readonly database: DependencyStatus
    readonly rabbitmq: DependencyStatus
    readonly storage: DependencyStatus
  }
}

export type RequestTimeoutPort = {
  timeout(request: Request, seconds: number): void
}

export type StoppableHealthServer = {
  stop(): Promise<void>
}
