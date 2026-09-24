/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { resolveTripFeedbackKey } from '../../src/modules/trip/shared/tripFeedback.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

/**
 * Spec 156 T8: os códigos que o escritório passa a receber ao iniciar rota/registrar chegada e
 * ocorrência em nome do motorista — cada um com texto nos dois idiomas, não só um código sem rosto.
 */
describe('mapeamento de erro para a baixa do escritório (spec 156)', () => {
  it('TRIP_WITHOUT_DRIVER vira feedback com texto nos dois idiomas', () => {
    const key = resolveTripFeedbackKey(new Error('TRIP_WITHOUT_DRIVER'))
    expect(key).toBe('withoutDriver')
    expect(trip.feedback[key as keyof typeof trip.feedback]).toBeTruthy()
    expect(tripEn.feedback[key as keyof typeof tripEn.feedback]).toBeTruthy()
  })

  it('DRIVER_NOT_ON_TRIP vira feedback com texto nos dois idiomas', () => {
    const key = resolveTripFeedbackKey(new Error('DRIVER_NOT_ON_TRIP'))
    expect(key).toBe('driverNotOnTrip')
    expect(trip.feedback[key as keyof typeof trip.feedback]).toBeTruthy()
    expect(tripEn.feedback[key as keyof typeof tripEn.feedback]).toBeTruthy()
  })

  it('TRIP_FIELD_REPORT_KEY_REUSED vira feedback com texto nos dois idiomas', () => {
    const key = resolveTripFeedbackKey(new Error('TRIP_FIELD_REPORT_KEY_REUSED'))
    expect(key).toBe('idempotencyKeyReused')
    expect(trip.feedback[key as keyof typeof trip.feedback]).toBeTruthy()
    expect(tripEn.feedback[key as keyof typeof tripEn.feedback]).toBeTruthy()
  })

  /**
   * ⚠️ Era `requestFailed` até 23/09, e essa era a frase de falha de rede: um `422` legítimo do
   * servidor mandava o operador conferir a internet. Código desconhecido agora diz que o servidor
   * recusou — o que se sabe — sem inventar a causa.
   */
  it('código desconhecido cai no genérico de recusa, não no de rede', () => {
    expect(resolveTripFeedbackKey(new Error('ALGO_NUNCA_VISTO'))).toBe('serverRefused')
  })
})
