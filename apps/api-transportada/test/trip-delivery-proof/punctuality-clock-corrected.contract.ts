/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 D4 (CA1, CA2): quando o app manda o desvio do relógio, `capturedAt` já chega corrigido e
 * a foto é julgada pela hora em que foi tirada — o piso `recebimento − missingAfterHours` (spec 159
 * T11 D3a) deixa de valer. A janela, o raio, a folga de 2 min e o "registrar depois" continuam.
 */
import { describe, expect, test } from 'bun:test'

import {
  classifyProofPunctuality,
  mergeProofPunctuality,
  type ClassifyProofPunctualityParams,
  type ProofPosition,
} from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import { DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '../../src/shared/time.constant.js'

const DELIVERED_AT = new Date('2026-10-03T10:00:00.000Z')
const DELIVERY_EVENT_POSITION = { latitude: '-23.550520', longitude: '-46.633308' }
const PHOTO_AT_DELIVERY_PLACE: ProofPosition = { accuracyMeters: 10, ...DELIVERY_EVENT_POSITION }
/** ~1,9 km ao sul da baixa: fora do raio de 300 m mesmo somando a precisão. */
const PHOTO_FAR_AWAY: ProofPosition = {
  accuracyMeters: 10,
  latitude: '-23.568',
  longitude: '-46.633308',
}
const TWO_MINUTES = 2 * MILLISECONDS_PER_MINUTE

// O campo ainda não existe em ClassifyProofPunctualityParams; a interseção sai na T1.3.
type ClockCorrectedParams = ClassifyProofPunctualityParams & {
  readonly hasCorrectedClock?: boolean
}

function afterDelivery(milliseconds: number): Date {
  return new Date(DELIVERED_AT.getTime() + milliseconds)
}

function classify(
  overrides: Partial<ClockCorrectedParams>,
): ReturnType<typeof classifyProofPunctuality> {
  const params: ClockCorrectedParams = {
    capturedAt: DELIVERED_AT,
    deliveredAt: DELIVERED_AT,
    deliveryEventPosition: DELIVERY_EVENT_POSITION,
    missingAfterHours: DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.missingAfterHours,
    photoMode: 'required',
    photoPosition: PHOTO_AT_DELIVERY_PLACE,
    proofRadiusMeters: DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofRadiusMeters,
    proofWindowMinutes: DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofWindowMinutes,
    receivedAt: afterDelivery(30 * MILLISECONDS_PER_HOUR),
    ...overrides,
  }
  return classifyProofPunctuality(params)
}

describe('foto julgada pelo relógio corrigido (spec 232 D4)', () => {
  test('os números da regra são os padrões de hoje: janela 60 min, raio 300 m, prazo 24 h', () => {
    expect(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofWindowMinutes).toBe(60)
    expect(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofRadiusMeters).toBe(300)
    expect(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.missingAfterHours).toBe(24)
  })

  /** CA1: tirada na hora da entrega, sem sinal até 30 h depois — a rede não é culpa do motorista. */
  test('CA1: foto na hora da entrega recebida 30 h depois, com relógio corrigido, é on_time', () => {
    expect(classify({ hasCorrectedClock: true })).toBe('on_time')
  })

  /** CA2: cliente antigo — sem o desvio, o piso de 24 h continua e a referência vira entrega + 6 h. */
  test('CA2: a mesma foto sem a flag continua late', () => {
    expect(classify({})).toBe('late')
  })

  test('CA2: a mesma foto com hasCorrectedClock false continua late', () => {
    expect(classify({ hasCorrectedClock: false })).toBe('late')
  })

  test('a correção não perdoa foto de fato tardia: 2 h depois da entrega é late', () => {
    const result = classify({
      capturedAt: afterDelivery(2 * MILLISECONDS_PER_HOUR),
      hasCorrectedClock: true,
    })

    expect(result).toBe('late')
  })

  test('no limite exato da janela (entrega + 60 min) é on_time', () => {
    const result = classify({
      capturedAt: afterDelivery(60 * MILLISECONDS_PER_MINUTE),
      hasCorrectedClock: true,
    })

    expect(result).toBe('on_time')
  })

  test('1 ms além da janela é late', () => {
    const result = classify({
      capturedAt: afterDelivery(60 * MILLISECONDS_PER_MINUTE + 1),
      hasCorrectedClock: true,
    })

    expect(result).toBe('late')
  })

  test('a distância continua pesando: foto na hora, mas fora do raio, é away', () => {
    expect(classify({ hasCorrectedClock: true, photoPosition: PHOTO_FAR_AWAY })).toBe('away')
  })

  test('fora do raio e tardia é late_and_away', () => {
    const result = classify({
      capturedAt: afterDelivery(2 * MILLISECONDS_PER_HOUR),
      hasCorrectedClock: true,
      photoPosition: PHOTO_FAR_AWAY,
    })

    expect(result).toBe('late_and_away')
  })

  /** RF5: antes da entrega, a hora é elevada a entrega − 2 min — nem o piso de 24 h a empurra. */
  test('capturedAt 3 h antes da entrega é elevado a entrega − 2 min e fica on_time', () => {
    const result = classify({
      capturedAt: new Date(DELIVERED_AT.getTime() - 3 * MILLISECONDS_PER_HOUR),
      hasCorrectedClock: true,
    })

    expect(result).toBe('on_time')
  })

  /**
   * RF5: no futuro, a hora é rebaixada a recebimento + 2 min. Recebida 58 min depois da entrega,
   * a referência vira entrega + 60 min — exatamente o limite da janela. Sem o teto, 3 h seria late.
   */
  test('capturedAt no futuro é rebaixado a recebimento + 2 min', () => {
    const result = classify({
      capturedAt: afterDelivery(3 * MILLISECONDS_PER_HOUR),
      hasCorrectedClock: true,
      receivedAt: afterDelivery(60 * MILLISECONDS_PER_MINUTE - TWO_MINUTES),
    })

    expect(result).toBe('on_time')
  })

  test('o teto de recebimento + 2 min também reprova: recebida 59 min depois, foto 3 h no futuro é late', () => {
    const result = classify({
      capturedAt: afterDelivery(3 * MILLISECONDS_PER_HOUR),
      hasCorrectedClock: true,
      receivedAt: afterDelivery(59 * MILLISECONDS_PER_MINUTE),
    })

    expect(result).toBe('late')
  })

  /** Spec 205 D2: "registrar entrega depois" pesa igual a foto atrasada, com ou sem correção. */
  test('lateRegistration continua mandando: late mesmo com foto na hora', () => {
    expect(classify({ hasCorrectedClock: true, lateRegistration: true })).toBe('late')
  })

  test('sem capturedAt a referência é o recebimento: recebida 30 h depois é late', () => {
    expect(classify({ capturedAt: undefined, hasCorrectedClock: true })).toBe('late')
  })

  test('sem capturedAt e recebida 10 min depois da entrega é on_time', () => {
    const result = classify({
      capturedAt: undefined,
      hasCorrectedClock: true,
      receivedAt: afterDelivery(10 * MILLISECONDS_PER_MINUTE),
    })

    expect(result).toBe('on_time')
  })

  test('modo não exigido segue not_required com a flag', () => {
    expect(classify({ hasCorrectedClock: true, photoMode: 'optional' })).toBe('not_required')
  })

  /** Spec 159 T11 D3b: a foto corrigida e pontual não lava a tardia que já estava gravada. */
  test('mergeProofPunctuality não muda: late anterior + on_time corrigido continua late', () => {
    const next = classify({ hasCorrectedClock: true })

    expect(mergeProofPunctuality({ next, previous: 'late' })).toBe('late')
  })
})
