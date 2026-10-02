/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { resolveTripFeedbackKey } from '../../src/modules/trip/shared/tripFeedback.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

/**
 * Spec 156 T12 (aceites 8, 12): os códigos que `POST .../field-delivery` devolve para a baixa do
 * escritório — cada um com texto nos dois idiomas, o mesmo catálogo que o resto da viagem usa (não
 * uma segunda tabela de mensagens só para esta tela). O aceite 9
 * (`TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`) saiu da lista: a spec 223 tirou a recusa por falta de
 * canhoto, e o código não existe mais no backend.
 */
describe('mapeamento de erro do envio da baixa em massa (spec 156 T12)', () => {
  const cases = [
    ['DOCUMENT_ALREADY_SETTLED', 'documentAlreadySettled'],
    ['DELIVERED_AT_IN_FUTURE', 'deliveredAtInFuture'],
    ['DELIVERED_AT_BEFORE_DISPATCH', 'deliveredAtBeforeDispatch'],
  ] as const

  for (const [code, expectedKey] of cases) {
    it(`${code} vira feedback com texto nos dois idiomas`, () => {
      const key = resolveTripFeedbackKey(new Error(code))
      expect(key).toBe(expectedKey)
      expect(trip.feedback[key as keyof typeof trip.feedback]).toBeTruthy()
      expect(tripEn.feedback[key as keyof typeof tripEn.feedback]).toBeTruthy()
    })
  }

  it('código de rede genérico cai no `requestFailed` já existente', () => {
    expect(resolveTripFeedbackKey(new Error('REQUEST_FAILED'))).toBe('requestFailed')
  })
})
