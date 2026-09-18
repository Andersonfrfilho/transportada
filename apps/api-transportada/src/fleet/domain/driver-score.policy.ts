/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0068 §5-6, spec 157 RF8-RF9: a nota do motorista é derivada na leitura, nunca em cron. Regra
 * pura, sem I/O — quem busca as entregas dos últimos 90 dias é o repositório
 * (`DrizzleDriverScoreRepository`).
 */
import type { ProofPunctuality } from '../../trips/domain/delivery-proof-punctuality.policy.js'

/** ADR-0068 §5: penalidade vigente por 90 dias, fixo — não é parâmetro de empresa. */
export const DRIVER_SCORE_WINDOW_DAYS = 90

/** ADR-0068 §5: a nota nunca passa disso, mesmo sem nenhuma penalidade. */
export const DRIVER_SCORE_MAXIMUM = 100

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

export const DRIVER_PENALTY_REASON = {
  lateProof: 'late_proof',
  missingProof: 'missing_proof',
} as const

export type DriverPenaltyReason = (typeof DRIVER_PENALTY_REASON)[keyof typeof DRIVER_PENALTY_REASON]

export type DriverScoreSettings = {
  readonly latePenaltyPoints: number
  readonly missingPenaltyPoints: number
  readonly missingAfterHours: number
}

/**
 * Uma entrega avaliável: `photoMode` é o modo **resolvido atual** (RF8, casos extremos) — mudar a
 * configuração depois da entrega muda a avaliação de ausência, nunca a pontualidade já gravada.
 * `photoPunctuality` é `undefined` quando a foto ainda não chegou.
 */
export type DriverScoreDelivery = {
  readonly tripDocumentId: string
  readonly documentNumber: string
  readonly deliveredAt: Date
  readonly photoMode: 'required' | 'optional' | 'off'
  readonly photoPunctuality: ProofPunctuality | undefined
}

export type DriverPenalty = {
  readonly tripDocumentId: string
  readonly documentNumber: string
  readonly deliveredAt: Date
  readonly expiresAt: Date
  readonly points: number
  readonly reason: DriverPenaltyReason
}

export type ComputeDriverScoreParams = {
  readonly now: Date
  readonly settings: DriverScoreSettings
  readonly deliveries: readonly DriverScoreDelivery[]
}

export type DriverScoreResult = {
  readonly score: number | null
  readonly penalties: readonly DriverPenalty[]
}

function isWithinWindow(deliveredAt: Date, now: Date): boolean {
  const windowMilliseconds = DRIVER_SCORE_WINDOW_DAYS * MILLISECONDS_PER_DAY
  return now.getTime() - deliveredAt.getTime() <= windowMilliseconds
}

/**
 * RF8: foto fora da regra tira `latePenaltyPoints` (late/away/late_and_away — uma penalidade por
 * entrega, nunca soma os dois motivos). Sem foto e dentro do prazo, nenhuma ainda: fica pendente.
 * `on_time`/`not_required` não penaliza — foto gravada quando não era exigida conta como pontual.
 */
function buildPenalty(
  delivery: DriverScoreDelivery,
  settings: DriverScoreSettings,
  now: Date,
): DriverPenalty | undefined {
  const expiresAt = new Date(
    delivery.deliveredAt.getTime() + DRIVER_SCORE_WINDOW_DAYS * MILLISECONDS_PER_DAY,
  )

  if (delivery.photoPunctuality === undefined) {
    const hoursSinceDelivery =
      (now.getTime() - delivery.deliveredAt.getTime()) / MILLISECONDS_PER_HOUR
    if (hoursSinceDelivery <= settings.missingAfterHours) return undefined

    return {
      deliveredAt: delivery.deliveredAt,
      documentNumber: delivery.documentNumber,
      expiresAt,
      points: settings.missingPenaltyPoints,
      reason: DRIVER_PENALTY_REASON.missingProof,
      tripDocumentId: delivery.tripDocumentId,
    }
  }

  const isLateProof =
    delivery.photoPunctuality === 'late' ||
    delivery.photoPunctuality === 'away' ||
    delivery.photoPunctuality === 'late_and_away'
  if (!isLateProof) return undefined

  return {
    deliveredAt: delivery.deliveredAt,
    documentNumber: delivery.documentNumber,
    expiresAt,
    points: settings.latePenaltyPoints,
    reason: DRIVER_PENALTY_REASON.lateProof,
    tripDocumentId: delivery.tripDocumentId,
  }
}

/**
 * RF8/RF9: só entregas com `photoMode = 'required'` (atual) e dentro dos 90 dias contam. Sem
 * nenhuma, a nota é `null` — sem histórico, não zero. Penalidades ordenadas da mais recente para a
 * mais antiga.
 */
export function computeDriverScore(params: ComputeDriverScoreParams): DriverScoreResult {
  const evaluableDeliveries = params.deliveries.filter(
    (delivery) =>
      delivery.photoMode === 'required' && isWithinWindow(delivery.deliveredAt, params.now),
  )

  if (evaluableDeliveries.length === 0) return { penalties: [], score: null }

  const penalties = evaluableDeliveries
    .map((delivery) => buildPenalty(delivery, params.settings, params.now))
    .filter((penalty): penalty is DriverPenalty => penalty !== undefined)
    .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime())

  const totalPoints = penalties.reduce((sum, penalty) => sum + penalty.points, 0)
  const score = Math.max(0, DRIVER_SCORE_MAXIMUM - totalPoints)

  return { penalties, score }
}
