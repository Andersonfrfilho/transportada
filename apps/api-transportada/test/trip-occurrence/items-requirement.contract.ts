/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.4b (RF1b, RF1c2, RF8): Produtos obrigatório no registro do motorista, pelo modo
 * **efetivo** da nota. `required` recusa o registro sem produto (`TRIP_OCCURRENCE_ITEMS_REQUIRED`) e
 * "todos os itens" (mínimo nulo) recusa a seleção parcial (`TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET`); a
 * nota inteira (`productCode` vazio) é todos os itens. A exceção da nota vale: ela pode desligar ou
 * exigir produtos sobre o tipo.
 */
import { describe, expect, test } from 'bun:test'

import type { FieldOccurrenceTypeOverrides } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  OccurrenceTypeItemsNotAllowedError,
  TripOccurrenceItemsMinimumNotMetError,
  TripOccurrenceItemsRequiredError,
} from '../../src/trips/domain/trip.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const RECIPIENT_TAX_ID = '12345678000190'
const THREE_PRODUCTS = [
  { code: 'A-1', description: 'PARAFUSO' },
  { code: 'B-2', description: 'PORCA' },
  { code: 'C-3', description: 'ARRUELA' },
]

type Registration = {
  readonly overrides?: FieldOccurrenceTypeOverrides
  readonly productCode?: string
  readonly products?: readonly { readonly code: string; readonly description: string }[]
  readonly recipientTaxId?: string
  readonly type: Partial<OccurrenceTypeRecord>
}

