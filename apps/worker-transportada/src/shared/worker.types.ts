/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

export type WorkerEnvironment = {
  readonly appEnv: string
  readonly databaseUrl: string
  readonly foundationSyntheticConsumerEnabled: boolean
  readonly foundationSyntheticEffectDelayMs: number
  readonly logLevel: LogLevel
  readonly port: number
  readonly prefetch: number
  readonly queuePrefix: string
  readonly rabbitMqUrl: string
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
