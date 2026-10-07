/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.5 (CA03): só a configuração decide. Quatro tipos de ocorrência:
 *
 *   - dois com o MESMO nome e configuração diferente (o comportamento tem que diferir);
 *   - dois com nomes diferentes e a MESMA configuração (o comportamento tem que ser idêntico).
 *
 * O que é afirmado: a exigência efetiva do registro (número do documento, valor pago, escopo, produtos,
 * exceção de contratante e de destinatário), o valor pago e a soma que sobem ao registro, e o e-mail
 * montado. Nenhum nome de tipo, nenhuma constante por tipo, nenhum contratante específico entra na conta.
 */
import { describe, expect, test } from 'bun:test'

import type { FieldOccurrenceTypeOverrides } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { formatBrazilianAmount } from '../../src/trips/domain/occurrence-amount.policy.js'
import { renderOccurrenceTemplate } from '../../src/trips/domain/occurrence-template.policy.js'
import type {
  OccurrenceTemplateLine,
  OccurrenceTemplateValues,
} from '../../src/trips/domain/occurrence-template.types.js'
import { buildOccurrenceItemValues } from '../../src/trips/domain/occurrence-template.policy.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const TRIP = '00000000-0000-4000-8000-000000000011'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000c1'
const OTHER_CONTRACTOR = '00000000-0000-4000-8000-0000000000c2'
const RECIPIENT_TAX_ID = '12345678000190'

const REFERENCE_NUMBER_REQUIRED = 'TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED'
const DECLARED_AMOUNT_REQUIRED = 'TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED'
const REFERENCE_NUMBER = 'NFD 45029'
const ITEM_DECLARED_AMOUNT_FIELD = 'items[0].declaredAmount'
const OCCURRENCE_DECLARED_AMOUNT_FIELD = 'declaredAmount'

const NAME_PARTIAL_RETURN = 'Devolução parcial'
const NAME_EXTENSION = 'Prorrogação'
const NAME_TOTAL_RETURN = 'Devolução total'

type TypeConfiguration = Pick<
  OccurrenceTypeRecord,
  | 'allowsMultipleItems'
  | 'declaredAmountMode'
  | 'declaredAmountScope'
  | 'emailBody'
  | 'emailItemLineTemplate'
  | 'emailSubject'
  | 'itemsMinimumCount'
  | 'itemsMode'
  | 'referenceNumberMode'
>

/** Exige tudo: número, valor pago por linha, produtos; e-mail com a conta de cada linha. */
const STRICT_CONFIGURATION: TypeConfiguration = {
  allowsMultipleItems: true,
  declaredAmountMode: 'required',
  declaredAmountScope: 'item',
  emailBody: 'NFD {{numeroReferencia}}\n{{linhasItens}}\nPago {{valorDeclarado}} de {{somaItens}}',
  emailItemLineTemplate: '{{codigoItem}} {{quantidadeItem}} {{unidadeItem}} = {{valorItem}}',
  emailSubject: 'Retorno {{numeroNotaSemSerie}}',
  itemsMinimumCount: 1,
  itemsMode: 'required',
  referenceNumberMode: 'required',
}

/** Não exige nada, valor pago da ocorrência inteira e outro texto de e-mail. */
const LOOSE_CONFIGURATION: TypeConfiguration = {
  allowsMultipleItems: false,
  declaredAmountMode: 'off',
  declaredAmountScope: 'occurrence',
  emailBody: 'Aviso: {{observacao}}',
  emailItemLineTemplate: '{{item}}',
  emailSubject: 'Aviso {{numeroNota}}',
  itemsMinimumCount: null,
  itemsMode: 'optional',
  referenceNumberMode: 'off',
}

type TypeFixture = {
  readonly configuration: TypeConfiguration
  readonly id: string
  readonly name: string
}

const STRICT_SAME_NAME: TypeFixture = {
  configuration: STRICT_CONFIGURATION,
  id: 'type-a1',
  name: NAME_PARTIAL_RETURN,
}
const LOOSE_SAME_NAME: TypeFixture = {
  configuration: LOOSE_CONFIGURATION,
  id: 'type-b1',
  name: NAME_PARTIAL_RETURN,
}
const STRICT_OTHER_NAME: TypeFixture = {
  configuration: STRICT_CONFIGURATION,
  id: 'type-a2',
  name: NAME_EXTENSION,
}
const LOOSE_OTHER_NAME: TypeFixture = {
  configuration: LOOSE_CONFIGURATION,
  id: 'type-b2',
  name: NAME_TOTAL_RETURN,
}

