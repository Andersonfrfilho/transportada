/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166 T205/T206: o cadastro do tipo decide se ele aceita mais de um item marcado, e o
 * registro publica a quantidade/unidade de cada item na resposta.
 */
import { describe, expect, test } from 'bun:test'

import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { OccurrenceTypeSingleItemError } from '../../src/trips/domain/trip.error.js'

const TIPO = '00000000-0000-4000-8000-0000000000e1'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const ACTOR_USER_ID = '00000000-0000-4000-8000-00000000000f'

const PRODUTOS = [
  { code: 'ZG-4410', description: 'Parafuso sextavado' },
  { code: 'ZG-4411', description: 'Porca' },
] as const

function registrar(input: {
  readonly allowsMultipleItems: boolean
  readonly productCodes: readonly string[]
  readonly productQuantities?: readonly string[]
  readonly productQuantityUnits?: readonly string[]
}) {
  const calls = { saved: 0 }
  const promise = registerTripOccurrence({
    actorUserId: ACTOR_USER_ID,
    attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    note: '',
    occurredOn: '22/09/2026',
    occurrenceTypeId: TIPO,
    productCode: '',
    productCodes: input.productCodes,
    ...(input.productQuantities === undefined
      ? {}
      : { productQuantities: input.productQuantities }),
    ...(input.productQuantityUnits === undefined
      ? {}
      : { productQuantityUnits: input.productQuantityUnits }),
    repository: {
      async findOccurrenceType() {
        return {
          active: true,
          allowsMultipleItems: input.allowsMultipleItems,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: TIPO,
          name: 'Item avariado',
          notifies: false,
          stage: 'separation' as const,
        }
      },
      async listDocumentProducts() {
        return PRODUTOS
      },
      async listOccurrences() {
        return []
      },
      async readTemplateValues() {
        throw new Error('TEMPLATE_NOT_EXPECTED')
      },
      async saveOccurrence(saved) {
        calls.saved += 1
        return {
          attachments: [],
          createdAt: '2026-09-22T12:00:00.000Z',
          id: '00000000-0000-4000-8000-0000000000c1',
          note: '',
          occurrenceTypeId: TIPO,
          productCode: saved.productCode,
          stage: saved.stage,
          typeName: saved.typeName,
        }
      },
    },
    tripId: TRIP_ID,
  })
  return { calls, promise }
}

describe('o cadastro decide se o tipo aceita mais de um item (spec 166 RF8/CA08)', () => {
  test('allowsMultipleItems false com um item só registra normalmente', async () => {
    const { calls, promise } = registrar({
      allowsMultipleItems: false,
      productCodes: ['ZG-4410'],
    })

    expect((await promise).productCodes).toEqual(['ZG-4410'])
    expect(calls.saved).toBe(1)
  })

  test('allowsMultipleItems false com dois itens é 422 OCCURRENCE_TYPE_SINGLE_ITEM, sem gravar', async () => {
    const { calls, promise } = registrar({
      allowsMultipleItems: false,
      productCodes: ['ZG-4410', 'ZG-4411'],
    })

    const error = await promise.catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OccurrenceTypeSingleItemError)
    expect(error).toMatchObject({ code: 'OCCURRENCE_TYPE_SINGLE_ITEM', status: 422 })
    expect(calls.saved).toBe(0)
  })

  test('allowsMultipleItems true (padrão) com dois itens registra normalmente', async () => {
    const { calls, promise } = registrar({
      allowsMultipleItems: true,
      productCodes: ['ZG-4410', 'ZG-4411'],
    })

    expect((await promise).productCodes).toEqual(['ZG-4410', 'ZG-4411'])
    expect(calls.saved).toBe(1)
  })

  /** A nota inteira (sem item) nunca esbarra no interruptor — não há "mais de um item" a contar. */
  test('nota inteira com allowsMultipleItems false continua registrando', async () => {
    const { promise } = registrar({ allowsMultipleItems: false, productCodes: [] })
    expect((await promise).productCodes).toEqual([])
  })
})

describe('a resposta publica products ao lado de productCodes (spec 166 RF5/CA06)', () => {
  test('item com quantidade e unidade sai em products, alinhado a productCodes', async () => {
    const { promise } = registrar({
      allowsMultipleItems: true,
      productCodes: ['ZG-4410', 'ZG-4411'],
      productQuantities: ['3.5', ''],
      productQuantityUnits: ['box', ''],
    })

    const registered = await promise

    expect(registered.productCodes).toEqual(['ZG-4410', 'ZG-4411'])
    expect(registered.products).toEqual([
      { code: 'ZG-4410', quantity: '3.5', unit: 'box' },
      { code: 'ZG-4411', quantity: null, unit: null },
    ])
  })

  test('sem quantidade nenhuma enviada, todo item sai sem contagem', async () => {
    const { promise } = registrar({
      allowsMultipleItems: true,
      productCodes: ['ZG-4410'],
    })

    expect((await promise).products).toEqual([{ code: 'ZG-4410', quantity: null, unit: null }])
  })

  test('nota inteira publica products vazio, como productCodes', async () => {
    const { promise } = registrar({ allowsMultipleItems: true, productCodes: [] })

    const registered = await promise
    expect(registered.productCodes).toEqual([])
    expect(registered.products).toEqual([])
  })
})
