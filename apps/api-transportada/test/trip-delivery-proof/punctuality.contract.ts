/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  classifyProofPunctuality,
  mergeProofPunctuality,
  type ProofPunctuality,
} from '../../src/trips/domain/delivery-proof-punctuality.policy.js'

const DELIVERED_AT = new Date('2026-09-18T12:00:00.000Z')
const RECEIVED_AT = new Date('2026-09-18T12:15:00.000Z')
const STOP_POSITION = { latitude: '-23.550520', longitude: '-46.633308' }

describe('classificação da pontualidade da foto (spec 157 RF4-RF6)', () => {
  test('não exige quando o modo não é required', () => {
    expect(
      classifyProofPunctuality({
        capturedAt: undefined,
        deliveredAt: DELIVERED_AT,
        deliveryEventPosition: undefined,
        photoMode: 'optional',
        photoPosition: undefined,
        proofRadiusMeters: 300,
        proofWindowMinutes: 60,
        receivedAt: RECEIVED_AT,
        stopPosition: undefined,
      }),
    ).toBe('not_required')

    expect(
      classifyProofPunctuality({
        capturedAt: undefined,
        deliveredAt: DELIVERED_AT,
        deliveryEventPosition: undefined,
        photoMode: 'off',
        photoPosition: undefined,
        proofRadiusMeters: 300,
        proofWindowMinutes: 60,
        receivedAt: RECEIVED_AT,
        stopPosition: undefined,
      }),
    ).toBe('not_required')
  })

  /** Aceite 3: 100 m e 10 min depois da entrega — dentro da janela (60) e do raio (300). */
  test('pontual: perto e dentro da janela', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { accuracyMeters: 10, latitude: '-23.551430', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
      stopPosition: STOP_POSITION,
    })

    expect(result).toBe('on_time')
  })

  /** Aceite 4: 2h depois com janela 60 → late. */
  test('tardia: referência mais de proofWindowMinutes depois da entrega', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T14:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { latitude: STOP_POSITION.latitude, longitude: STOP_POSITION.longitude },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T14:00:05.000Z'),
      stopPosition: STOP_POSITION,
    })

    expect(result).toBe('late')
  })

  /** Aceite 4: 2 km de distância com raio 300 → away. */
  test('longe: distância maior que o raio mais a precisão', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
      stopPosition: STOP_POSITION,
    })

    expect(result).toBe('away')
  })

  /** Aceite 4: sem posição da foto → away, mesmo dentro da janela. */
  test('sem posição da foto conta como longe', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: undefined,
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
      stopPosition: STOP_POSITION,
    })

    expect(result).toBe('away')
  })

  test('tardia e longe combinam em late_and_away', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T15:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T15:00:05.000Z'),
      stopPosition: STOP_POSITION,
    })

    expect(result).toBe('late_and_away')
  })

  /** RF5: capturedAt no futuro é limitado ao recebimento + 2 min, nunca recusado. */
  test('capturedAt no futuro é limitado pela folga de 2 minutos', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-19T12:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { latitude: STOP_POSITION.latitude, longitude: STOP_POSITION.longitude },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: RECEIVED_AT,
      stopPosition: STOP_POSITION,
    })

    // referência vira RECEIVED_AT + 2min = 12:17, 17 min depois da entrega: dentro da janela de 60
    expect(result).toBe('on_time')
  })

  /** RF5: capturedAt antes da entrega é limitado a deliveredAt − 2 min. */
  test('capturedAt antes da entrega é limitado pela folga de 2 minutos', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T10:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { latitude: STOP_POSITION.latitude, longitude: STOP_POSITION.longitude },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: RECEIVED_AT,
      stopPosition: STOP_POSITION,
    })

    // referência vira DELIVERED_AT − 2min, antes da entrega: diferença negativa, não é tardia
    expect(result).toBe('on_time')
  })

  /** RF6: parada sem coordenada usa a posição do evento de entrega. */
  test('parada sem coordenada usa a posição do evento de entrega', () => {
    const away = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: STOP_POSITION,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
      stopPosition: undefined,
    })

    expect(away).toBe('away')

    const onTime = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: STOP_POSITION,
      photoMode: 'required',
      photoPosition: { latitude: STOP_POSITION.latitude, longitude: STOP_POSITION.longitude },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
      stopPosition: undefined,
    })

    expect(onTime).toBe('on_time')
  })

  /** RF6: sem parada nem evento com coordenada, a distância não pesa. */
  test('sem referência nenhuma de local, a distância não julga', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
      stopPosition: undefined,
    })

    expect(result).toBe('on_time')
  })

  /** RF6: a precisão soma ao raio — 320 m de distância com precisão 50 e raio 300 ainda é on_time. */
  test('a precisão da foto soma ao raio', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { accuracyMeters: 50, latitude: '-23.5534', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
      stopPosition: STOP_POSITION,
    })

    expect(result).toBe('on_time')
  })
})

/**
 * Spec 157 T11, decisão D3(b) do usuário: substituir a foto (upsert por evento+tipo) nunca melhora
 * a pontualidade gravada — fica a pior das duas, e `late` com `away` vira `late_and_away`. Sem isso,
 * a foto tardia seria "lavada" por uma segunda foto tirada depois no lugar certo.
 */
describe('substituição da foto fica com a pior pontualidade (spec 157 T11, D3b)', () => {
  const cases: ReadonlyArray<
    readonly [ProofPunctuality | undefined, ProofPunctuality, ProofPunctuality]
  > = [
    [undefined, 'on_time', 'on_time'],
    [undefined, 'late', 'late'],
    ['on_time', 'late', 'late'],
    ['late', 'on_time', 'late'],
    ['away', 'on_time', 'away'],
    ['late', 'late', 'late'],
    ['late', 'away', 'late_and_away'],
    ['away', 'late', 'late_and_away'],
    ['late_and_away', 'on_time', 'late_and_away'],
    ['on_time', 'not_required', 'on_time'],
    ['not_required', 'on_time', 'on_time'],
    ['not_required', 'not_required', 'not_required'],
    ['late', 'not_required', 'late'],
  ]

  for (const [previous, next, expected] of cases) {
    test(`${previous ?? 'sem foto'} + ${next} = ${expected}`, () => {
      expect(mergeProofPunctuality({ next, previous })).toBe(expected)
    })
  }
})
