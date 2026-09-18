/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0068 §2-4, spec 157 RF4-RF6: a foto obrigatória do motorista nunca recusa a entrega — ela
 * classifica a pontualidade da foto para a nota (`fleet/domain/driver-score.policy.ts`). Regra pura,
 * sem I/O; quem lê `trip_stops`/`trip_stop_events`/`trip_delivery_proofs` é o repositório.
 */
import type { Coordinate } from '../../addresses/domain/coordinate-distance.js'
import { distanceInMetres } from '../../addresses/domain/coordinate-distance.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS } from './field-delivery-timing.policy.js'

/** ADR-0068 §2: os cinco vereditos que uma foto de entrega pode receber. */
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
}

/**
 * RF5: o `capturedAt` do aparelho vale, mas só dentro de `[entrega − 2 min, recebimento + 2 min]` —
 * a mesma folga da baixa pelo escritório. Fora da faixa, ou ausente, a referência é o recebimento.
 */
function resolveTimeReference(params: ClassifyProofPunctualityParams): Date {
  if (params.capturedAt === undefined) return params.receivedAt

  const earliest = params.deliveredAt.getTime() - DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS
  const latest = params.receivedAt.getTime() + DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS
  const clamped = Math.min(Math.max(params.capturedAt.getTime(), earliest), latest)

  return new Date(clamped)
}

function isLate(params: ClassifyProofPunctualityParams, timeReference: Date): boolean {
  const windowMilliseconds = params.proofWindowMinutes * 60 * 1000
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

  const radius = params.proofRadiusMeters + (params.photoPosition.accuracyMeters ?? 0)
  return distance > radius
}

export function classifyProofPunctuality(params: ClassifyProofPunctualityParams): ProofPunctuality {
  if (params.photoMode !== 'required') return PROOF_PUNCTUALITY.notRequired

  const timeReference = resolveTimeReference(params)
  const late = isLate(params, timeReference)
  const away = isAway(params)

  if (late && away) return PROOF_PUNCTUALITY.lateAndAway
  if (late) return PROOF_PUNCTUALITY.late
  if (away) return PROOF_PUNCTUALITY.away
  return PROOF_PUNCTUALITY.onTime
}
