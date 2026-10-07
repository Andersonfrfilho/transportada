/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 T1.5: os dois códigos novos da API chegam à pessoa em português e em inglês, pelo mesmo
 * mecanismo de código estável que a 240 usou — nunca no `serverRefused` genérico.
 */
import { describe, expect, test } from 'bun:test'

import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import trip from '@/modules/trip/locales/trip.locale.json'
import { resolveTripFeedbackKey } from '@/modules/trip/shared/tripFeedback.service'

const CASES = [
  ['OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED', 'occurrenceTypeItemsNotAllowed'],
  ['OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY', 'occurrenceTypeItemsOffRedeliveryPolicy'],
] as const

describe('mensagens dos códigos de itens por tipo (spec 241)', () => {
  for (const [code, key] of CASES) {
    test(`${code} vira ${key}, com texto nos dois idiomas`, () => {
      expect(resolveTripFeedbackKey(new Error(code))).toBe(key)
      const portuguese = (trip.feedback as Record<string, string>)[key]
      const english = (tripEn.feedback as Record<string, string>)[key]
      expect(portuguese).toBeString()
      expect(english).toBeString()
      expect(portuguese).not.toBe(english)
    })
  }

  test('o texto do registro manda ligar Produtos no cadastro; o do cadastro manda desligar a política', () => {
    expect(trip.feedback.occurrenceTypeItemsNotAllowed).toContain('Produtos')
    expect(trip.feedback.occurrenceTypeItemsOffRedeliveryPolicy).toContain('reentrega')
  })
})
