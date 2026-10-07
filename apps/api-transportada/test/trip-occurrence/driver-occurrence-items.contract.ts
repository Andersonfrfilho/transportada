/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.4 (RF10, RF14): as peças puras do registro do motorista com itens — onde o valor pago se
 * digita, o preço por código da nota, a forma do corpo (400), o resolvedor único com os dois modos
 * novos, a ordem das cobranças e a frase do WhatsApp para as recusas novas.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { resolveOccurrenceRequirements } from '../../src/trips/domain/occurrence-requirements.policy.js'
import type { OccurrenceRequirements } from '../../src/trips/domain/occurrence-requirements.policy.js'
import { resolveDeclaredAmountTarget } from '../../src/trips/domain/occurrence-declared-amount-target.policy.js'
import { resolveDocumentProductPricing } from '../../src/trips/domain/occurrence-product-pricing.policy.js'
import { assertDriverOccurrenceRequirements } from '../../src/trips/domain/occurrence-requirement-guard.policy.js'
import {
  OccurrenceItemQuantityAboveDocumentError,
  TripOccurrenceDeclaredAmountRequiredError,
  TripOccurrenceReferenceNumberRequiredError,
} from '../../src/trips/domain/trip.error.js'
import { parseRegisterOccurrenceRequest } from '../../src/trips/presentation/occurrence.schema.js'
import { describeOccurrenceRequirementRefusal } from '../../src/whatsapp-commands/application/driver-occurrence-refusal.service.js'

const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const ITEMS_FIELD = 'items'
const DECLARED_AMOUNT_FIELD = 'declaredAmount'
const REFERENCE_NUMBER_FIELD = 'referenceNumber'
const USE_THE_APP = 'Registre pelo aplicativo.'

describe('onde se digita o valor pago (resolveDeclaredAmountTarget)', () => {
  test.each([
    { expected: 'item', itemsMode: 'optional', lineCount: 2, scope: 'item' },
    { expected: 'occurrence', itemsMode: 'off', lineCount: 2, scope: 'item' },
    { expected: 'occurrence', itemsMode: 'optional', lineCount: 0, scope: 'item' },
    { expected: 'occurrence', itemsMode: 'required', lineCount: 0, scope: 'item' },
    { expected: 'occurrence', itemsMode: 'optional', lineCount: 3, scope: 'occurrence' },
    { expected: 'occurrence', itemsMode: 'off', lineCount: 0, scope: 'occurrence' },
  ] as const)('escopo $scope, produtos $itemsMode, $lineCount linhas → $expected', (row) => {
    expect(
      resolveDeclaredAmountTarget({
        itemsMode: row.itemsMode,
        lineCount: row.lineCount,
        scope: row.scope,
      }),
    ).toBe(row.expected)
  })
})

describe('preço por código da nota (resolveDocumentProductPricing)', () => {
  test('código repetido: menor ordinal, soma das quantidades, valor que varia', () => {
    const pricing = resolveDocumentProductPricing([
      { code: 'P3', commercialUnit: 'FD', ordinal: 4, quantity: '1.0000', unitValue: '12.0000' },
      { code: 'P1', commercialUnit: 'CX', ordinal: 1, quantity: '3.0000', unitValue: '19.9950' },
      { code: 'P3', commercialUnit: 'FD', ordinal: 3, quantity: '1.5000', unitValue: '10.0000' },
      { code: 'P1', commercialUnit: 'CX', ordinal: 2, quantity: '0.5000', unitValue: '19.995' },
    ])

    expect(pricing.get('P3')).toEqual({
      commercialUnit: 'FD',
      hasVaryingUnitValue: true,
      totalQuantity: '2.5000',
      unitValue: '10.0000',
    })
    expect(pricing.get('P1')).toEqual({
      commercialUnit: 'CX',
      hasVaryingUnitValue: false,
      totalQuantity: '3.5000',
      unitValue: '19.9950',
    })
    expect(pricing.size).toBe(2)
  })

  test('nota sem produtos não tem preço nenhum', () => {
    expect(resolveDocumentProductPricing([]).size).toBe(0)
  })
})

function registerRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/me/current-trip/documents/x/occurrences', {
    body: JSON.stringify({ occurrenceTypeId: TYPE_ID, ...body }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

async function refusal(body: Record<string, unknown>): Promise<ApiError> {
  const reason = await parseRegisterOccurrenceRequest(registerRequest(body)).then(
    () => undefined,
    (error: unknown) => error,
  )
  if (!(reason instanceof ApiError)) throw new Error('Expected the body to be refused')
  return reason
}

const ONE_ITEM = [{ productCode: 'P1', quantity: '1' }]

describe('forma do corpo do registro do motorista (400)', () => {
  test('o corpo do app anterior continua valendo, sem os campos novos', async () => {
    const body = await parseRegisterOccurrenceRequest(registerRequest({ productCode: 'P1' }))
    expect(body.items).toBeUndefined()
    expect(body.referenceNumber).toBeUndefined()
    expect(body.declaredAmount).toBeUndefined()
  })

  test('itens, número e valor pago válidos; número vazio é ausente', async () => {
    const body = await parseRegisterOccurrenceRequest(
      registerRequest({
        declaredAmount: '0',
        items: [{ productCode: ' P1 ', quantity: '2.5' }],
        referenceNumber: '   ',
      }),
    )
    expect(body.items).toEqual([{ productCode: 'P1', quantity: '2.5' }])
    expect(body.referenceNumber).toBeUndefined()
    expect(body.declaredAmount).toBe('0')
  })

  test.each([
    {
      body: { items: ONE_ITEM, productCode: 'P1' },
      field: ITEMS_FIELD,
      label: 'productCode junto de items',
    },
    {
      body: { items: [...ONE_ITEM, { productCode: 'P1', quantity: '2' }] },
      field: ITEMS_FIELD,
      label: 'código repetido',
    },
    {
      body: { declaredAmount: '10', items: [{ ...ONE_ITEM[0], declaredAmount: '5' }] },
      field: DECLARED_AMOUNT_FIELD,
      label: 'valor pago nos dois níveis',
    },
    { body: { declaredAmount: '-1' }, field: DECLARED_AMOUNT_FIELD, label: 'valor negativo' },
    { body: { declaredAmount: '1.005' }, field: DECLARED_AMOUNT_FIELD, label: 'três casas' },
    { body: { declaredAmount: 10 }, field: DECLARED_AMOUNT_FIELD, label: 'número JSON' },
    {
      body: { referenceNumber: 'NFD#45029' },
      field: REFERENCE_NUMBER_FIELD,
      label: 'caractere fora da lista',
    },
    {
      body: { referenceNumber: '1'.repeat(31) },
      field: REFERENCE_NUMBER_FIELD,
      label: '31 caracteres',
    },
    {
      body: { items: [{ productCode: 'P1', quantity: '1.0001' }] },
      field: 'items.0.quantity',
      label: 'quantidade com quatro casas',
    },
    {
      body: { items: [{ productCode: 'P1', quantity: '0.000' }] },
      field: 'items.0.quantity',
      label: 'quantidade zero',
    },
    {
      body: { items: [{ productCode: 'P1', quantity: 1 }] },
      field: 'items.0.quantity',
      label: 'quantidade número JSON',
    },
    {
      body: { items: [{ ...ONE_ITEM[0], unitValue: '0.01' }] },
      field: 'items.0',
      label: 'preço no item',
    },
    {
      body: { items: [{ ...ONE_ITEM[0], quantityUnit: 'UN' }] },
      field: 'items.0',
      label: 'unidade no item',
    },
    { body: { contractorId: TYPE_ID }, field: '', label: 'contratante no corpo' },
  ])('$label → 400 no campo $field', async ({ body, field }) => {
    const error = await refusal(body)
    expect(error.status).toBe(400)
    expect(error.details?.some((detail) => detail.field === field)).toBe(true)
  })
})

const ALL_OFF: OccurrenceRequirements = {
  declaredAmountLabel: 'Valor pago',
  declaredAmountMode: 'off',
  declaredAmountScope: 'item',
  itemsMinimumCount: null,
  itemsMode: 'optional',
  noteMode: 'optional',
  photoMinimumCount: 1,
  photoMode: 'off',
  referenceNumberLabel: 'Número do documento do cliente',
  referenceNumberMode: 'off',
  signatureMode: 'off',
}

function guardRefusal(params: Partial<Parameters<typeof assertDriverOccurrenceRequirements>[0]>) {
  try {
    assertDriverOccurrenceRequirements({
      attachmentCount: 0,
      declaredAmount: null,
      hasSignature: false,
      lines: [],
      note: '',
      referenceNumber: null,
      requirements: ALL_OFF,
      ...params,
    })
  } catch (error) {
    return error
  }
  return undefined
}

describe('cobrança do número e do valor pago (assertDriverOccurrenceRequirements)', () => {
  test('a observação vem antes do número, e o número antes do valor pago', () => {
    const requirements = {
      ...ALL_OFF,
      declaredAmountMode: 'required',
      noteMode: 'required',
      referenceNumberMode: 'required',
    } as const
    expect((guardRefusal({ requirements }) as ApiError).code).toBe('TRIP_OCCURRENCE_NOTE_REQUIRED')
    expect(guardRefusal({ note: 'x', requirements })).toBeInstanceOf(
      TripOccurrenceReferenceNumberRequiredError,
    )
    expect(
      (guardRefusal({ note: 'x', referenceNumber: 'NFD 1', requirements }) as ApiError).details,
    ).toEqual([{ field: DECLARED_AMOUNT_FIELD, message: 'Required by the occurrence type.' }])
  })

  test('por linha: a primeira linha sem valor é o campo; zero é valor', () => {
    const requirements = { ...ALL_OFF, declaredAmountMode: 'required' } as const
    const lines = [
      { declaredAmount: '0', hasVaryingUnitValue: false },
      { declaredAmount: null, hasVaryingUnitValue: false },
    ]
    const error = guardRefusal({ lines, requirements })
    expect(error).toBeInstanceOf(TripOccurrenceDeclaredAmountRequiredError)
    expect((error as ApiError).details?.[0]?.field).toBe('items[1].declaredAmount')
  })

  test('preço que varia exige o valor da linha com o modo opcional, nunca com off', () => {
    const lines = [{ declaredAmount: null, hasVaryingUnitValue: true }]
    expect(
      guardRefusal({ lines, requirements: { ...ALL_OFF, declaredAmountMode: 'optional' } }),
    ).toBeInstanceOf(TripOccurrenceDeclaredAmountRequiredError)
    expect(guardRefusal({ lines, requirements: ALL_OFF })).toBeUndefined()
  })

  test('opcional e off nunca recusam por ausência', () => {
    expect(
      guardRefusal({
        requirements: {
          ...ALL_OFF,
          declaredAmountMode: 'optional',
          referenceNumberMode: 'optional',
        },
      }),
    ).toBeUndefined()
  })
})

describe('resolvedor único: os dois modos novos têm exceção; escopo e rótulos são só do tipo', () => {
  test('o contratante afrouxa o número e o valor pago; o escopo segue o do tipo', () => {
    const { requirements, sources } = resolveOccurrenceRequirements({
      contractorOverride: { declaredAmountMode: 'optional', referenceNumberMode: 'off' },
      recipientOverride: null,
      type: {
        declaredAmountLabel: 'Valor da NFD',
        declaredAmountMode: 'required',
        declaredAmountScope: 'occurrence',
        referenceNumberLabel: 'NFD',
        referenceNumberMode: 'required',
      },
    })
    expect(requirements.referenceNumberMode).toBe('off')
    expect(requirements.declaredAmountMode).toBe('optional')
    expect(requirements.declaredAmountScope).toBe('occurrence')
    expect(requirements.referenceNumberLabel).toBe('NFD')
    expect(sources.referenceNumberMode).toBe('contractor')
    expect(sources.declaredAmountMode).toBe('contractor')
    expect(sources.declaredAmountScope).toBe('type')
    expect(sources.declaredAmountLabel).toBe('type')
  })

  test('nulo na exceção herda do tipo; o destinatário vence o contratante', () => {
    const { requirements, sources } = resolveOccurrenceRequirements({
      contractorOverride: { declaredAmountMode: null, referenceNumberMode: 'optional' },
      recipientOverride: { referenceNumberMode: 'required' },
      type: { declaredAmountMode: 'required', referenceNumberMode: 'off' },
    })
    expect(requirements.declaredAmountMode).toBe('required')
    expect(sources.declaredAmountMode).toBe('type')
    expect(requirements.referenceNumberMode).toBe('required')
    expect(sources.referenceNumberMode).toBe('recipient')
  })

  test('sem nada declarado, os padrões da migration: desligado, escopo item', () => {
    const { requirements } = resolveOccurrenceRequirements({
      contractorOverride: null,
      recipientOverride: null,
      type: {},
    })
    expect(requirements.referenceNumberMode).toBe('off')
    expect(requirements.declaredAmountMode).toBe('off')
    expect(requirements.declaredAmountScope).toBe('item')
  })
})

describe('WhatsApp: as recusas novas mandam para o aplicativo', () => {
  test.each([
    new TripOccurrenceReferenceNumberRequiredError(),
    new TripOccurrenceDeclaredAmountRequiredError(DECLARED_AMOUNT_FIELD),
    new OccurrenceItemQuantityAboveDocumentError('items[0].quantity'),
  ])('%p', (error) => {
    expect(describeOccurrenceRequirementRefusal(error)?.message).toContain(USE_THE_APP)
  })
})
