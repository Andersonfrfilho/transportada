/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (RF6, CA03): tipo com Produtos desligado (`itemsMode = 'off'`) recusa produto no
 * registro do galpão, no registro do motorista e na correção — antes de gravar, avisar ou
 * substituir itens. Lista vazia segue válida em qualquer tipo.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CorrectedOccurrenceView,
  OccurrenceCorrectionTransactionPort,
} from '../../src/trips/application/occurrence-correction.port.js'
import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  registerTripOccurrence,
  type OccurrenceTypeRecord,
} from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { OccurrenceTypeItemsNotAllowedError } from '../../src/trips/domain/trip.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const ACTOR = '00000000-0000-4000-8000-00000000000f'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const OCCURRENCE = '00000000-0000-4000-8000-0000000000c1'
const TIPO = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const PRODUCTS = [{ code: 'ZG-4410', description: 'CAIXA DE PARAFUSOS' }]
const NOT_ALLOWED_CODE = 'OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED'

function buildType(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TIPO,
    name: 'Tipo',
    notifies: true,
    stage: 'separation',
    ...overrides,
  }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('o registro do galpão recusa produto em tipo sem itens (spec 241 RF6)', () => {
  function register(input: {
    readonly itemsMode: 'off' | 'optional'
    readonly productCode?: string
    readonly productCodes?: readonly string[]
  }) {
    const calls: string[] = []
    const result = registerTripOccurrence({
      actorUserId: ACTOR,
      attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      companyId: COMPANY,
      documentId: DOCUMENT,
      note: '',
      notificationParameters: {
        documentId: DOCUMENT,
        documentLabel: '883658/1',
        occurrenceType: '',
        stopLabel: 'RUA MIGUEL PETRONI, 1166',
        tripId: TRIP,
      },
      notifier: { notify: async () => void calls.push('notify') },
      occurredOn: '03/09/2026',
      occurrenceTypeId: TIPO,
      productCode: input.productCode ?? '',
      ...(input.productCodes === undefined ? {} : { productCodes: input.productCodes }),
      repository: {
        findOccurrenceType: async () => buildType({ itemsMode: input.itemsMode }),
        listDocumentProducts: async () => PRODUCTS,
        listOccurrences: async () => [],
        readTemplateValues: async () => ({
          contractorName: '',
          documentLabel: '883658/1',
          driverName: '',
          itemCode: '',
          itemLabel: '',
          itemQuantity: '',
          note: '',
          occurredOn: '03/09/2026',
          recipientName: '',
          stopLabel: '',
          totalValue: '',
        }),
        saveOccurrence: async (saved: { readonly typeName: string }) => {
          calls.push('saveOccurrence')
          return {
            createdAt: '2026-09-03T12:00:00.000Z',
            id: OCCURRENCE,
            note: '',
            occurrenceTypeId: TIPO,
            productCode: '',
            stage: 'separation' as const,
            typeName: saved.typeName,
          }
        },
      },
      tripId: TRIP,
    })
    return { calls, result }
  }

  test.each([
    { label: 'productCode', productCode: 'ZG-4410' },
    { label: 'productCodes', productCodes: ['ZG-4410'] },
  ])('off com $label: 422, sem gravar nem avisar', async (input) => {
    const { calls, result } = register({ itemsMode: 'off', ...input })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(OccurrenceTypeItemsNotAllowedError)
    expect((error as OccurrenceTypeItemsNotAllowedError).status).toBe(422)
    expect((error as OccurrenceTypeItemsNotAllowedError).code).toBe(NOT_ALLOWED_CODE)
    expect(calls).toHaveLength(0)
  })

  test('off com lista vazia grava', async () => {
    const { calls, result } = register({ itemsMode: 'off' })

    await result

    expect(calls).toContain('saveOccurrence')
  })

  test('optional com produto grava', async () => {
    const { calls, result } = register({ itemsMode: 'optional', productCode: 'ZG-4410' })

    await result

    expect(calls).toContain('saveOccurrence')
  })
})