const PRODUCTS = [
  {
    code: 'P1',
    commercialUnit: 'CX',
    description: 'Biscoito',
    ordinal: 1,
    quantity: '3.0000',
    unitValue: '19.9950',
  },
  {
    code: 'P2',
    commercialUnit: 'UN',
    description: 'Bolo',
    ordinal: 2,
    quantity: '1.0000',
    unitValue: '57.2000',
  },
]

type Registration = {
  readonly contractorId?: string
  readonly declaredAmount?: string
  readonly items?: readonly {
    readonly declaredAmount?: string
    readonly productCode: string
    readonly quantity: string
  }[]
  readonly overrides?: FieldOccurrenceTypeOverrides
  readonly recipientTaxId?: string
  readonly referenceNumber?: string
  readonly type: TypeFixture
}

function toTypeRecord(type: TypeFixture): OccurrenceTypeRecord {
  return {
    active: true,
    attachmentMode: 'off',
    emailTemplateKey: null,
    id: type.id,
    name: type.name,
    noteMode: 'optional',
    notifies: false,
    photoMinimumCount: 1,
    signatureMode: 'off',
    stage: 'delivery',
    ...type.configuration,
  }
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
    attachmentObjectId: null,
    companyId: COMPANY,
    ...(input.declaredAmount === undefined ? {} : { declaredAmount: input.declaredAmount }),
    documentId: DOCUMENT,
    driverId: '00000000-0000-4000-8000-00000000000d',
    idempotencyKey: crypto.randomUUID(),
    ...(input.items === undefined ? {} : { items: input.items }),
    note: 'cliente recusou',
    occurrenceTypeId: input.type.id,
    productCode: '',
    ...(input.referenceNumber === undefined ? {} : { referenceNumber: input.referenceNumber }),
    repository: {
      findConfirmedUpload: async () => null,
      findOccurrenceType: async () => toTypeRecord(input.type),
      findOccurrenceTypeOverrides: async () =>
        input.overrides ?? { contractorOverrides: [], recipientOverrides: [] },
      findReachableDocument: async () => ({
        contractorId: input.contractorId ?? CONTRACTOR,
        recipientTaxId: input.recipientTaxId ?? null,
        tripId: TRIP,
      }),
      listDocumentProducts: async () => PRODUCTS,
    },
    signatureObjectId: null,
    unitOfWork: createFieldReportUnitOfWork(state),
  })
  return { result, state }
}

type Outcome = {
  readonly code: string
  readonly field: string
}

const SAVED_OUTCOME: Outcome = { code: 'saved', field: '' }

/** O que o registro respondeu: o código e o campo da recusa, ou `saved` com o que foi gravado. */
async function outcomeOf(input: Registration): Promise<Outcome> {
  try {
    await register(input).result
    return SAVED_OUTCOME
  } catch (error) {
    const refusal = error as {
      readonly code: string
      readonly details?: readonly { readonly field: string }[]
    }
    return { code: refusal.code, field: refusal.details?.[0]?.field ?? '' }
  }
}

const ONE_ITEM = [{ productCode: 'P1', quantity: '2' }] as const

