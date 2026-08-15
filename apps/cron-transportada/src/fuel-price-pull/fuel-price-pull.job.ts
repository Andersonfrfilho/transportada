/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Composição do trilho de coleta do preço de referência: o cliente da ANP e o gateway Drizzle
 * entram no ciclo puro. O advisory lock é o mesmo do trilho de distribuição — uma implementação,
 * dois jobs.
 */
import { CronConfigurationError } from '../config/environment.schema.js'
import type { CronJobDependencies } from '../config/cron.types.js'
import { createDrizzleAdvisoryLock } from '../nfe-distribution-pull/infrastructure/drizzle-advisory-lock.js'

import { createPullFuelReferenceUseCase } from './application/pull-fuel-reference.use-case.js'
import { runFuelPricePullCycle, type FuelPricePullCycleResult } from './application/run-cycle.js'
import { createAnpSeriesClient } from './infrastructure/anp-series.client.js'
import { createDrizzleFuelReferenceGateway } from './infrastructure/drizzle-fuel-reference.gateway.js'

export function runFuelPricePullJob(
  dependencies: CronJobDependencies,
): Promise<FuelPricePullCycleResult> {
  const settings = dependencies.config.fuelPricePull

  if (settings === undefined) {
    throw new CronConfigurationError()
  }

  return runFuelPricePullCycle({
    correlationId: dependencies.correlationId,
    jobId: dependencies.config.cronJob,
    lock: createDrizzleAdvisoryLock({ db: dependencies.db }),
    logger: dependencies.logger,
    now: dependencies.now,
    pullUseCase: createPullFuelReferenceUseCase({
      gateway: createDrizzleFuelReferenceGateway({ db: dependencies.db }),
      logger: dependencies.logger,
      series: createAnpSeriesClient({
        baseUrl: settings.baseUrl,
        fetch: (url, init) => fetch(url, init),
        timeoutInMilliseconds: settings.timeoutMilliseconds,
      }),
    }),
  })
}
