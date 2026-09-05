/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import type {
  GeocodeFailureCause,
  GeocodingPort,
} from '../../routing/application/geocoding.port.js'
import { isOptimizablePrecision } from '../../routing/application/resolve-stop-coordinates.use-case.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  GEOCODING_REFINE_BATCH_SIZE,
  GEOCODING_REFINE_MAX_BATCHES,
  GEOCODING_REFINE_REQUEST_PAUSE_MILLISECONDS,
} from '../domain/geocoding-refine.constant.js'

import type {
  PendingRefinementSource,
  RefinedAddressRepository,
} from './pending-refinement.port.js'

export type GeocodingRefineDependencies = {
  readonly addresses: PendingRefinementSource
  readonly geocoding: GeocodingPort
  readonly logger: WorkerLogger
  readonly repository: RefinedAddressRepository
  readonly wait: (milliseconds: number) => Promise<void>
}

/**
 * A escalada automática da ADR-0062: o endereço que ficou no centroide do município compra a própria
 * saída, **uma vez**.
 *
 * Ela existe porque o degrau 2 manual nunca alcança este caso — a parada em `city` sai da otimização
 * (ADR-0044 §5), e o botão de marcar mora na lista que o solver ordenou, que é justamente a lista de
 * onde ela não está.
 *
 * ⚠️ Isto **não** põe provedor pago na sugestão de roteiro. A sugestão continua fazendo zero chamadas
 * pagas, e `test/routing/paid-provider-never-called.contract.ts` continua provando isso: pedir
 * roteiro tem de continuar sendo de graça, ou o gasto vira função de quantas vezes alguém clica.
 */
export function createGeocodingRefineRoutine(
  dependencies: GeocodingRefineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: GeocodingRefineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  let batches = 0
  let examined = 0
  let refined = 0
  let unchanged = 0
  let deferred = 0
  const byCause: Record<string, number> = {}

  while (batches < GEOCODING_REFINE_MAX_BATCHES && !context.isStopRequested()) {
    /**
     * Sem cursor, ao contrário da rotina gratuita: o que esta janela examina **sai da fila**, porque
     * todo caminho que não é adiamento carimba `paid_refined_at`. Paginar sobre uma fila que encolhe
     * a cada escrita puliria endereço.
     */
    const page = await dependencies.addresses.list({ limit: GEOCODING_REFINE_BATCH_SIZE })
    if (page.length === 0) break

    batches += 1
    for (const [index, pending] of page.entries()) {
      if (context.isStopRequested()) break
      if (index > 0) await dependencies.wait(GEOCODING_REFINE_REQUEST_PAUSE_MILLISECONDS)
      examined += 1

      const outcome = await refineOne({ dependencies, pending })
      if (outcome.kind === 'refined') refined += 1
      else if (outcome.kind === 'deferred') deferred += 1
      else unchanged += 1
      if (outcome.cause !== null) byCause[outcome.cause] = (byCause[outcome.cause] ?? 0) + 1
    }

    if (page.length < GEOCODING_REFINE_BATCH_SIZE) break
  }

  /** RNF1 outra vez: contagens e causas, **nunca** endereço. */
  dependencies.logger.info('geocoding_refine_cycle_finished', {
    batches,
    byCause,
    deferred,
    examined,
    refined,
    unchanged,
  })

  return {
    counters: { batches, deferred, examined, refined, unchanged, ...byCause },
    outcome: 'succeeded',
  }
}

type RefineOutcome = Readonly<{
  cause: GeocodeFailureCause | null
  kind: 'refined' | 'unchanged' | 'deferred'
}>

async function refineOne(input: {
  readonly dependencies: GeocodingRefineDependencies
  readonly pending: { readonly request: Parameters<GeocodingPort['geocode']>[0] }
}): Promise<RefineOutcome> {
  const { dependencies, pending } = input

  const result = await dependencies.geocoding
    .geocode(pending.request)
    .catch(() => ({ cause: 'transport_error' as const, coordinate: null }))

  /**
   * ⚠️ **Erro de transporte não queima a única chance do endereço.** Provedor fora do ar, DNS caído,
   * egresso bloqueado — nenhum deles é uma resposta, e nenhum deles cobra. Carimbar aqui gastaria a
   * chance sem ter comprado nada, e o endereço ficaria em centroide para sempre por causa de um
   * minuto de rede ruim.
   *
   * Toda causa em que o provedor **respondeu** (não achou, achou sem coordenada, achou pior) carimba:
   * ali a pergunta foi feita e a resposta é a que é.
   */
  if (result.cause === 'transport_error' || result.cause === 'not_configured') {
    return { cause: result.cause, kind: 'deferred' }
  }

  if (result.coordinate === null || !isOptimizablePrecision(result.coordinate.precision)) {
    await dependencies.repository.markPaid(pending.request.addressKey)

    /** `approximate` do provedor é o mesmo município que já estava lá: pago, e sem melhora. */
    return { cause: result.cause, kind: 'unchanged' }
  }

  await dependencies.repository.replace({
    addressKey: pending.request.addressKey,
    externalPlaceId: result.coordinate.externalPlaceId,
    latitude: result.coordinate.latitude,
    longitude: result.coordinate.longitude,
    precision: result.coordinate.precision,
  })

  return { cause: null, kind: 'refined' }
}
