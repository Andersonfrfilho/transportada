/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Composition root da batida do agendador. O processo é one-shot: a cada cinco minutos ele parseia
 * a configuração, pina um socket de Postgres (para o advisory lock de sessão valer por todas as
 * transações do ciclo), publica o que venceu dentro de um contexto de rastreio e sai. Sai diferente
 * de zero só quando alguma rotina falhou ao ser publicada — não pegar o lock é no-op limpo.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { CRON_PROJECT_NAME, CRON_VERSION } from './config/cron.constant.js'
import { parseCronEnvironment } from './config/environment.schema.js'
import { createCronLogger, runWithCycleContext } from './logging/cycle-logger.service.js'
import { createErrorTracker } from './observability/sentry.service.js'
import { runTickJob } from './tick/tick.job.js'

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
      const result = await runTickJob({
        config,
        correlationId: traceId,
        db: provider.db,
        logger,
        now: clock.now,
      })
      logger.info('cron_tick_completed', {
        acquiredLock: result.acquiredLock,
        dueCount: result.dueCount,
        failedCount: result.failedCount,
        publishedCount: result.publishedCount,
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
    // O processo é one-shot: o que ficou na fila do transporte HTTP some junto com ele.
    await logger.flush()
    logger.stop()
    await provider.close()
  }
}

if (import.meta.main) {
  const exitCode = await runCronRuntime(process.env, { now: new Date() })
  process.exit(exitCode)
}
