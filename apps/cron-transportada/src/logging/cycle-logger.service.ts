/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createContext, createLogger, runWithContext, type Context } from '@adatechnology/logger'

import { CRON_PROJECT_NAME, CRON_STACK_NAME, CRON_VERSION } from '../config/cron.constant.js'
import type { CronEnvironment } from '../config/cron.types.js'
import { shouldPrettyPrintLogs } from './log-format.policy.js'

type CycleLoggerParams = {
  readonly environment: CronEnvironment
  readonly traceId: string
}

export function createCycleContext({ environment, traceId }: CycleLoggerParams): Context {
  return createContext({
    logLevel: environment.logLevel,
    projectName: CRON_PROJECT_NAME,
    stack: [CRON_STACK_NAME],
    traceId,
    version: CRON_VERSION,
  })
}

/**
 * Devolve o `Logger` concreto, não o `CronLogger` que os consumidores enxergam: o ciclo precisa de
 * `flush` para o transporte HTTP não morrer com o processo, e isso não é contrato de quem loga.
 */
export function createCronLogger(environment: CronEnvironment): ReturnType<typeof createLogger> {
  return createLogger({
    logLevel: environment.logLevel,
    pretty: shouldPrettyPrintLogs(environment.appEnv),
    projectName: CRON_PROJECT_NAME,
    ...(environment.logSinkUrl === undefined ? {} : { sinkUrl: environment.logSinkUrl }),
    version: CRON_VERSION,
  })
}

export function runWithCycleContext<TResult>(
  params: CycleLoggerParams,
  operation: () => TResult,
): TResult {
  return runWithContext(createCycleContext(params), operation)
}
