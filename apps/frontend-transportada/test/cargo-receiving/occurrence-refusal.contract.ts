/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (`web.md` §11): o servidor recusa a avaria NOMEANDO — o aviso lista TODOS os campos de uma
 * vez, deduplicados, pelo rótulo impresso; o mesmo vale para o código que a API manda SEM `details`. Os três
 * casos do §11: lista com 2+ campos, silêncio quando a falha não aponta nada, e campo desconhecido chegando
 * com o nome cru. O texto do código tem lugar próprio para a janela vencida.
 */
import { describe, expect, test } from 'bun:test'

import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'
import {
  describeOccurrenceRefusal,
  resolveOccurrenceErrorKeys,
} from '@/modules/cargo-receiving/shared/cargoOccurrenceRefusal.service'

describe('a recusa da avaria nomeia todos os campos (spec 237 T3.3)', () => {
  test('lista cada campo recusado, uma vez, com o rótulo impresso e o alvo que existe na tela', () => {
    const error = new CargoReceivingRequestError('INVALID_REQUEST', [
      { field: 'occurrenceTypeId', message: 'Invalid' },
      { field: 'productCodes', message: 'Choose at least one item' },
      { field: 'productCodes', message: 'Other' },
      { field: 'productQuantityUnits', message: 'Misaligned' },
      { field: 'thumbnail', message: 'Too many' },
    ])

    const refusal = describeOccurrenceRefusal(error)

    expect(refusal.code).toBe('INVALID_REQUEST')
    expect(refusal.documents).toEqual([])
    expect(refusal.fields).toEqual([
      { field: 'occurrenceTypeId', labelKey: 'occurrence.fields.occurrenceTypeId' },
      { field: 'productCodes', labelKey: 'occurrence.fields.productCodes' },
      { field: 'productQuantities', labelKey: 'occurrence.fields.productQuantities' },
      { field: 'file', labelKey: 'occurrence.fields.file' },
    ])
  })

  test('código sem `details` aponta o campo que ele implica, e junta com os que vieram nomeados', () => {
    const photo = describeOccurrenceRefusal(
      new CargoReceivingRequestError('OCCURRENCE_PHOTO_REQUIRED'),
    )
    expect(photo.fields.map((item) => item.field)).toEqual(['file'])

    const items = describeOccurrenceRefusal(
      new CargoReceivingRequestError('OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT'),
    )
    expect(items.fields.map((item) => item.field)).toEqual(['productCodes'])

    const quantity = describeOccurrenceRefusal(
      new CargoReceivingRequestError('OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE'),
    )
    expect(quantity.fields.map((item) => item.field)).toEqual(['productQuantities'])

    const both = describeOccurrenceRefusal(
      new CargoReceivingRequestError('CARGO_ARRIVAL_OCCURRENCE_ITEMS_REQUIRED', [
        { field: 'productCodes', message: 'Choose at least one item of the document' },
        { field: 'note', message: 'Too long' },
      ]),
    )
    expect(both.fields.map((item) => item.field)).toEqual(['productCodes', 'note'])
  })

  test('silêncio: falha de rede ou código que não aponta campo não inventa campo', () => {
    expect(
      describeOccurrenceRefusal(new CargoReceivingRequestError('REQUEST_FAILED')).fields,
    ).toEqual([])
    expect(
      describeOccurrenceRefusal(
        new CargoReceivingRequestError('CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED'),
      ).fields,
    ).toEqual([])
    expect(describeOccurrenceRefusal(new Error('boom'))).toEqual({
      code: undefined,
      documents: [],
      fields: [],
    })
  })

  test('campo que a tela não conhece chega com o nome cru que a API usou, nunca some', () => {
    const refusal = describeOccurrenceRefusal(
      new CargoReceivingRequestError('INVALID_REQUEST', [
        { field: 'productCodes', message: 'Invalid' },
        { field: 'weirdField', message: 'Invalid' },
      ]),
    )

    expect(refusal.fields).toEqual([
      { field: 'productCodes', labelKey: 'occurrence.fields.productCodes' },
      { field: 'weirdField', labelKey: undefined },
    ])
  })
})

describe('o texto do código', () => {
  test('a janela vencida tem texto próprio, antes do genérico', () => {
    const keys = resolveOccurrenceErrorKeys('CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED')

    expect(keys[0]).toBe('occurrence.errors.CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED')
    expect(keys.at(-1)).toBe('errors.unknown')
  })

  test('um código do recebimento sem texto da avaria cai no dicionário da chegada, e por fim no genérico', () => {
    expect(resolveOccurrenceErrorKeys('CARGO_ARRIVAL_CLOSED')).toContain(
      'errors.CARGO_ARRIVAL_CLOSED',
    )
    expect(resolveOccurrenceErrorKeys('QUALQUER_OUTRO')).toEqual([
      'occurrence.errors.QUALQUER_OUTRO',
      'errors.QUALQUER_OUTRO',
      'errors.unknown',
    ])
  })
})
