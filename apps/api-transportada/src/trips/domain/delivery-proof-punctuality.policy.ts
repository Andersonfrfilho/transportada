/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0070 §2-4, spec 159 RF4-RF6: a foto obrigatória do motorista nunca recusa a entrega — ela
 * classifica a pontualidade da foto para a nota (`fleet/domain/driver-score.policy.ts`). Regra pura,
 * sem I/O; quem lê `trip_stops`/`trip_stop_events`/`trip_delivery_proofs` é o repositório.
 */
import type { Coordinate } from '../../addresses/domain/coordinate-distance.js'
import { distanceInMetres } from '../../addresses/domain/coordinate-distance.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '../../shared/time.constant.js'
import { REQUIRED_PROOF_FIELD_MODE } from './delivery-event.constant.js'
import { DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS } from './field-delivery-timing.policy.js'

/** ADR-0070 §2: os cinco vereditos que uma foto de entrega pode receber. */
export const PROOF_PUNCTUALITY = {
  away: 'away',
  lateAndAway: 'late_and_away',
  late: 'late',
  notRequired: 'not_required',
  onTime: 'on_time',
} as const

export type ProofPunctuality = (typeof PROOF_PUNCTUALITY)[keyof typeof PROOF_PUNCTUALITY]

/** Posição da foto: latitude/longitude sempre juntas (RF3); precisão é opcional. */
export type ProofPosition = Coordinate & {
  readonly accuracyMeters?: number
}

export type ClassifyProofPunctualityParams = {
  readonly photoMode: DeliveryProofFieldMode
  /** `trip_stop_events.captured_at ?? recorded_at` do evento de entrega. */
  readonly deliveredAt: Date
  /** O que o aparelho do motorista diz ter tirado a foto — não confiável sozinho (RF5). */
  readonly capturedAt: Date | undefined
  /** Quando o servidor recebeu a foto. */
  readonly receivedAt: Date
  readonly photoPosition: ProofPosition | undefined
  readonly stopPosition: Coordinate | undefined
  readonly deliveryEventPosition: Coordinate | undefined
  readonly proofWindowMinutes: number
  readonly proofRadiusMeters: number
  /**
   * Spec 159 T11 (decisão D3a): o relógio do aparelho só é aceito até este tanto antes do
   * recebimento. É o mesmo prazo da foto ausente — foto que subiu depois dele não pode alegar ter
   * sido tirada na hora da entrega.
   */
  readonly missingAfterHours: number
}

/**
 * RF5: o `capturedAt` do aparelho vale, mas só dentro de `[entrega − 2 min, recebimento + 2 min]` —
 * a mesma folga da baixa pelo escritório. Ausente, a referência é o recebimento.
 *
 * Spec 159 T11 (D3a): o piso também nunca fica antes de `recebimento − missingAfterHours`. Sem isso,
 * uma foto tirada dias depois, com o relógio do aparelho voltado para a hora da entrega, passava
 * como pontual pela fila offline.
 */
function resolveTimeReference(params: ClassifyProofPunctualityParams): Date {
  if (params.capturedAt === undefined) return params.receivedAt

  const earliest = Math.max(
    params.deliveredAt.getTime() - DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS,
    params.receivedAt.getTime() - params.missingAfterHours * MILLISECONDS_PER_HOUR,
  )
  const latest = params.receivedAt.getTime() + DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS
  const clamped = Math.min(Math.max(params.capturedAt.getTime(), earliest), latest)

  return new Date(clamped)
}

function isLate(params: ClassifyProofPunctualityParams, timeReference: Date): boolean {
  const windowMilliseconds = params.proofWindowMinutes * MILLISECONDS_PER_MINUTE
  return timeReference.getTime() - params.deliveredAt.getTime() > windowMilliseconds
}

/**
 * RF6: sem posição da foto, conta como longe — o motorista precisa compartilhar a localização para
 * provar que estava no local. Sem referência nenhuma de local (parada nem evento), a distância não
 * pesa: não há como julgar.
 */
function isAway(params: ClassifyProofPunctualityParams): boolean {
  if (params.photoPosition === undefined) return true

  const locationReference = params.stopPosition ?? params.deliveryEventPosition
  if (locationReference === undefined) return false

  const distance = distanceInMetres(params.photoPosition, locationReference)
  if (distance === null) return false

  /**
   * Spec 159 T11 (item 4): a precisão declarada soma ao raio, mas no máximo um raio a mais — senão
   * `accuracyMeters` enorme transformava qualquer lugar em "no local".
   */
  const accuracy = Math.min(params.photoPosition.accuracyMeters ?? 0, params.proofRadiusMeters)
  return distance > params.proofRadiusMeters + accuracy
}

const LATE_PUNCTUALITIES: ReadonlySet<ProofPunctuality> = new Set([
  PROOF_PUNCTUALITY.late,
  PROOF_PUNCTUALITY.lateAndAway,
])
const AWAY_PUNCTUALITIES: ReadonlySet<ProofPunctuality> = new Set([
  PROOF_PUNCTUALITY.away,
  PROOF_PUNCTUALITY.lateAndAway,
])

export type MergeProofPunctualityParams = {
  /** A pontualidade da foto que já estava gravada no evento — `undefined` sem foto anterior. */
  readonly previous: ProofPunctuality | undefined
  readonly next: ProofPunctuality
}

/**
 * Spec 159 T11 (decisão D3b do usuário, 2026-09-18): a foto substituída nunca melhora a
 * pontualidade. Fica a pior das duas — `late` e `away` pesam igual, e os dois juntos são
 * `late_and_away`. `on_time` só vence `not_required`. É também o que impede a foto do escritório
 * (`not_required`) de lavar a do motorista.
 */
export function mergeProofPunctuality(params: MergeProofPunctualityParams): ProofPunctuality {
  const { next, previous } = params
  if (previous === undefined) return next

  const late = LATE_PUNCTUALITIES.has(previous) || LATE_PUNCTUALITIES.has(next)
  const away = AWAY_PUNCTUALITIES.has(previous) || AWAY_PUNCTUALITIES.has(next)
  if (late && away) return PROOF_PUNCTUALITY.lateAndAway
  if (late) return PROOF_PUNCTUALITY.late
  if (away) return PROOF_PUNCTUALITY.away
  if (previous === PROOF_PUNCTUALITY.onTime || next === PROOF_PUNCTUALITY.onTime) {
    return PROOF_PUNCTUALITY.onTime
  }
  return PROOF_PUNCTUALITY.notRequired
}

export function classifyProofPunctuality(params: ClassifyProofPunctualityParams): ProofPunctuality {
  if (params.photoMode !== REQUIRED_PROOF_FIELD_MODE) return PROOF_PUNCTUALITY.notRequired

  const timeReference = resolveTimeReference(params)
  const late = isLate(params, timeReference)
  const away = isAway(params)

  if (late && away) return PROOF_PUNCTUALITY.lateAndAway
  if (late) return PROOF_PUNCTUALITY.late
  if (away) return PROOF_PUNCTUALITY.away
  return PROOF_PUNCTUALITY.onTime
}
