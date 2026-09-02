/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { geocodeAddresses } from '../../routing/application/geocode-address.use-case.js'
import type { CentroidPort } from '../../routing/application/geocode-address.use-case.js'
import type {
  GeocodeAddressRequest,
  GeocodedAddressRepository,
  GeocodingPort,
} from '../../routing/application/geocoding.port.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  GEOCODING_BACKFILL_BATCH_PAUSE_MILLISECONDS,
  GEOCODING_BACKFILL_BATCH_SIZE,
  GEOCODING_BACKFILL_MAX_BATCHES,
  GEOCODING_BACKFILL_REQUEST_PAUSE_MILLISECONDS,
} from '../domain/geocoding-backfill.constant.js'

import type {
  PendingGeocodingAddress,
  PendingGeocodingAddressSource,
} from './pending-address.port.js'

export type GeocodingBackfillDependencies = {
  readonly addresses: PendingGeocodingAddressSource
  readonly geocoding: GeocodingPort
  readonly logger: WorkerLogger
  readonly repository: GeocodedAddressRepository
  readonly wait: (milliseconds: number) => Promise<void>
}

/**
 * ⚠️ **A população declina o último degrau da cascata, e isso é a decisão central desta rotina.**
 *
 * No caminho da sugestão o centroide de município é bem-vindo: a parada precisa de **alguma**
 * coordenada agora, e o palpite entra marcado e fora da otimização. Aqui não há pressa — e gravar
 * `city` deixaria o endereço em base, onde a cascata **nunca mais o reconsulta**. Um dia de provedor
 * fora do ar viraria uma cidade inteira degradada para sempre, em silêncio.
 *
 * Não resolver custa nada: o endereço volta na próxima janela, e a sugestão continua tendo o
 * município como queda no momento em que precisar dele.
 */
const DECLINES_THE_MUNICIPALITY_FALLBACK: CentroidPort = { byCityCode: () => Promise.resolve(null) }

/**
 * Adianta a coordenada dos endereços que as notas já trouxeram, para que ninguém espere rede quando
 * pedir o roteiro. É adiantamento, nunca pré-requisito: o que ela não alcançou a sugestão resolve
 * sozinha (RF2).
 *
 * Converge por desenho — o que resolve sai da fila, e um ciclo sem pendência fecha em zero.
 */
export function createGeocodingBackfillRoutine(
  dependencies: GeocodingBackfillDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: GeocodingBackfillDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  let after: string | undefined
  let batches = 0
  let examined = 0
  let resolved = 0
  let unresolved = 0
  const byCause: Record<string, number> = {}

  while (batches < GEOCODING_BACKFILL_MAX_BATCHES && !context.isStopRequested()) {
    const page = await dependencies.addresses.list({
      after,
      limit: GEOCODING_BACKFILL_BATCH_SIZE,
    })
    if (page.length === 0) break

    const { counts } = await geocodeAddresses(
      {
        centroids: DECLINES_THE_MUNICIPALITY_FALLBACK,
        geocoding: dependencies.geocoding,
        repository: dependencies.repository,
        waitBetweenCalls: () => dependencies.wait(GEOCODING_BACKFILL_REQUEST_PAUSE_MILLISECONDS),
      },
      page.map(toRequest),
    )

    batches += 1
    examined += page.length
    resolved += counts.resolvedByPostalCode
    unresolved += counts.unresolved
    for (const [cause, total] of Object.entries(counts.byCause)) {
      byCause[cause] = (byCause[cause] ?? 0) + total
    }
    after = page.at(-1)?.addressKey

    /** Página menor que o lote é o fim da fila: pedir a próxima seria uma consulta para nada. */
    if (page.length < GEOCODING_BACKFILL_BATCH_SIZE) break

    await dependencies.wait(GEOCODING_BACKFILL_BATCH_PAUSE_MILLISECONDS)
  }

  /**
   * RNF1: contagens e **causas**, nunca endereço.
   *
   * ⚠️ Sem o `byCause` esta linha contava o fracasso sem nomeá-lo — staging passou seis ciclos
   * dizendo `unresolved: 5` sem distinguir CEP inexistente de egresso bloqueado de defeito nosso.
   */
  dependencies.logger.info('geocoding_backfill_cycle_finished', {
    batches,
    byCause,
    examined,
    resolved,
    unresolved,
  })

  return {
    counters: { batches, examined, resolved, unresolved, ...byCause },
    outcome: 'succeeded',
  }
}

function toRequest(address: PendingGeocodingAddress): GeocodeAddressRequest {
  return {
    addressKey: address.addressKey,
    city: '',
    cityCode: address.cityCode,
    district: '',
    number: '',
    postalCode: address.postalCode,
    state: '',
    street: '',
  }
}
