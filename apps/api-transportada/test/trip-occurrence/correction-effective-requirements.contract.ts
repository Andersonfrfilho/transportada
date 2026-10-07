/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N1): a correção respeita o modo EFETIVO do tipo (tipo + exceção do contratante e do
 * destinatário DA NOTA), não só o do tipo. Campo desligado não é gravado e não é recusado; campo
 * exigido recusa só a limpeza explícita (`null`) — ausente continua sendo "mantém".
 */
import { describe, expect, test } from 'bun:test'

import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import type {
  CorrectedOccurrenceView,
  OccurrenceCorrectionTransactionPort,
} from '../../src/trips/application/occurrence-correction.port.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import type { FieldOccurrenceTypeOverrides } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import type { StoredOccurrenceLineValues } from '../../src/trips/domain/occurrence-correction-values.policy.js'
import {
  OccurrenceDeclaredAmountLevelConflictError,
  TripOccurrenceDeclaredAmountRequiredError,
  TripOccurrenceReferenceNumberRequiredError,
} from '../../src/trips/domain/trip.error.js'
import { NEUTRAL_DOCUMENT_PRODUCT_LINE } from '../fixtures/document-product.fixture.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000b1'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const OCCURRENCE = '00000000-0000-4000-8000-0000000000c1'
const RECIPIENT_TAX_ID = '12345678000190'
const TIPO = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const PRODUCTS = [
  { ...NEUTRAL_DOCUMENT_PRODUCT_LINE, code: 'P1', description: 'UM' },
  { ...NEUTRAL_DOCUMENT_PRODUCT_LINE, code: 'P2', description: 'DOIS', ordinal: 2 },
]
const NO_OVERRIDES: FieldOccurrenceTypeOverrides = {
  contractorOverrides: [],
  recipientOverrides: [],
}

type Mode = 'off' | 'optional' | 'required'

type Scenario = {
  readonly declaredAmount?: null | string
  readonly overrides?: FieldOccurrenceTypeOverrides
  readonly productCodes?: string[]
  readonly productDeclaredAmounts?: (null | string | undefined)[]
  readonly referenceNumber?: null | string
  readonly stored?: {
    readonly declaredAmount: null | string
    readonly referenceNumber: null | string
  }
  readonly storedLines?: StoredOccurrenceLineValues[]
  readonly type: Partial<OccurrenceTypeRecord>
}

function buildType(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    declaredAmountMode: 'off',
    declaredAmountScope: 'occurrence',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TIPO,
    itemsMode: 'optional',
    name: 'Tipo',
    notifies: false,
    referenceNumberMode: 'off',
    stage: 'delivery',
    ...overrides,
  }
}

