/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import ptLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import enLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import { resolveRejectionCauseLabelKey } from '@/modules/driver-trip/shared/rejectionCauseLabel.service'

/**
 * Spec 247 (T5.3): a ocorrência que o servidor recusa na fila diz qual campo faltou — o motorista não
 * lê "TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED". `details[].field` separa o valor pago da ocorrência do
 * de cada produto (`items[0].declaredAmount`).
 */
describe('as recusas da devolução têm texto humano na fila', () => {
  it('número do documento exigido', () => {
    expect(resolveRejectionCauseLabelKey('422 TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED')).toBe(
      'eventQueue.cause.referenceNumberRequired',
    )
  })

  it('valor pago exigido: o campo da ocorrência e o de cada produto são frases diferentes', () => {
    expect(resolveRejectionCauseLabelKey('422 TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')).toBe(
      'eventQueue.cause.declaredAmountRequired',
    )
    expect(
      resolveRejectionCauseLabelKey('422 TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED', [
        { field: 'declaredAmount', message: 'obrigatório' },
      ]),
    ).toBe('eventQueue.cause.declaredAmountRequired')
    expect(
      resolveRejectionCauseLabelKey('422 TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED', [
        { field: 'items[1].declaredAmount', message: 'obrigatório' },
      ]),
    ).toBe('eventQueue.cause.itemDeclaredAmountRequired')
  })

  it('quantidade acima da nota e produtos exigidos', () => {
    expect(resolveRejectionCauseLabelKey('400 OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT')).toBe(
      'eventQueue.cause.itemQuantityAboveNote',
    )
    expect(resolveRejectionCauseLabelKey('422 TRIP_OCCURRENCE_ITEMS_REQUIRED')).toBe(
      'eventQueue.cause.itemsRequired',
    )
    expect(resolveRejectionCauseLabelKey('422 TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET')).toBe(
      'eventQueue.cause.itemsMinimumNotMet',
    )
  })

  it('toda chave existe nos dois idiomas', () => {
    for (const code of [
      '422 TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED',
      '422 TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED',
      '400 OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT',
      '422 TRIP_OCCURRENCE_ITEMS_REQUIRED',
      '422 TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET',
    ]) {
      const key = resolveRejectionCauseLabelKey(code)?.replace('eventQueue.cause.', '') ?? ''
      expect(Object.keys(ptLocale.eventQueue.cause)).toContain(key)
      expect(Object.keys(enLocale.eventQueue.cause)).toContain(key)
    }
    expect(Object.keys(ptLocale.eventQueue.cause)).toContain('itemDeclaredAmountRequired')
    expect(Object.keys(enLocale.eventQueue.cause)).toContain('itemDeclaredAmountRequired')
  })
})
