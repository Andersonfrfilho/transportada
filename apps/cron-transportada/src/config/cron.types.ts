/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

import type { CronFiscalEnvironment, CronJob } from './cron.constant.js'

export type CronEnvironment = {
  readonly appEnv: string
  readonly cadenceMinutes: number
  readonly cronJob: CronJob
  readonly databaseUrl: string
  readonly fiscalEnvironment: CronFiscalEnvironment
  readonly logLevel: LogLevel
  readonly pageSize: number
  readonly sentryDsn: string | undefined
  readonly sentryEnvironment: string
}

export type CronLogger = {
  error(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
}