function correct(scenario: Scenario) {
  const writes: { declaredAmount: null | string; referenceNumber: null | string }[] = []
  const replaced: (readonly StoredOccurrenceLineValues[])[] = []
  const stored = scenario.stored ?? { declaredAmount: null, referenceNumber: null }
  const transaction: OccurrenceCorrectionTransactionPort = {
    findDocumentSubject: async () => ({
      contractorId: CONTRACTOR,
      recipientTaxId: RECIPIENT_TAX_ID,
    }),
    findOccurrenceType: async () => buildType(scenario.type),
    findOccurrenceTypeOverrides: async () => scenario.overrides ?? NO_OVERRIDES,
    hasOpenCase: async () => false,
    insertCorrection: async () => undefined,
    listCurrentItems: async () => scenario.storedLines ?? [],
    listDocumentProducts: async () => PRODUCTS,
    lockOccurrence: async () => ({
      cancelledAt: null,
      declaredAmount: stored.declaredAmount,
      occurrenceTypeId: TIPO,
      referenceNumber: stored.referenceNumber,
      tripDocumentId: DOCUMENT,
      tripId: TRIP,
    }),
    readOccurrenceView: async () => ({}) as CorrectedOccurrenceView,
    replaceItems: async (input) => void replaced.push(input.items),
    writeCancellation: async () => undefined,
    writeDeclaredValues: async (input) =>
      void writes.push({
        declaredAmount: input.declaredAmount,
        referenceNumber: input.referenceNumber,
      }),
  }
  const result = correctOccurrenceItems({
    actorUserId: COMPANY,
    companyId: COMPANY,
    occurrenceId: OCCURRENCE,
    productCode: '',
    productCodes: scenario.productCodes ?? [],
    productDeclaredAmounts: scenario.productDeclaredAmounts ?? [],
    productQuantities: (scenario.productCodes ?? []).map(() => '1'),
    productQuantityUnits: (scenario.productCodes ?? []).map(() => 'UN'),
    ...(scenario.declaredAmount === undefined ? {} : { declaredAmount: scenario.declaredAmount }),
    ...(scenario.referenceNumber === undefined
      ? {}
      : { referenceNumber: scenario.referenceNumber }),
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  return { replaced, result, writes }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

function referenceOverride(mode: Mode): FieldOccurrenceTypeOverrides {
  return {
    contractorOverrides: [
      {
        contractorId: CONTRACTOR,
        occurrenceTypeId: TIPO,
        referenceNumberMode: mode,
      },
    ],
    recipientOverrides: [],
  } as unknown as FieldOccurrenceTypeOverrides
}

describe('a correção descarta o campo desligado no modo efetivo (spec 247 T7.2b N1)', () => {
  test('número com modo off: não grava, sem erro', async () => {
    const { result, writes } = correct({ referenceNumber: 'NFD 1', type: {} })

    await result

    expect(writes).toEqual([])
  })

  test('valor pago da ocorrência com modo off: não grava, sem erro', async () => {
    const { result, writes } = correct({ declaredAmount: '50', type: {} })

    await result

    expect(writes).toEqual([])
  })

  test('valor pago de linha com modo off: a linha é gravada sem o valor', async () => {
    const { replaced, result } = correct({
      productCodes: ['P1'],
      productDeclaredAmounts: ['10'],
      type: { declaredAmountScope: 'item' },
    })

    await result

    expect(replaced[0]?.map((line) => line.declaredAmount)).toEqual([null])
  })

  test('a exceção do contratante da nota liga o número que o tipo desligou', async () => {
    const { result, writes } = correct({
      overrides: referenceOverride('optional'),
      referenceNumber: 'NFD 1',
      type: { referenceNumberMode: 'off' },
    })

    await result

    expect(writes).toEqual([{ declaredAmount: null, referenceNumber: 'NFD 1' }])
  })

  test('a exceção do contratante da nota desliga o número que o tipo exigia', async () => {
    const { result, writes } = correct({
      overrides: referenceOverride('off'),
      referenceNumber: 'NFD 1',
      type: { referenceNumberMode: 'required' },
    })

    await result

    expect(writes).toEqual([])
  })

  test('a exceção de OUTRO contratante não vale para a nota', async () => {
    const other = {
      contractorOverrides: [
        {
          contractorId: '00000000-0000-4000-8000-0000000000b2',
          occurrenceTypeId: TIPO,
          referenceNumberMode: 'optional',
        },
      ],
      recipientOverrides: [],
    } as unknown as FieldOccurrenceTypeOverrides
    const { result, writes } = correct({
      overrides: other,
      referenceNumber: 'NFD 1',
      type: { referenceNumberMode: 'off' },
    })

    await result

    expect(writes).toEqual([])
  })
})

describe('a correção não deixa limpar o campo exigido (spec 247 T7.2b N1)', () => {
  test('número exigido: nulo explícito é 422 TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED', async () => {
    const { result, writes } = correct({
      referenceNumber: null,
      stored: { declaredAmount: null, referenceNumber: 'NFD 1' },
      type: { referenceNumberMode: 'required' },
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceReferenceNumberRequiredError)
    expect(writes).toEqual([])
  })

  test('número exigido: ausente mantém, e a ocorrência antiga que nunca teve o campo corrige', async () => {
    const { result, writes } = correct({
      productCodes: ['P1'],
      type: { referenceNumberMode: 'required' },
    })

    await result

    expect(writes).toEqual([])
  })

  test('número exigido: trocar por outro texto vale', async () => {
    const { result, writes } = correct({
      referenceNumber: 'NFD 2',
      stored: { declaredAmount: null, referenceNumber: 'NFD 1' },
      type: { referenceNumberMode: 'required' },
    })

    await result

    expect(writes).toEqual([{ declaredAmount: null, referenceNumber: 'NFD 2' }])
  })

  test('valor pago exigido na ocorrência: nulo explícito é 422 com o campo declaredAmount', async () => {
    const { result } = correct({
      declaredAmount: null,
      stored: { declaredAmount: '50.0000', referenceNumber: null },
      type: { declaredAmountMode: 'required', declaredAmountScope: 'occurrence' },
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceDeclaredAmountRequiredError)
    expect((error as TripOccurrenceDeclaredAmountRequiredError).details?.[0]?.field).toBe(
      'declaredAmount',
    )
  })

  test('valor pago exigido por linha: nulo explícito é 422 com o campo da linha', async () => {
    const { result } = correct({
      productCodes: ['P1', 'P2'],
      productDeclaredAmounts: ['10', null],
      type: { declaredAmountMode: 'required', declaredAmountScope: 'item' },
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceDeclaredAmountRequiredError)
    expect((error as TripOccurrenceDeclaredAmountRequiredError).details?.[0]?.field).toBe(
      'items[1].declaredAmount',
    )
  })

  test('escopo item sem linha cai na ocorrência: o nulo explícito do valor da ocorrência é recusado', async () => {
    const { result } = correct({
      declaredAmount: null,
      productCodes: [],
      stored: { declaredAmount: '50.0000', referenceNumber: null },
      type: { declaredAmountMode: 'required', declaredAmountScope: 'item' },
    })

    const error = await rejection(result)

    expect((error as TripOccurrenceDeclaredAmountRequiredError).details?.[0]?.field).toBe(
      'declaredAmount',
    )
  })

  test('Produtos desligado pela exceção leva o escopo item para a ocorrência', async () => {
    const itemsOff = {
      contractorOverrides: [{ contractorId: CONTRACTOR, itemsMode: 'off', occurrenceTypeId: TIPO }],
      recipientOverrides: [],
    } as unknown as FieldOccurrenceTypeOverrides
    const { result } = correct({
      declaredAmount: null,
      overrides: itemsOff,
      stored: { declaredAmount: '50.0000', referenceNumber: null },
      type: {
        declaredAmountMode: 'required',
        declaredAmountScope: 'item',
        itemsMode: 'optional',
      },
    })

    const error = await rejection(result)

    expect((error as TripOccurrenceDeclaredAmountRequiredError).details?.[0]?.field).toBe(
      'declaredAmount',
    )
  })

  test('valor por linha com escopo efetivo da ocorrência segue na regra de conflito de nível', async () => {
    const { result } = correct({
      declaredAmount: '50',
      productCodes: ['P1'],
      productDeclaredAmounts: ['10'],
      type: { declaredAmountMode: 'optional', declaredAmountScope: 'occurrence' },
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(OccurrenceDeclaredAmountLevelConflictError)
  })

  test('valor pago opcional: nulo explícito limpa', async () => {
    const { result, writes } = correct({
      declaredAmount: null,
      stored: { declaredAmount: '50.0000', referenceNumber: null },
      type: { declaredAmountMode: 'optional' },
    })

    await result

    expect(writes).toEqual([{ declaredAmount: null, referenceNumber: null }])
  })
})
