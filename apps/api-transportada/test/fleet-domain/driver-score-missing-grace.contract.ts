/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 D5 (CA4): o prazo de "foto ausente" conta de `max(entrega, recebimento da entrega)`. Se a
 * própria entrega chegou tarde ao servidor, o motorista estava sem sinal, e a foto vem logo atrás
 * dela na mesma drenagem da fila. A validade da penalidade (`expiresAt`) segue contada da entrega.
 */
import { describe, expect, test } from 'bun:test'

import {
  computeDriverScore,
  DRIVER_SCORE_WINDOW_DAYS,
  type DriverScoreDelivery,
} from '../../src/fleet/domain/driver-score.policy.js'
import type { ProofPunctuality } from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR } from '../../src/shared/time.constant.js'

const NOW = new Date('2026-10-03T12:00:00.000Z')
const SETTINGS = { latePenaltyPoints: 5, missingAfterHours: 24, missingPenaltyPoints: 10 }

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * MILLISECONDS_PER_HOUR)
}

function buildDelivery(input: {
  readonly deliveredAt: Date
  readonly deliveryReceivedAt?: Date
  readonly photoPunctuality?: ProofPunctuality
  readonly tripDocumentId?: string
}): DriverScoreDelivery {
  return {
    deliveredAt: input.deliveredAt,
    deliveryReceivedAt: input.deliveryReceivedAt,
    documentNumber: '2320',
    photoMode: 'required',
    photoPunctuality: input.photoPunctuality,
    tripDocumentId: input.tripDocumentId ?? 'doc-232',
  }
}

function score(delivery: DriverScoreDelivery): ReturnType<typeof computeDriverScore> {
  const deliveries: readonly DriverScoreDelivery[] = [delivery]
  return computeDriverScore({ deliveries, now: NOW, settings: SETTINGS })
}

describe('prazo de "foto ausente" contado do recebimento da entrega (spec 232 D5)', () => {
  /** CA4: tocada há 30 h sem sinal, a entrega só chegou há 1 h — a foto ainda tem prazo. */
  test('CA4: entrega de 30 h atrás recebida há 1 h, sem foto, ainda não penaliza', () => {
    const result = score(
      buildDelivery({ deliveredAt: hoursAgo(30), deliveryReceivedAt: hoursAgo(1) }),
    )

    expect(result).toEqual({ penalties: [], score: 100 })
  })

  test('sem deliveryReceivedAt vale a regra de hoje: 30 h sem foto é missing_proof', () => {
    const result = score(buildDelivery({ deliveredAt: hoursAgo(30) }))

    expect(result.score).toBe(90)
    expect(result.penalties).toHaveLength(1)
    expect(result.penalties[0]?.reason).toBe('missing_proof')
  })

  test('recebida há 25 h, já passou do prazo contado do recebimento: missing_proof', () => {
    const result = score(
      buildDelivery({ deliveredAt: hoursAgo(30), deliveryReceivedAt: hoursAgo(25) }),
    )

    expect(result.score).toBe(90)
    expect(result.penalties[0]?.reason).toBe('missing_proof')
  })

  test('fronteira: exatamente 24 h desde o recebimento ainda não penaliza', () => {
    const result = score(
      buildDelivery({ deliveredAt: hoursAgo(30), deliveryReceivedAt: hoursAgo(24) }),
    )

    expect(result).toEqual({ penalties: [], score: 100 })
  })

  test('fronteira: 24 h + 1 ms desde o recebimento penaliza', () => {
    const deliveryReceivedAt = new Date(hoursAgo(24).getTime() - 1)
    const result = score(buildDelivery({ deliveredAt: hoursAgo(30), deliveryReceivedAt }))

    expect(result.score).toBe(90)
    expect(result.penalties[0]?.reason).toBe('missing_proof')
  })

  /** Relógio estranho: o recebimento antes da entrega não adianta o prazo — vale o `max`. */
  test('recebimento anterior à entrega não adianta o prazo: entrega de 23 h atrás não penaliza', () => {
    const result = score(
      buildDelivery({ deliveredAt: hoursAgo(23), deliveryReceivedAt: hoursAgo(40) }),
    )

    expect(result).toEqual({ penalties: [], score: 100 })
  })

  test('recebimento anterior à entrega não adianta o prazo: entrega de 25 h atrás penaliza', () => {
    const result = score(
      buildDelivery({ deliveredAt: hoursAgo(25), deliveryReceivedAt: hoursAgo(40) }),
    )

    expect(result.score).toBe(90)
    expect(result.penalties[0]?.reason).toBe('missing_proof')
  })

  test('com foto late, o recebimento recente não muda nada: late_proof', () => {
    const result = score(
      buildDelivery({
        deliveredAt: hoursAgo(30),
        deliveryReceivedAt: hoursAgo(1),
        photoPunctuality: 'late',
      }),
    )

    expect(result.score).toBe(95)
    expect(result.penalties[0]?.reason).toBe('late_proof')
  })

  test('com foto on_time, o recebimento antigo não muda nada: sem penalidade', () => {
    const result = score(
      buildDelivery({
        deliveredAt: hoursAgo(30),
        deliveryReceivedAt: hoursAgo(29),
        photoPunctuality: 'on_time',
      }),
    )

    expect(result).toEqual({ penalties: [], score: 100 })
  })

  test('a validade da penalidade conta da entrega, não do recebimento', () => {
    const deliveredAt = hoursAgo(30)
    const result = score(buildDelivery({ deliveredAt, deliveryReceivedAt: hoursAgo(25) }))

    expect(result.penalties).toHaveLength(1)
    expect(result.penalties[0]?.deliveredAt).toEqual(deliveredAt)
    expect(result.penalties[0]?.expiresAt).toEqual(
      new Date(deliveredAt.getTime() + DRIVER_SCORE_WINDOW_DAYS * MILLISECONDS_PER_DAY),
    )
  })
})

