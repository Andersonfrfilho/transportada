/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 234 D4c: GPS desligado pune em todo cliente. A entrega registrada pelo motorista sem posição
 * conta como longe — com ou sem o relógio corrigido (D4b). A baixa do escritório nunca tem posição e
 * não é punida por isso. Sem o canal no contexto, vale a regra anterior (só a D4b pune).
 */
import { describe, expect, test } from 'bun:test'

import {
  classifyProofPunctuality,
  type ClassifyProofPunctualityParams,
  type ProofPosition,
} from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import { DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '../../src/shared/time.constant.js'

const DELIVERED_AT = new Date('2026-10-03T10:00:00.000Z')
const DELIVERY_EVENT_POSITION = { latitude: '-23.550520', longitude: '-46.633308' }
const PHOTO_AT_DELIVERY_PLACE: ProofPosition = { accuracyMeters: 10, ...DELIVERY_EVENT_POSITION }

function afterDelivery(milliseconds: number): Date {
  return new Date(DELIVERED_AT.getTime() + milliseconds)
}

const THIRTY_MINUTES_LATER = afterDelivery(30 * MILLISECONDS_PER_MINUTE)
const SIXTY_ONE_MINUTES_LATER = afterDelivery(61 * MILLISECONDS_PER_MINUTE)

/** Foto tirada na hora, no lugar, recebida 30 min depois — pontual se nada mais pesar. */
function classify(
  overrides: Partial<ClassifyProofPunctualityParams>,
): ReturnType<typeof classifyProofPunctuality> {
  const params: ClassifyProofPunctualityParams = {
    capturedAt: DELIVERED_AT,
    deliveredAt: DELIVERED_AT,
    deliveryEventPosition: DELIVERY_EVENT_POSITION,
    missingAfterHours: DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.missingAfterHours,
    photoMode: 'required',
    photoPosition: PHOTO_AT_DELIVERY_PLACE,
    proofRadiusMeters: DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofRadiusMeters,
    proofWindowMinutes: DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofWindowMinutes,
    receivedAt: THIRTY_MINUTES_LATER,
    ...overrides,
  }
  return classifyProofPunctuality(params)
}

describe('entrega do motorista sem posição conta como longe em todo cliente (spec 234 D4c)', () => {
  test('cliente antigo (sem relógio corrigido), foto no prazo: away', () => {
    expect(classify({ deliveryEventPosition: undefined, isDeliveryRecordedByDriver: true })).toBe(
      'away',
    )
  })

  test('cliente antigo com hasCorrectedClock false, foto no prazo: away', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      hasCorrectedClock: false,
      isDeliveryRecordedByDriver: true,
    })

    expect(result).toBe('away')
  })

  test('cliente antigo, foto fora da janela: late_and_away — uma penalidade só', () => {
    const result = classify({
      capturedAt: SIXTY_ONE_MINUTES_LATER,
      deliveryEventPosition: undefined,
      isDeliveryRecordedByDriver: true,
      receivedAt: SIXTY_ONE_MINUTES_LATER,
    })

    expect(result).toBe('late_and_away')
  })

  /** D4b continua: com o relógio alegado corrigido, a referência é o recebimento e a entrega é longe. */
  test('relógio corrigido, recebida 30 min depois: away (D4b intacta)', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      hasCorrectedClock: true,
      isDeliveryRecordedByDriver: true,
    })

    expect(result).toBe('away')
  })

  test('relógio corrigido, recebida 61 min depois: late_and_away (vale o recebimento)', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      hasCorrectedClock: true,
      isDeliveryRecordedByDriver: true,
      receivedAt: SIXTY_ONE_MINUTES_LATER,
    })

    expect(result).toBe('late_and_away')
  })

  test('com posição na entrega e foto no raio continua on_time', () => {
    expect(classify({ isDeliveryRecordedByDriver: true })).toBe('on_time')
  })

  test('foto sem posição continua away, com ou sem posição na entrega', () => {
    expect(classify({ isDeliveryRecordedByDriver: true, photoPosition: undefined })).toBe('away')
    expect(
      classify({
        deliveryEventPosition: undefined,
        isDeliveryRecordedByDriver: true,
        photoPosition: undefined,
      }),
    ).toBe('away')
  })

  /** Spec 205 D2: o registro tardio decide antes da distância — `late`, nunca `late_and_away`. */
  test('lateRegistration continua late, sem somar a distância', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      isDeliveryRecordedByDriver: true,
      lateRegistration: true,
    })

    expect(result).toBe('late')
  })

  test('modo da foto diferente de required continua not_required', () => {
    for (const photoMode of ['optional', 'off'] as const) {
      const result = classify({
        deliveryEventPosition: undefined,
        isDeliveryRecordedByDriver: true,
        photoMode,
      })

      expect(result).toBe('not_required')
    }
  })
})

describe('a baixa do escritório nunca tem posição e não pune o motorista (spec 234 D4c)', () => {
  test('cliente antigo, foto no prazo: on_time', () => {
    expect(classify({ deliveryEventPosition: undefined, isDeliveryRecordedByDriver: false })).toBe(
      'on_time',
    )
  })

  test('cliente antigo, foto fora da janela: late, sem away', () => {
    const result = classify({
      capturedAt: SIXTY_ONE_MINUTES_LATER,
      deliveryEventPosition: undefined,
      isDeliveryRecordedByDriver: false,
      receivedAt: SIXTY_ONE_MINUTES_LATER,
    })

    expect(result).toBe('late')
  })

  /** Sem posição o relógio corrigido segue sem valer (referência = recebimento), mas não vira longe. */
  test('relógio corrigido, recebida 30 min depois: on_time', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      hasCorrectedClock: true,
      isDeliveryRecordedByDriver: false,
    })

    expect(result).toBe('on_time')
  })

  test('relógio corrigido, recebida 61 min depois: late — o recebimento vale, a distância não pesa', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      hasCorrectedClock: true,
      isDeliveryRecordedByDriver: false,
      receivedAt: SIXTY_ONE_MINUTES_LATER,
    })

    expect(result).toBe('late')
  })

  test('foto sem posição continua away', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      isDeliveryRecordedByDriver: false,
      photoPosition: undefined,
    })

    expect(result).toBe('away')
  })
})

describe('sem o canal no contexto vale a regra anterior (compatível com quem não informa)', () => {
  test('sem posição e sem relógio corrigido: on_time', () => {
    expect(classify({ deliveryEventPosition: undefined })).toBe('on_time')
  })

  test('sem posição e com relógio corrigido: away (D4b)', () => {
    expect(classify({ deliveryEventPosition: undefined, hasCorrectedClock: true })).toBe('away')
  })

  test('recebida 30 h depois sem posição e sem relógio corrigido: late', () => {
    const result = classify({
      deliveryEventPosition: undefined,
      receivedAt: afterDelivery(30 * MILLISECONDS_PER_HOUR),
    })

    expect(result).toBe('late')
  })
})
