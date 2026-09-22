import { describe, expect, it } from 'bun:test'

import { resolveTripFeedbackKey } from '../../src/modules/trip/shared/tripFeedback.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

/**
 * Spec 156 T9: os dois códigos que `FieldOccurrenceDialog` passa a receber do lote de ocorrência
 * (T7.3, L4) — cada um com texto nos dois idiomas, não só um código sem rosto.
 */
describe('mapeamento de erro da ocorrência de campo (spec 156 T9)', () => {
  it('OCCURRENCE_TYPE_NOT_FIELD vira feedback com texto nos dois idiomas', () => {
    const key = resolveTripFeedbackKey(new Error('OCCURRENCE_TYPE_NOT_FIELD'))
    expect(key).toBe('occurrenceTypeNotField')
    expect(trip.feedback[key as keyof typeof trip.feedback]).toBeTruthy()
    expect(tripEn.feedback[key as keyof typeof tripEn.feedback]).toBeTruthy()
  })

  it('TRIP_DOCUMENT_NOT_REACHABLE vira feedback com texto nos dois idiomas', () => {
    const key = resolveTripFeedbackKey(new Error('TRIP_DOCUMENT_NOT_REACHABLE'))
    expect(key).toBe('documentNotReachable')
    expect(trip.feedback[key as keyof typeof trip.feedback]).toBeTruthy()
    expect(tripEn.feedback[key as keyof typeof tripEn.feedback]).toBeTruthy()
  })
})
