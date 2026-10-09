/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O registro **condicional** da rotina (ADR-0100 D10, como `GOOGLE_MAPS_API_KEY`/ADR-0062): sem o token
 * a rotina não existe, nada sai do produto e a janela dela pousa em `job_run_routine_missing` — que é a
 * verdade, e que a pausa de fábrica da linha de `job_schedules` (D13) nem deixa abrir. O `fetch` da
 * rede, o relógio e o `sleep` do limitador entram aqui e só aqui.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { JobRoutineRegistry } from '../../job-run/application/job-routine.port.js'
import type { WorkerEnvironment, WorkerLogger } from '../../shared/worker.types.js'
import { createApplyHolidayProviderUseCase } from '../application/apply-holiday-provider.use-case.js'
import { createDiscoverHolidayCitiesUseCase } from '../application/discover-holiday-cities.use-case.js'
import { createFetchHolidayProviderUseCase } from '../application/fetch-holiday-provider.use-case.js'
import { createHolidayProviderPullRoutine } from '../application/holiday-provider-pull.routine.js'
import {
  FERIADOS_API_BASE_URL,
  FERIADOS_API_REQUEST_TIMEOUT_MILLISECONDS,
  HOLIDAY_PROVIDER_PULL_JOB,
} from '../domain/holiday-provider-pull.constant.js'

import { createDrizzleHolidayApplyStore } from './drizzle-holiday-apply.store.js'
import { createDrizzleHolidayDiscoveryStore } from './drizzle-holiday-discovery.store.js'
import { createDrizzleHolidayFetchStore } from './drizzle-holiday-fetch.store.js'
import { createFeriadosApiClient } from './feriados-api.client.js'

export type HolidayProviderPullDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function buildHolidayProviderPullRegistry(input: {
  readonly config: Pick<WorkerEnvironment, 'holidayProviderPull'>
  readonly database: HolidayProviderPullDatabase
  readonly logger: WorkerLogger
}): JobRoutineRegistry {
  const settings = input.config.holidayProviderPull
  if (settings === undefined) return {}

  const { database, logger } = input
  const now = () => new Date()

  return {
    [HOLIDAY_PROVIDER_PULL_JOB]: createHolidayProviderPullRoutine({
      apply: createApplyHolidayProviderUseCase({
        logger,
        now,
        store: createDrizzleHolidayApplyStore(database),
      }),
      discover: createDiscoverHolidayCitiesUseCase({
        logger,
        now,
        store: createDrizzleHolidayDiscoveryStore(database),
      }),
      fetch: createFetchHolidayProviderUseCase({
        budget: settings.monthlyRequestBudget,
        client: createFeriadosApiClient({
          baseUrl: FERIADOS_API_BASE_URL,
          fetch: (url, init) => fetch(url, init),
          timeoutInMilliseconds: FERIADOS_API_REQUEST_TIMEOUT_MILLISECONDS,
          token: settings.token,
        }),
        clock: {
          nowMilliseconds: () => Date.now(),
          sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        },
        logger,
        now,
        store: createDrizzleHolidayFetchStore(database),
      }),
      logger,
    }),
  }
}
