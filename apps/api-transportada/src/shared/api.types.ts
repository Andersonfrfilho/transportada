/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

export type ApiEnvironment = {
  readonly appEnv: string
  readonly databaseUrl: string
  readonly keycloak: {
    readonly audience: string
    readonly issuer: string
    readonly jwksUri: string
  }
  readonly logLevel: LogLevel
  readonly port: number
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

export type HealthResponse = {
  readonly service: 'api'
  readonly status: HealthStatus
  readonly timestamp: string
  readonly dependencies?: {
    readonly database: DependencyStatus
  }
}

export type ErrorResponse = {
  readonly error: {
    readonly code: string
    readonly correlationId: string
    readonly message: string
  }
}
