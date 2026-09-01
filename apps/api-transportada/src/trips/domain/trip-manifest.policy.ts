/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFiscalReadinessSnapshot } from '../application/read-trip-fiscal-readiness.use-case.js'
import { resolveTripRequiresMdfe } from './trip-mdfe-requirement.policy.js'
import { isTripDispatched } from './trip-state.policy.js'

/**
 * ADR-0046 §4 e §6: **o portão da emissão, num lugar só**. Manual e automático passam por aqui.
 *
 * A garantia que ele protege é a da ADR-0043 §2: *depois de `dispatched` nenhuma nota entra ou sai*,
 * então o conjunto declarado no manifesto não pode mudar por baixo dele. Essa garantia vale para
 * `dispatched`, `in_transit` **e** `completed` — as três são "a carga já saiu".
 *
 * Exigir `dispatched` exato, como esta política fazia, recusava justamente o caso normal desta
 * operação (spec 065): **o caminhão sai antes de qualquer emissão**, e o lote de CT-e é autorizado
 * pela contratante com a viagem já na rua ou de volta. O que continua recusado é o oposto —
 * manifestar carga que ainda **não** saiu, porque aí a nota seguinte ainda pode entrar.
 */
export const TRIP_MANIFEST_BLOCKS = {
  /** O layout do MDF-e limita a 50, e distribuição capilar passa disso todo dia. */
  dischargeCitiesOverLimit: 'TRIP_MANIFEST_DISCHARGE_CITIES_OVER_LIMIT',
  /** Já existe manifesto vivo: emitir de novo seria declarar a mesma carga duas vezes. */
  manifestAlreadyLive: 'TRIP_MANIFEST_ALREADY_LIVE',
  /** A carga ainda não saiu, então o conjunto de notas ainda muda (ADR-0043 §2). */
  tripNotDispatched: 'TRIP_MANIFEST_TRIP_NOT_DISPATCHED',
  /** Falta CT-e autorizado em alguma nota — a readiness diz em qual e por quê. */
  readinessIncomplete: 'TRIP_MANIFEST_READINESS_INCOMPLETE',
  /** Spec 065 D4c: a viagem não manifesta — por classificação ou porque alguém dispensou. */
  manifestNotRequired: 'TRIP_MANIFEST_NOT_REQUIRED',
} as const

export type TripManifestBlock = (typeof TRIP_MANIFEST_BLOCKS)[keyof typeof TRIP_MANIFEST_BLOCKS]

export const MAX_DISCHARGE_CITIES_PER_MANIFEST = 50

export type CheckTripAcceptsManifestParams = {
  readonly dischargeCityCount: number
  readonly readiness: TripFiscalReadinessSnapshot
  /** `null` é o padrão e significa "derive da classificação" (spec 065 D4c). */
  readonly requiresMdfe?: boolean | null
  readonly tripStatus: TripStatus
}

/**
 * A ordem dos portões é decisão: o **despacho vem primeiro** porque é a resposta mais acionável — a
 * viagem pode estar fiscalmente perfeita e ainda assim não ser hora de manifestar, e mandar o
 * operador conferir CT-e nessa situação é mandá-lo procurar problema que não existe.
 */
export function checkTripAcceptsManifest(
  input: CheckTripAcceptsManifestParams,
): TripManifestBlock | null {
  if (!isTripDispatched(input.tripStatus)) return TRIP_MANIFEST_BLOCKS.tripNotDispatched
  if (input.readiness.state === 'manifested' || input.readiness.state === 'divergent') {
    return TRIP_MANIFEST_BLOCKS.manifestAlreadyLive
  }
  // Depois do manifesto vivo, porque "já existe um" é resposta mais acionável que "não precisa".
  if (
    !resolveTripRequiresMdfe({
      manifestableCount: input.readiness.manifestableCount,
      requiresMdfe: input.requiresMdfe ?? null,
    })
  ) {
    return TRIP_MANIFEST_BLOCKS.manifestNotRequired
  }
  if (input.readiness.state !== 'ready') return TRIP_MANIFEST_BLOCKS.readinessIncomplete
  if (input.dischargeCityCount > MAX_DISCHARGE_CITIES_PER_MANIFEST) {
    return TRIP_MANIFEST_BLOCKS.dischargeCitiesOverLimit
  }

  return null
}

/**
 * ADR-0046 §3: mesmo com a empresa optando pelo automático, o gatilho só age depois de a carga sair.
 * Esta
 * é a função que o consumer chama, e ela é deliberadamente separada do portão acima: o botão manual
 * recusa **com motivo**, e o automático simplesmente **não age** — recusar em silêncio na tela é
 * ruim, e notificar "não emiti porque a viagem está em rascunho" a cada CT-e autorizado é pior.
 */
export function shouldIssueAutomatically(input: {
  readonly isAutomaticEnabled: boolean
  readonly readiness: TripFiscalReadinessSnapshot
  readonly requiresMdfe?: boolean | null
  readonly tripStatus: TripStatus
}): boolean {
  if (!input.isAutomaticEnabled) return false

  return (
    checkTripAcceptsManifest({
      dischargeCityCount: 0,
      readiness: input.readiness,
      requiresMdfe: input.requiresMdfe ?? null,
      tripStatus: input.tripStatus,
    }) === null
  )
}