function register(input: Registration) {
  const state = createFieldReportState({
    documents: new Map([
      [
        DOCUMENT,
        { separationStatus: 'pending', stopId: null, tripId: '', tripStatus: 'on_delivery_route' },
      ],
    ]),
  })
  const result = registerDriverOccurrence({
    actorUserId: '00000000-0000-4000-8000-00000000000f',
    companyId: COMPANY,
    documentId: DOCUMENT,
    driverId: '00000000-0000-4000-8000-00000000000d',
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente recusou',
    occurrenceTypeId: TYPE_ID,
    productCode: input.productCode ?? '',
    repository: {
      findConfirmedUpload: async () => null,
      findOccurrenceType: async () => ({
        active: true,
        allowsMultipleItems: true,
        emailBody: '',
        emailSubject: '',
        emailTemplateKey: null,
        id: TYPE_ID,
        name: 'Recusa total',
        notifies: false,
        stage: 'delivery',
        ...input.type,
      }),
      findOccurrenceTypeOverrides: async () =>
        input.overrides ?? { contractorOverrides: [], recipientOverrides: [] },
      findReachableDocument: async () => ({
        recipientTaxId: input.recipientTaxId ?? null,
        tripId: TRIP,
      }),
      listDocumentProducts: async () => input.products ?? THREE_PRODUCTS,
    },
    unitOfWork: createFieldReportUnitOfWork(state),
  })
  return { result, state }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('produtos obrigatórios: todos os itens da nota (spec 246 T2.4b)', () => {
  const allItems = { itemsMinimumCount: null, itemsMode: 'required' } as const

  test('a nota inteira é todos os itens: grava', async () => {
    const { result, state } = register({ type: allItems })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })

  test('um item de uma nota com três é seleção parcial: 422 com código estável, nada gravado', async () => {
    const { result, state } = register({ productCode: 'A-1', type: allItems })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceItemsMinimumNotMetError)
    expect((error as TripOccurrenceItemsMinimumNotMetError).status).toBe(422)
    expect((error as TripOccurrenceItemsMinimumNotMetError).code).toBe(
      'TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET',
    )
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('o único item de uma nota de um item cobre todos os itens', async () => {
    const { result, state } = register({
      productCode: 'A-1',
      products: [THREE_PRODUCTS[0] ?? { code: 'A-1', description: 'PARAFUSO' }],
      type: allItems,
    })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })

  test('nota sem produto nenhum não satisfaz produtos obrigatórios: 422 ITEMS_REQUIRED', async () => {
    const { result, state } = register({ products: [], type: allItems })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceItemsRequiredError)
    expect((error as TripOccurrenceItemsRequiredError).code).toBe('TRIP_OCCURRENCE_ITEMS_REQUIRED')
    expect(state.documentOccurrences.size).toBe(0)
  })
})

describe('produtos obrigatórios com mínimo (spec 246 T2.4b, RF1c2)', () => {
  const atLeastTwo = { itemsMinimumCount: 2, itemsMode: 'required' } as const

  test('um produto abaixo do mínimo de dois é recusado; a nota inteira cobre', async () => {
    const partial = register({ productCode: 'A-1', type: atLeastTwo })
    const whole = register({ type: atLeastTwo })

    expect(await rejection(partial.result)).toBeInstanceOf(TripOccurrenceItemsMinimumNotMetError)
    await whole.result
    expect(whole.state.documentOccurrences.size).toBe(1)
  })

  test('o mínimo nunca passa do total da nota: dois itens exigidos em nota de um item', async () => {
    const { result, state } = register({
      productCode: 'A-1',
      products: [{ code: 'A-1', description: 'PARAFUSO' }],
      type: atLeastTwo,
    })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })
})

describe('o modo de produtos é o efetivo da nota (spec 246 T2.4b, RF6)', () => {
  test('opcional e desligado seguem como eram: sem produto grava; desligado com produto é 422', async () => {
    const optional = register({ type: { itemsMode: 'optional' } })
    const off = register({ type: { itemsMode: 'off' } })
    const offWithProduct = register({ productCode: 'A-1', type: { itemsMode: 'off' } })

    await Promise.all([optional.result, off.result])
    expect(await rejection(offWithProduct.result)).toBeInstanceOf(
      OccurrenceTypeItemsNotAllowedError,
    )
  })

  test('exceção do destinatário exige produtos sobre o tipo opcional', async () => {
    const overrides: FieldOccurrenceTypeOverrides = {
      contractorOverrides: [],
      recipientOverrides: [
        {
          attachmentMode: 'optional',
          itemsMinimumCount: null,
          itemsMode: 'required',
          occurrenceTypeId: TYPE_ID,
          taxId: RECIPIENT_TAX_ID,
        },
      ],
    }
    const strict = register({
      overrides,
      products: [],
      recipientTaxId: RECIPIENT_TAX_ID,
      type: { itemsMode: 'optional' },
    })
    const other = register({
      overrides,
      products: [],
      recipientTaxId: '99999999000199',
      type: { itemsMode: 'optional' },
    })

    expect(await rejection(strict.result)).toBeInstanceOf(TripOccurrenceItemsRequiredError)
    await other.result
    expect(other.state.documentOccurrences.size).toBe(1)
  })

  test('exceção que desliga os produtos de um tipo obrigatório: produto vira 422, nota inteira grava', async () => {
    const overrides: FieldOccurrenceTypeOverrides = {
      contractorOverrides: [],
      recipientOverrides: [
        {
          attachmentMode: 'optional',
          itemsMode: 'off',
          occurrenceTypeId: TYPE_ID,
          taxId: RECIPIENT_TAX_ID,
        },
      ],
    }
    const withProduct = register({
      overrides,
      productCode: 'A-1',
      recipientTaxId: RECIPIENT_TAX_ID,
      type: { itemsMinimumCount: null, itemsMode: 'required' },
    })
    const whole = register({
      overrides,
      products: [],
      recipientTaxId: RECIPIENT_TAX_ID,
      type: { itemsMinimumCount: null, itemsMode: 'required' },
    })

    expect(await rejection(withProduct.result)).toBeInstanceOf(OccurrenceTypeItemsNotAllowedError)
    await whole.result
    expect(whole.state.documentOccurrences.size).toBe(1)
  })
})
