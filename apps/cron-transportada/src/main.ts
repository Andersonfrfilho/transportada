/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Composition root of the scheduled NF-e distribution cron. A K8s CronJob runs
 * this one-shot process each cadence window: it parses config, pins a single
 * Postgres socket (so the session advisory lock spans every per-company
 * transaction), runs the resolved job inside a per-cycle trace context and
 * exits non-zero only when a company failed — a lock miss is a clean no-op.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { CRON_PROJECT_NAME, CRON_VERSION } from './config/cron.constant.js'
import { parseCronEnvironment } from './config/environment.schema.js'
import { createCronLogger, runWithCycleContext } from './logging/cycle-logger.service.js'
import { resolveCronJob } from './nfe-distribution-pull/job-registry.js'
import { createErrorTracker } from './observability/sentry.service.js'

const CRON_CONNECTION_MAX_SOCKETS = 1
const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1

export async function runCronRuntime(
  environment: Record<string, string | undefined>,
  clock: { readonly now: Date },
): Promise<number> {
  const config = parseCronEnvironment(environment)
  const logger = createCronLogger(config)
  const errorTracker = createErrorTracker({
    configuration: {
      dsn: config.sentryDsn,
      environment: config.sentryEnvironment,
      release: `${CRON_PROJECT_NAME}@${CRON_VERSION}`,
    },
  })
  const traceId = crypto.randomUUID()
  const provider = createDrizzleProvider({
    connection: { url: config.databaseUrl, max: CRON_CONNECTION_MAX_SOCKETS },
  })

  try {
    return await runWithCycleContext({ environment: config, traceId }, async () => {
      const runJob = resolveCronJob(config.cronJob)
      const result = await runJob({
        config,
        correlationId: traceId,
        db: provider.db,
        logger,
        now: clock.now,
      })
      logger.info('cron_cycle_completed', {
        acquiredLock: result.acquiredLock,
        cronJob: config.cronJob,
        eligibleCount: result.eligibleCount,
        enqueuedCount: result.enqueuedCount,
        failedCount: result.failedCount,
        ineligibleCounts: result.ineligibleCounts,
        skippedCount: result.skippedCount,
      })
      return result.failedCount > 0 ? EXIT_FAILURE : EXIT_SUCCESS
    })
  } catch (error: unknown) {
    // Fronteira do processo: depois daqui não há quem observe a falha do ciclo.
    errorTracker.captureException(error)
    throw error
  } finally {
    await errorTracker.flush()
    await provider.close()
  }
}

if (import.meta.main) {
  const exitCode = await runCronRuntime(process.env, { now: new Date() })
  process.exit(exitCode)
}
