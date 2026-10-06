/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (`security.md` §3): resposta de API é entrada não confiável. A avaria e a devolução são lidas
 * com as chaves EXATAS do formato real (`cargo-arrival-occurrence.types.ts`, `…-document-products.routes.ts`):
 * chave a mais, a menos ou de tipo errado recusa a resposta inteira, nunca passa calada.
 */
import { describe, expect, test } from 'bun:test'

import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'
import {
  toDocumentProducts,
  toOccurrencesView,
  toRegisterOccurrenceResult,
  toReceivingTypes,
  toReturnResult,
} from '@/modules/cargo-receiving/shared/cargoOccurrenceResponse.validation'

import {
  buildOccurrence,
  buildOccurrencesView,
  buildProduct,
  buildReturn,
  RECEIVING_TYPES,
} from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'

const DOCUMENT = documentIdOf(1001)
const OCCURRENCE = buildOccurrence({ id: 'occ-1', nfeDocumentId: DOCUMENT })

function expectInvalid(action: () => unknown): void {
  expect(action).toThrow(CargoReceivingRequestError)
  try {
    action()
  } catch (error) {
    expect((error as Error).message).toBe('RESPONSE_INVALID')
  }
}

describe('os tipos de recebimento', () => {
  test('lê as quatro chaves do tipo', () => {
    expect(toReceivingTypes({ data: RECEIVING_TYPES })).toEqual(RECEIVING_TYPES)
  })

  test('chave a mais, modo desconhecido ou corpo sem `data` recusam', () => {
    expectInvalid(() => toReceivingTypes({ data: [{ ...RECEIVING_TYPES[0], active: true }] }))
    expectInvalid(() => toReceivingTypes({ data: [{ ...RECEIVING_TYPES[0], itemsMode: 'maybe' }] }))
    expectInvalid(() => toReceivingTypes({ data: [{ ...RECEIVING_TYPES[0], name: 3 }] }))
    expectInvalid(() => toReceivingTypes({}))
  })
})

describe('os itens da nota', () => {
  test('lê os sete campos e mantém os decimais como texto', () => {
    const product = buildProduct({ code: 'P-1', quantity: '10.0000', unitValue: '2.5000' })

    const [first] = toDocumentProducts({ data: [product] })

    expect(first).toEqual(product)
    expect(typeof first?.quantity).toBe('string')
  })

  test('nota sem itens é lista vazia, e NCM/CFOP na resposta recusam', () => {
    expect(toDocumentProducts({ data: [] })).toEqual([])
    expectInvalid(() =>
      toDocumentProducts({ data: [{ ...buildProduct({ code: 'P-1' }), ncm: '1' }] }),
    )
    expectInvalid(() =>
      toDocumentProducts({ data: [{ ...buildProduct({ code: 'P-1' }), ordinal: '1' }] }),
    )
  })
})

describe('as ocorrências da chegada', () => {
  test('lê marcação por nota, ocorrências e contagens', () => {
    const view = buildOccurrencesView({
      occurrences: [OCCURRENCE],
      returns: [buildReturn(DOCUMENT, 'marked', 'occ-1')],
    })

    expect(toOccurrencesView({ data: view })).toEqual(view)
  })

  test('anexo aceita as três chaves opcionais e recusa chave estranha', () => {
    const attachment = {
      downloadUrl: 'https://files.test/a',
      expired: false,
      expiresAt: '2026-10-06T00:00:00.000Z',
      id: 'a-1',
      mimeType: 'image/jpeg',
      position: 1,
      thumbnailUrl: 'https://files.test/t',
    }
    const view = buildOccurrencesView({
      occurrences: [{ ...OCCURRENCE, attachments: [attachment] }],
    })
    expect(toOccurrencesView({ data: view }).occurrences[0]?.attachments[0]).toEqual(attachment)

    const stranger = { ...OCCURRENCE, attachments: [{ ...attachment, objectKey: 'x' }] }
    expectInvalid(() =>
      toOccurrencesView({ data: buildOccurrencesView({ occurrences: [stranger] }) }),
    )
  })

  test('estado de devolução desconhecido, tratativa fora da lista e chave nova recusam', () => {
    const view = buildOccurrencesView({ returns: [buildReturn(DOCUMENT)] })
    expectInvalid(() =>
      toOccurrencesView({
        data: { ...view, documents: [{ ...view.documents[0], returnToContractor: 'lost' }] },
      }),
    )
    expectInvalid(() =>
      toOccurrencesView({
        data: buildOccurrencesView({
          occurrences: [{ ...OCCURRENCE, case: { id: 'c', status: 'unknown' } } as never],
        }),
      }),
    )
    expectInvalid(() => toOccurrencesView({ data: { ...view, extra: true } }))
  })

  test('ocorrência sem tratativa (`case: null`) e quantidade nula são válidas', () => {
    const open = {
      ...OCCURRENCE,
      case: null,
      items: [{ code: 'P-1', description: 'Produto', quantity: null, unit: null }],
    }

    const [read] = toOccurrencesView({
      data: buildOccurrencesView({ occurrences: [open] }),
    }).occurrences

    expect(read?.case).toBeNull()
    expect(read?.items[0]?.quantity).toBeNull()
  })
})

describe('o resultado da abertura e da marcação', () => {
  test('201 é a primeira vez e 200 é o reenvio idempotente', () => {
    expect(
      toRegisterOccurrenceResult({ payload: { data: OCCURRENCE }, status: 201 }).isReplay,
    ).toBe(false)
    expect(
      toRegisterOccurrenceResult({ payload: { data: OCCURRENCE }, status: 200 }).isReplay,
    ).toBe(true)
    expectInvalid(() => toRegisterOccurrenceResult({ payload: { data: { id: 'x' } }, status: 201 }))
  })

  test('marcar, desfazer e concluir devolvem as quatro chaves', () => {
    const result = {
      documentId: DOCUMENT,
      outcome: 'changed',
      returnOccurrenceId: 'occ-1',
      returnToContractor: 'marked',
    } as const

    expect(toReturnResult({ data: result })).toEqual(result)
    expectInvalid(() => toReturnResult({ data: { ...result, outcome: 'refused' } }))
    expectInvalid(() => toReturnResult({ data: { documentId: DOCUMENT } }))
  })
})
