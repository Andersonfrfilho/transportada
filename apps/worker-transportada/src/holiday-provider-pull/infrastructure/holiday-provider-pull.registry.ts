/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O registro da rotina (spec 262, ADR-0102 D3): **sempre registrada**, como `trip.location.purge` (spec 239). A
 * chave da FeriadosAPI e o orçamento do mês moram no banco e são lidos a cada ciclo; sem chave a busca não roda
 * (contador `token_missing`, nenhuma requisição) e a janela fecha pelo resto, em vez de pousar em
 * `job_run_routine_missing`. A linha de `job_schedules` continua pausada de fábrica (ADR-0100 D13). O `fetch` da
 * rede, o relógio e o `sleep` do limitador entram aqui e só aqui.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { SecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import type { JobRoutineRegistry } from '../../job-run/application/job-routine.port.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { createApplyHolidayProviderUseCase } from '../application/apply-holiday-provider.use-case.js'
import { createDiscoverHolidayCitiesUseCase } from '../application/discover-holiday-cities.use-case.js'
import { createFetchHolidayProviderUseCase } from '../application/fetch-holiday-provider.use-case.js'
import { createFetchHolidayProviderWithAccessUseCase } from '../application/fetch-holiday-provider-with-access.use-case.js'
import { createHolidayProviderPullRoutine } from '../application/holiday-provider-pull.routine.js'
import { createHolidayProviderTokenSecretService } from '../application/holiday-provider-token-secret.service.js'
import type { RequestClock } from '../application/request-limiter.js'
import {
  FERIADOS_API_BASE_URL,
  FERIADOS_API_REQUEST_TIMEOUT_MILLISECONDS,
  HOLIDAY_PROVIDER_PULL_JOB,
} from '../domain/holiday-provider-pull.constant.js'

import { createDrizzleHolidayApplyStore } from './drizzle-holiday-apply.store.js'
import { createDrizzleHolidayDiscoveryStore } from './drizzle-holiday-discovery.store.js'
import { createDrizzleHolidayFetchStore } from './drizzle-holiday-fetch.store.js'
import { createDrizzleHolidayProviderSettingsReader } from './drizzle-holiday-provider-settings.reader.js'
import { createFeriadosApiClient, type FeriadosApiFetch } from './feriados-api.client.js'

const SYSTEM_CLOCK: RequestClock = {
  nowMilliseconds: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}

const NETWORK_FETCH: FeriadosApiFetch = (url, init) => fetch(url, init)

export type HolidayProviderPullDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function buildHolidayProviderPullRegistry(input: {
  readonly clock?: RequestClock
  readonly database: HolidayProviderPullDatabase
  readonly envelopeProvider: SecretEnvelopeProvider
  readonly fetch?: FeriadosApiFetch
  readonly logger: WorkerLogger
}): JobRoutineRegistry {
  const { database, logger } = input
  const clock = input.clock ?? SYSTEM_CLOCK
  const networkFetch = input.fetch ?? NETWORK_FETCH
  const now = () => new Date()
  const fetchStore = createDrizzleHolidayFetchStore(database)
  const access = createDrizzleHolidayProviderSettingsReader({
    database,
    tokenSecret: createHolidayProviderTokenSecretService({
      envelopeProvider: input.envelopeProvider,
    }),
  })

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
      fetch: createFetchHolidayProviderWithAccessUseCase({
        access,
        createFetch: ({ budget, token }) =>
          createFetchHolidayProviderUseCase({
            budget,
            client: createFeriadosApiClient({
              baseUrl: FERIADOS_API_BASE_URL,
              fetch: networkFetch,
              timeoutInMilliseconds: FERIADOS_API_REQUEST_TIMEOUT_MILLISECONDS,
              token,
            }),
            clock,
            logger,
            now,
            store: fetchStore,
          }),
      }),
      logger,
    }),
  }
}