describe('as quatro configurações: o nome do tipo não entra na exigência (CA03)', () => {
  test('mesma configuração, nomes diferentes: a mesma recusa nas três etapas da cobrança', async () => {
    const inputs: readonly Omit<Registration, 'type'>[] = [
      { items: ONE_ITEM },
      { items: ONE_ITEM, referenceNumber: REFERENCE_NUMBER },
      {
        items: [{ declaredAmount: '25.00', productCode: 'P1', quantity: '2' }],
        referenceNumber: REFERENCE_NUMBER,
      },
    ]

    const sameName = await Promise.all(
      inputs.map((input) => outcomeOf({ ...input, type: STRICT_SAME_NAME })),
    )
    const otherName = await Promise.all(
      inputs.map((input) => outcomeOf({ ...input, type: STRICT_OTHER_NAME })),
    )

    expect(sameName).toEqual([
      { code: REFERENCE_NUMBER_REQUIRED, field: 'referenceNumber' },
      { code: DECLARED_AMOUNT_REQUIRED, field: ITEM_DECLARED_AMOUNT_FIELD },
      SAVED_OUTCOME,
    ])
    expect(otherName).toEqual(sameName)
  })

  test('mesmo nome, configuração diferente: o desligado aceita onde o exigente recusa', async () => {
    const input = { items: ONE_ITEM }

    const strict = await outcomeOf({ ...input, type: STRICT_SAME_NAME })
    const loose = await outcomeOf({ ...input, type: LOOSE_SAME_NAME })
    const looseOtherName = await outcomeOf({ ...input, type: LOOSE_OTHER_NAME })

    expect(strict.code).toBe(REFERENCE_NUMBER_REQUIRED)
    expect(loose).toEqual(SAVED_OUTCOME)
    expect(looseOtherName).toEqual(loose)
  })

  test('o escopo é do tipo: o mesmo valor ausente aponta a ocorrência ou a linha', async () => {
    const itemScope = { ...STRICT_SAME_NAME, id: 'scope-item' }
    const occurrenceScope: TypeFixture = {
      ...STRICT_SAME_NAME,
      configuration: { ...STRICT_CONFIGURATION, declaredAmountScope: 'occurrence' },
      id: 'scope-occurrence',
    }
    const input = { items: ONE_ITEM, referenceNumber: REFERENCE_NUMBER }

    expect((await outcomeOf({ ...input, type: itemScope })).field).toBe(ITEM_DECLARED_AMOUNT_FIELD)
    expect((await outcomeOf({ ...input, type: occurrenceScope })).field).toBe(
      OCCURRENCE_DECLARED_AMOUNT_FIELD,
    )
  })

  test('produtos exigidos no tipo: sem item recusa; o tipo desligado aceita a nota inteira', async () => {
    const strict = await outcomeOf({ referenceNumber: REFERENCE_NUMBER, type: STRICT_OTHER_NAME })
    const loose = await outcomeOf({ type: LOOSE_SAME_NAME })

    expect(strict).not.toEqual(SAVED_OUTCOME)
    expect(loose).toEqual(SAVED_OUTCOME)
  })
})

describe('a exceção da nota vale, e vale a efetiva — nunca o modo do tipo (CA03)', () => {
  const relaxForContractor: FieldOccurrenceTypeOverrides = {
    contractorOverrides: [
      {
        contractorId: CONTRACTOR,
        declaredAmountMode: 'optional',
        occurrenceTypeId: STRICT_SAME_NAME.id,
        referenceNumberMode: 'off',
      },
    ],
    recipientOverrides: [],
  }

  test('o contratante da nota afrouxa o tipo exigente; o de outra nota não', async () => {
    const input = { items: ONE_ITEM, overrides: relaxForContractor, type: STRICT_SAME_NAME }

    const ofTheDocument = await outcomeOf({ ...input, contractorId: CONTRACTOR })
    const ofAnotherContractor = await outcomeOf({ ...input, contractorId: OTHER_CONTRACTOR })

    expect(ofTheDocument).toEqual(SAVED_OUTCOME)
    expect(ofAnotherContractor.code).toBe(REFERENCE_NUMBER_REQUIRED)
  })

  test('a mesma exceção em tipo de outro nome e mesma configuração dá o mesmo resultado', async () => {
    const overrides: FieldOccurrenceTypeOverrides = {
      contractorOverrides: relaxForContractor.contractorOverrides.map((override) => ({
        ...override,
        occurrenceTypeId: STRICT_OTHER_NAME.id,
      })),
      recipientOverrides: [],
    }

    const outcome = await outcomeOf({ items: ONE_ITEM, overrides, type: STRICT_OTHER_NAME })

    expect(outcome).toEqual(SAVED_OUTCOME)
  })

  test('a exceção endurece o tipo desligado, e o destinatário vence o contratante', async () => {
    const overrides: FieldOccurrenceTypeOverrides = {
      contractorOverrides: [
        {
          contractorId: CONTRACTOR,
          occurrenceTypeId: LOOSE_SAME_NAME.id,
          referenceNumberMode: 'required',
        },
      ],
      recipientOverrides: [
        {
          occurrenceTypeId: LOOSE_SAME_NAME.id,
          referenceNumberMode: 'optional',
          taxId: RECIPIENT_TAX_ID,
        },
      ],
    }
    const input = { overrides, type: LOOSE_SAME_NAME }

    const contractorOnly = await outcomeOf(input)
    const withRecipient = await outcomeOf({ ...input, recipientTaxId: RECIPIENT_TAX_ID })

    expect(contractorOnly.code).toBe(REFERENCE_NUMBER_REQUIRED)
    expect(withRecipient).toEqual(SAVED_OUTCOME)
  })

  test('o contratante da nota vem do servidor: exceção de outro contratante nunca vale', async () => {
    const overrides: FieldOccurrenceTypeOverrides = {
      contractorOverrides: [
        {
          contractorId: OTHER_CONTRACTOR,
          occurrenceTypeId: LOOSE_SAME_NAME.id,
          referenceNumberMode: 'required',
        },
      ],
      recipientOverrides: [],
    }

    const outcome = await outcomeOf({ overrides, type: LOOSE_SAME_NAME })

    expect(outcome).toEqual(SAVED_OUTCOME)
  })
})

