/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

import type { CronDatabase } from '../database/cron-database.types.js'
import type { CronFiscalEnvironment } from './cron.constant.js'

/**
 * Configuração exclusiva do trilho de coleta do preço de referência. Só é resolvida quando o
 * ambiente declara alguma agência — a instalação que não coleta preço sobe sem nenhuma delas.
 * São **duas** agências no mesmo job: a ANP publica o litro e a ANEEL, o megawatt-hora.
 */
export type CronFuelPricePullEnvironment = {
  readonly aneelBaseUrl: string
  readonly aneelTimeoutMilliseconds: number
  readonly anpBaseUrl: string
  readonly anpTimeoutMilliseconds: number
}

export type CronEnvironment = {
  readonly appEnv: string
  readonly cadenceMinutes: number
  readonly databaseUrl: string
  readonly fiscalEnvironment: CronFiscalEnvironment
  readonly fuelPricePull: CronFuelPricePullEnvironment | undefined
  readonly logLevel: LogLevel
  readonly pageSize: number
  readonly queuePrefix: string
  readonly rabbitMqUrl: string
  /** Destino HTTP do log estruturado; ausente mantém só o stdout. */
  readonly logSinkUrl: string | undefined
  readonly sentryDsn: string | undefined
  readonly sentryEnvironment: string
}

/**
 * O formato que todo job deste cron devolve, e que o `main.ts` loga em `cron_cycle_completed`. As
 * razões de inelegibilidade são vocabulário de cada job — aqui só a contagem importa.
 */
/** O que o `main.ts` entrega a qualquer job do registro — um ciclo, um trace, um socket. */
export type CronJobDependencies = {
  readonly config: CronEnvironment
  readonly correlationId: string
  readonly db: CronDatabase
  readonly logger: CronLogger
  readonly now: Date
}

export type CronCycleResult = {
  readonly acquiredLock: boolean
  readonly eligibleCount: number
  readonly enqueuedCount: number
  readonly failedCount: number
  readonly ineligibleCounts: Readonly<Record<string, number>>
  readonly skippedCount: number
}

export type CronLogger = {
  error(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
}
