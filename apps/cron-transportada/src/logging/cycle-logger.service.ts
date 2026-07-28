/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createContext, createLogger, runWithContext, type Context } from '@adatechnology/logger'

import { CRON_PROJECT_NAME, CRON_VERSION } from '../config/cron.constant.js'
import type { CronEnvironment, CronLogger } from '../config/cron.types.js'

type CycleLoggerParams = {
  readonly environment: CronEnvironment
  readonly traceId: string
}

export function createCycleContext({ environment, traceId }: CycleLoggerParams): Context {
  return createContext({
    logLevel: environment.logLevel,
    projectName: CRON_PROJECT_NAME,
    stack: [environment.cronJob],
    traceId,
    version: CRON_VERSION,
  })
}

export function createCronLogger(environment: CronEnvironment): CronLogger {
  return createLogger({
    logLevel: environment.logLevel,
    pretty: environment.appEnv !== 'production',
    projectName: CRON_PROJECT_NAME,
    version: CRON_VERSION,
  })
}

export function runWithCycleContext<TResult>(
  params: CycleLoggerParams,
  operation: () => TResult,
): TResult {
  return runWithContext(createCycleContext(params), operation)
}