describe('o que sobe ao registro e o e-mail seguem a configuração, não o nome (CA03)', () => {
  const FULL = {
    items: [
      { declaredAmount: '25.00', productCode: 'P1', quantity: '2' },
      { declaredAmount: '57.20', productCode: 'P2', quantity: '1' },
    ],
    referenceNumber: REFERENCE_NUMBER,
  } as const

  async function savedFor(type: TypeFixture) {
    const { result, state } = register({ ...FULL, type })
    const saved = await result
    expect(state.documentOccurrences.size).toBe(1)
    return saved
  }

  function emailFor(type: TypeFixture, saved: Awaited<ReturnType<typeof savedFor>>): string {
    const lines: readonly OccurrenceTemplateLine[] = saved.items.map((item) => {
      const product = PRODUCTS.find((candidate) => candidate.code === item.productCode)
      return {
        code: item.productCode,
        declaredAmount: item.declaredAmount,
        description: product?.description ?? '',
        nfeQuantity: product?.quantity ?? '0',
        quantity: item.quantity,
        totalValue: '0',
        unit: item.quantityUnit ?? '',
        unitValue: item.unitValue ?? '0',
      }
    })
    const values: OccurrenceTemplateValues = {
      contractorName: 'Contratante',
      declaredAmount: saved.declaredAmount,
      documentLabel: '123/1',
      documentNumber: '123',
      driverName: 'Motorista',
      ...buildOccurrenceItemValues(
        lines.map((line) => ({
          code: line.code,
          description: line.description,
          quantity: line.quantity ?? line.nfeQuantity,
        })),
      ),
      itemLineTemplate: type.configuration.emailItemLineTemplate,
      lines,
      note: saved.note,
      occurredOn: '01/01/2026',
      recipientName: 'Destinatário',
      referenceNumber: saved.referenceNumber ?? undefined,
      stopLabel: 'Rua',
      totalValue: '0',
    }
    return `${renderOccurrenceTemplate({ template: type.configuration.emailSubject, values })}\n${renderOccurrenceTemplate({ template: type.configuration.emailBody, values })}`
  }

  test('mesma configuração: o mesmo gravado e o mesmo e-mail, e o valor pago é a conta das linhas', async () => {
    const withName = await savedFor(STRICT_SAME_NAME)
    const otherName = await savedFor(STRICT_OTHER_NAME)

    expect(otherName.items).toEqual(withName.items)
    expect(otherName.referenceNumber).toBe(withName.referenceNumber)
    expect(otherName.declaredAmount).toBe(withName.declaredAmount)
    expect(emailFor(STRICT_OTHER_NAME, otherName)).toBe(emailFor(STRICT_SAME_NAME, withName))
    expect(withName.items).toEqual([
      {
        declaredAmount: '25.00',
        productCode: 'P1',
        quantity: '2',
        quantityUnit: 'CX',
        unitValue: '19.9950',
      },
      {
        declaredAmount: '57.20',
        productCode: 'P2',
        quantity: '1',
        quantityUnit: 'UN',
        unitValue: '57.2000',
      },
    ])
    const expectedEmail = [
      'Retorno 123',
      'NFD NFD 45029',
      'P1 2 CX = 25,00',
      'P2 1 UN = 57,20',
      `Pago ${formatBrazilianAmount(8220n)} de ${formatBrazilianAmount(9719n)}`,
    ].join('\n')
    expect(emailFor(STRICT_SAME_NAME, withName)).toBe(expectedEmail)
  })

  test('mesmo nome, configuração diferente: outro e-mail, e o número fica fora quando o modo é off', async () => {
    const strict = await savedFor(STRICT_SAME_NAME)
    const { result } = register({
      items: [{ productCode: 'P2', quantity: '1' }],
      referenceNumber: REFERENCE_NUMBER,
      type: LOOSE_SAME_NAME,
    })
    const loose = await result

    expect(loose.typeName).toBe(strict.typeName)
    expect(emailFor(LOOSE_SAME_NAME, loose)).toBe('Aviso 123/1\nAviso: cliente recusou')
    expect(emailFor(LOOSE_SAME_NAME, loose)).not.toBe(emailFor(STRICT_SAME_NAME, strict))
  })
})
