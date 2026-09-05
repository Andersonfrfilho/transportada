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
import { checkPlaceAcceptance } from '../domain/place-acceptance.policy.js'

import type {
  PendingRefinementSource,
  RefinedAddressRepository,
} from './pending-refinement.port.js'
import type { PlaceLookupPort } from './place-lookup.port.js'

export type GeocodingRefineDependencies = {
  readonly addresses: PendingRefinementSource
  readonly geocoding: GeocodingPort
  readonly logger: WorkerLogger
  /**
   * O degrau 2b (adendo de 2026-09-05 à ADR-0062). Opcional: sem ele a rotina se comporta como
   * antes, e o endereço que a Geocoding não resolve é carimbado e vira pendência de cadastro.
   */
  readonly places?: PlaceLookupPort
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
  /** Vocabulário aberto: o degrau 2b acrescenta as recusas dele às causas da geocodificação. */
  cause: GeocodeFailureCause | PlaceRefusal | null
  kind: 'refined' | 'unchanged' | 'deferred'
}>

type PlaceRefusal =
  | 'place_city_mismatch'
  | 'place_no_result'
  | 'place_number_mismatch'
  | 'place_without_number'

/**
 * `null` quando o degrau 2b não decidiu nada — sem provedor configurado, ou recusa que deve deixar o
 * fluxo seguir para o carimbo. Quem chama não precisa saber a diferença; o contador sim.
 */
async function lookupPlace(input: {
  readonly dependencies: GeocodingRefineDependencies
  readonly pending: { readonly request: Parameters<GeocodingPort['geocode']>[0] }
}): Promise<RefineOutcome | null> {
  const { dependencies, pending } = input
  if (dependencies.places === undefined) return null

  const found = await dependencies.places
    .lookup(pending.request)
    .catch(() => ({ cause: 'transport_error' as const, place: null }))

  /** Adia sem carimbar, pela mesma razão do degrau 1: recusa do provedor não é resposta. */
  if (found.cause === 'transport_error' || found.cause === 'not_configured') {
    return { cause: found.cause, kind: 'deferred' }
  }
  if (found.place === null) {
    await dependencies.repository.markPaid(pending.request.addressKey)

    return { cause: 'place_no_result', kind: 'unchanged' }
  }

  const acceptance = checkPlaceAcceptance({
    candidate: found.place,
    request: { city: pending.request.city, number: pending.request.number },
  })
  if (acceptance !== 'accepted') {
    await dependencies.repository.markPaid(pending.request.addressKey)

    return { cause: `place_${acceptance}` as PlaceRefusal, kind: 'unchanged' }
  }

  /**
   * `rooftop` porque a Places devolveu a **porta** — o `street_number` bateu com o pedido, e é essa
   * conferência que separa isto de um ponto de rua. Sem ela seria a família de defeito da
   * ADR-0044 §1: número plausível, sem aviso.
   */
  await dependencies.repository.replace({
    addressKey: pending.request.addressKey,
    externalPlaceId: found.place.placeId,
    latitude: found.place.latitude,
    longitude: found.place.longitude,
    precision: 'rooftop',
  })

  return { cause: null, kind: 'refined' }
}

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
    /**
     * ⚠️ **É aqui que o degrau 2b entra, e a razão é medida.** A Geocoding tolera **um** erro de
     * grafia no logradouro e desiste com dois — e o cadastro real tem dois com frequência. A Places
     * acha o lugar mesmo assim, e recusa (lista vazia) quando a rua não existe.
     */
    const fromPlace = await lookupPlace({ dependencies, pending })
    if (fromPlace !== null) return fromPlace

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
