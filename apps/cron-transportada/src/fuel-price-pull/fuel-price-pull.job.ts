/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Composição do trilho de coleta do preço de referência: os clientes da ANP e da ANEEL, mais os
 * dois gateways Drizzle, entram no ciclo puro. O advisory lock é o mesmo do trilho de distribuição
 * — uma implementação, dois jobs.
 */
import { CronConfigurationError } from '../config/environment.schema.js'
import type { CronJobDependencies } from '../config/cron.types.js'
import { createDrizzleAdvisoryLock } from '../nfe-distribution-pull/infrastructure/drizzle-advisory-lock.js'

import { createPullEnergyTariffUseCase } from './application/pull-energy-tariff.use-case.js'
import { createPullFuelReferenceUseCase } from './application/pull-fuel-reference.use-case.js'
import { runFuelPricePullCycle, type FuelPricePullCycleResult } from './application/run-cycle.js'
import { createAneelDatastoreClient } from './infrastructure/aneel-datastore.client.js'
import { createAnpSeriesClient } from './infrastructure/anp-series.client.js'
import { createDrizzleEnergyTariffGateway } from './infrastructure/drizzle-energy-tariff.gateway.js'
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
    energyUseCase: createPullEnergyTariffUseCase({
      gateway: createDrizzleEnergyTariffGateway({ db: dependencies.db }),
      logger: dependencies.logger,
      series: createAneelDatastoreClient({
        baseUrl: settings.aneelBaseUrl,
        fetch: (url, init) => fetch(url, init),
        timeoutInMilliseconds: settings.aneelTimeoutMilliseconds,
      }),
    }),
    jobId: dependencies.config.cronJob,
    lock: createDrizzleAdvisoryLock({ db: dependencies.db }),
    logger: dependencies.logger,
    now: dependencies.now,
    pullUseCase: createPullFuelReferenceUseCase({
      gateway: createDrizzleFuelReferenceGateway({ db: dependencies.db }),
      logger: dependencies.logger,
      series: createAnpSeriesClient({
        baseUrl: settings.anpBaseUrl,
        fetch: (url, init) => fetch(url, init),
        timeoutInMilliseconds: settings.anpTimeoutMilliseconds,
      }),
    }),
  })
}