describe('o registro do motorista recusa produto em tipo sem itens (spec 241 RF6)', () => {
  function register(input: {
    readonly itemsMode: 'off' | 'optional'
    readonly productCode: string
  }) {
    const state = createFieldReportState({
      documents: new Map([
        [
          DOCUMENT,
          {
            separationStatus: 'pending',
            stopId: null,
            tripId: '',
            tripStatus: 'on_delivery_route',
          },
        ],
      ]),
    })
    const result = registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
      note: '',
      occurrenceTypeId: TIPO,
      productCode: input.productCode,
      repository: {
        findConfirmedUpload: async () => null,
        findOccurrenceType: async () =>
          buildType({ itemsMode: input.itemsMode, stage: 'delivery' }),
        findReachableDocument: async () => ({ tripId: TRIP }),
        listDocumentProducts: async () => PRODUCTS,
      },
      unitOfWork: createFieldReportUnitOfWork(state),
    })
    return { result, state }
  }

  test('off com produto: 422, sem gravar', async () => {
    const { result, state } = register({ itemsMode: 'off', productCode: 'ZG-4410' })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(OccurrenceTypeItemsNotAllowedError)
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('off sem produto grava; optional com produto grava', async () => {
    const withoutProduct = register({ itemsMode: 'off', productCode: '' })
    const withProduct = register({ itemsMode: 'optional', productCode: 'ZG-4410' })

    await withoutProduct.result
    await withProduct.result

    expect(withoutProduct.state.documentOccurrences.size).toBe(1)
    expect(withProduct.state.documentOccurrences.size).toBe(1)
  })
})

describe('a correção recusa produto em tipo sem itens (spec 241 RF6, CA03)', () => {
  function correct(input: {
    readonly itemsMode: 'off' | 'optional'
    readonly productCodes: string[]
  }) {
    const calls: string[] = []
    const transaction: OccurrenceCorrectionTransactionPort = {
      findOccurrenceType: async () => buildType({ itemsMode: input.itemsMode, stage: 'delivery' }),
      hasOpenCase: async () => false,
      insertCorrection: async () => void calls.push('insertCorrection'),
      listCurrentItems: async () =>
        input.productCodes.length === 0 ? [{ code: 'ZG-4410', quantity: null, unit: null }] : [],
      listDocumentProducts: async () => PRODUCTS,
      lockOccurrence: async () => ({
        cancelledAt: null,
        occurrenceTypeId: TIPO,
        tripDocumentId: DOCUMENT,
        tripId: TRIP,
      }),
      readOccurrenceView: async () => ({}) as CorrectedOccurrenceView,
      replaceItems: async () => void calls.push('replaceItems'),
      writeCancellation: async () => undefined,
    }
    const result = correctOccurrenceItems({
      actorUserId: ACTOR,
      companyId: COMPANY,
      occurrenceId: OCCURRENCE,
      productCode: '',
      productCodes: input.productCodes,
      unitOfWork: { execute: (operation) => operation(transaction) },
    })
    return { calls, result }
  }

  test('off com produto: 422, sem substituir itens nem registrar correção', async () => {
    const { calls, result } = correct({ itemsMode: 'off', productCodes: ['ZG-4410'] })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(OccurrenceTypeItemsNotAllowedError)
    expect(calls).toHaveLength(0)
  })

  test('off com lista vazia é aceito (a ocorrência antiga com item pode ser esvaziada)', async () => {
    const { calls, result } = correct({ itemsMode: 'off', productCodes: [] })

    await result

    expect(calls).toEqual(['replaceItems', 'insertCorrection'])
  })

  test('optional com produto é aceito', async () => {
    const { calls, result } = correct({ itemsMode: 'optional', productCodes: ['ZG-4410'] })

    await result

    expect(calls).toEqual(['replaceItems', 'insertCorrection'])
  })
})