/**
 * Spec 232 D5, validação do architect: o recebimento da entrega só adia o prazo de "ausente". A janela
 * de 90 dias e o corte `effectiveSince` (spec 159 T11 D1) seguem filtrando por `deliveredAt`, e a
 * ordenação e a validade das penalidades também.
 */
describe('o recebimento da entrega não mexe na janela da nota (spec 232 D5)', () => {
  test('entrega de 91 dias atrás recebida há 1 h não entra na nota', () => {
    const result = score(
      buildDelivery({
        deliveredAt: new Date(NOW.getTime() - 91 * MILLISECONDS_PER_DAY),
        deliveryReceivedAt: hoursAgo(1),
        photoPunctuality: 'late',
      }),
    )

    expect(result).toEqual({ penalties: [], score: null })
  })

  test('entrega anterior ao effectiveSince e recebida depois dele não entra na nota', () => {
    const effectiveSince = hoursAgo(48)
    const deliveries: readonly DriverScoreDelivery[] = [
      buildDelivery({
        deliveredAt: hoursAgo(50),
        deliveryReceivedAt: hoursAgo(1),
        photoPunctuality: 'late',
      }),
    ]

    const result = computeDriverScore({ deliveries, effectiveSince, now: NOW, settings: SETTINGS })

    expect(result).toEqual({ penalties: [], score: null })
  })

  /** Recebida mais recentemente, a entrega mais antiga continua depois na lista: ordena por `deliveredAt`. */
  test('o recebimento não altera a ordenação nem a validade das penalidades', () => {
    const olderDeliveredAt = hoursAgo(40)
    const newerDeliveredAt = hoursAgo(30)
    const deliveries: readonly DriverScoreDelivery[] = [
      buildDelivery({
        deliveredAt: olderDeliveredAt,
        deliveryReceivedAt: hoursAgo(26),
        tripDocumentId: 'doc-older',
      }),
      buildDelivery({
        deliveredAt: newerDeliveredAt,
        deliveryReceivedAt: hoursAgo(30),
        tripDocumentId: 'doc-newer',
      }),
    ]

    const result = computeDriverScore({ deliveries, now: NOW, settings: SETTINGS })
    const windowMilliseconds = DRIVER_SCORE_WINDOW_DAYS * MILLISECONDS_PER_DAY

    expect(result.penalties.map((penalty) => penalty.tripDocumentId)).toEqual([
      'doc-newer',
      'doc-older',
    ])
    expect(result.penalties.map((penalty) => penalty.expiresAt)).toEqual([
      new Date(newerDeliveredAt.getTime() + windowMilliseconds),
      new Date(olderDeliveredAt.getTime() + windowMilliseconds),
    ])
    expect(result.score).toBe(80)
  })
})
