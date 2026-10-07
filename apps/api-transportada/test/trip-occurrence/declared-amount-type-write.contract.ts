/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T4.1, RF1, RF2, CA04, CA05): o cadastro do tipo grava os campos do número do documento do
 * cliente, do valor pago e da linha de item; ausente é "não mexa"; o par valor-pago-por-item sem
 * produtos é 422 sobre o estado RESULTANTE; e salvar o aviso interno nunca zera o e-mail à contratante.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { OccurrenceTypeDeclaredAmountNeedsItemsError } from '../../src/trips/domain/trip.error.js'
import {
  toOverrideRequirementInsert,
  toOverrideRequirementUpdate,
} from '../../src/trips/infrastructure/occurrence-override-requirement-columns.support.js'
import {
  parseOccurrenceAttachmentOverridesRequest,
  parseOccurrenceTypeRequest,
} from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000c1'
const NEEDS_ITEMS_CODE = 'OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS'
const UNKNOWN_PLACEHOLDER = 'UNKNOWN_TEMPLATE_PLACEHOLDER'

const TYPE_BODY = {
  emailTemplateKey: null,
  flow: 'document',
  name: 'Devolução parcial',
  occurrenceTypeId: TYPE_ID,
  stage: 'delivery',
}

function jsonRequest(body: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/x', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function statusOf(promise: Promise<unknown>): Promise<number | undefined> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  return (error as { status?: number } | undefined)?.status
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  return JSON.stringify(error)
}

describe('o PUT do catálogo aceita os campos novos do tipo (spec 247 RF1)', () => {
  test('aceita os seis campos e o mapper os repassa ao caso de uso', async () => {
    const body = await parseOccurrenceTypeRequest(
      jsonRequest({
        ...TYPE_BODY,
        declaredAmountLabel: 'Valor pago pela loja',
        declaredAmountMode: 'optional',
        declaredAmountScope: 'item',
        emailItemLineTemplate: '{{codigoItem}} – {{item}} – {{valorItem}}',
        referenceNumberLabel: 'Número da NFD',
        referenceNumberMode: 'required',
      }),
    )

    expect(toSaveOccurrenceTypeValues(body)).toMatchObject({
      declaredAmountLabel: 'Valor pago pela loja',
      declaredAmountMode: 'optional',
      declaredAmountScope: 'item',
      emailItemLineTemplate: '{{codigoItem}} – {{item}} – {{valorItem}}',
      referenceNumberLabel: 'Número da NFD',
      referenceNumberMode: 'required',
    })
  })

  test('ausente fica ausente — "não mexa", sem padrão escondido', async () => {
    const body = await parseOccurrenceTypeRequest(jsonRequest(TYPE_BODY))

    for (const field of [
      'declaredAmountLabel',
      'declaredAmountMode',
      'declaredAmountScope',
      'emailItemLineTemplate',
      'referenceNumberLabel',
      'referenceNumberMode',
    ] as const) {
      expect(body[field]).toBeUndefined()
      expect(toSaveOccurrenceTypeValues(body)[field]).toBeUndefined()
    }
  })

  test('modo, escopo e rótulo fora do vocabulário são 400', async () => {
    const invalid = [
      { declaredAmountMode: 'sometimes' },
      { referenceNumberMode: null },
      { declaredAmountScope: 'trip' },
      { declaredAmountLabel: '   ' },
      { referenceNumberLabel: 'x'.repeat(41) },
    ]
    for (const override of invalid) {
      expect(
        await statusOf(parseOccurrenceTypeRequest(jsonRequest({ ...TYPE_BODY, ...override }))),
      ).toBe(400)
    }
  })

  test('o rótulo é aparado antes de valer', async () => {
    const body = await parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, referenceNumberLabel: '  Número da NFD  ' }),
    )

    expect(body.referenceNumberLabel).toBe('Número da NFD')
  })
})

describe('os marcadores são conferidos por contexto no cadastro (spec 247 CA04)', () => {
  test('marcador de linha dentro do corpo e do assunto é recusado, com o nome do marcador', async () => {
    const inBody = parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, emailBody: 'Total {{somaItem}}' }),
    )
    expect(await statusOf(inBody)).toBe(400)

    const inSubject = parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, emailSubject: '{{linhasItens}}' }),
    )
    expect(await statusOf(inSubject)).toBe(400)
    expect(
      await messageOf(
        parseOccurrenceTypeRequest(jsonRequest({ ...TYPE_BODY, emailSubject: '{{linhasItens}}' })),
      ),
    ).toContain(UNKNOWN_PLACEHOLDER)
  })

  test('{{linhasItens}} no corpo vale; na linha de item é recusado (recursão)', async () => {
    const body = await parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, emailBody: 'Itens:\n{{linhasItens}}' }),
    )
    expect(body.emailBody).toBe('Itens:\n{{linhasItens}}')

    const recursive = parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, emailItemLineTemplate: '{{codigoItem}} {{linhasItens}}' }),
    )
    expect(await statusOf(recursive)).toBe(400)
  })

  test('na linha de item valem os marcadores de linha e os de ocorrência; o desconhecido é 400', async () => {
    const valid = await parseOccurrenceTypeRequest(
      jsonRequest({
        ...TYPE_BODY,
        emailItemLineTemplate:
          '{{codigoItem}} {{item}} {{quantidadeItem}}{{unidadeItem}} {{valorUnitarioItem}} {{somaItem}} {{valorItem}} {{observacao}}',
      }),
    )
    expect(valid.emailItemLineTemplate).toContain('{{somaItem}}')

    const unknown = parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, emailItemLineTemplate: '{{numeroNfd}}' }),
    )
    expect(await statusOf(unknown)).toBe(400)
  })

  test('a linha de item passa de 400 caracteres: 400', async () => {
    expect(
      await statusOf(
        parseOccurrenceTypeRequest(
          jsonRequest({ ...TYPE_BODY, emailItemLineTemplate: 'x'.repeat(401) }),
        ),
      ),
    ).toBe(400)
    const atLimit = await parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, emailItemLineTemplate: 'x'.repeat(400) }),
    )
    expect(atLimit.emailItemLineTemplate).toHaveLength(400)
  })
})

describe('as exceções aceitam os dois modos novos, nulo herda (spec 247 D8)', () => {
  const overrideBase = { attachmentMode: 'optional', contractorId: CONTRACTOR }

  test('aceita os modos, nulos incluídos, nas duas listas', async () => {
    const body = await parseOccurrenceAttachmentOverridesRequest(
      jsonRequest({
        contractorOverrides: [
          { ...overrideBase, declaredAmountMode: 'required', referenceNumberMode: null },
        ],
        recipientOverrides: [
          {
            attachmentMode: 'off',
            declaredAmountMode: null,
            referenceNumberMode: 'optional',
            taxId: '12345678000195',
          },
        ],
      }),
    )

    expect(body.contractorOverrides[0]).toMatchObject({
      declaredAmountMode: 'required',
      referenceNumberMode: null,
    })
    expect(body.recipientOverrides[0]).toMatchObject({
      declaredAmountMode: null,
      referenceNumberMode: 'optional',
    })
  })

  test('o corpo antigo continua valendo e deixa os campos ausentes', async () => {
    const body = await parseOccurrenceAttachmentOverridesRequest(
      jsonRequest({ contractorOverrides: [overrideBase], recipientOverrides: [] }),
    )

    expect(body.contractorOverrides[0]?.referenceNumberMode).toBeUndefined()
    expect(body.contractorOverrides[0]?.declaredAmountMode).toBeUndefined()
  })

  test('modo fora do vocabulário é 400', async () => {
    expect(
      await statusOf(
        parseOccurrenceAttachmentOverridesRequest(
          jsonRequest({
            contractorOverrides: [{ ...overrideBase, declaredAmountMode: 'sometimes' }],
            recipientOverrides: [],
          }),
        ),
      ),
    ).toBe(400)
  })

  test('três estados na escrita: ausente → nulo no INSERT e "não mexa" no UPDATE; nulo e valor valem', () => {
    const absent = { attachmentMode: 'optional' as const }
    expect(toOverrideRequirementInsert(absent)).toMatchObject({
      declaredAmountMode: null,
      referenceNumberMode: null,
    })
    expect(toOverrideRequirementUpdate(absent)).not.toHaveProperty('declaredAmountMode')
    expect(toOverrideRequirementUpdate(absent)).not.toHaveProperty('referenceNumberMode')

    const explicitNull = { ...absent, declaredAmountMode: null, referenceNumberMode: null }
    expect(toOverrideRequirementUpdate(explicitNull)).toMatchObject({
      declaredAmountMode: null,
      referenceNumberMode: null,
    })

    const withValue = {
      ...absent,
      declaredAmountMode: 'required' as const,
      referenceNumberMode: 'optional' as const,
    }
    expect(toOverrideRequirementInsert(withValue)).toMatchObject({
      declaredAmountMode: 'required',
      referenceNumberMode: 'optional',
    })
    expect(toOverrideRequirementUpdate(withValue)).toMatchObject({
      declaredAmountMode: 'required',
      referenceNumberMode: 'optional',
    })
  })
})

type StoredType = Pick<
  OccurrenceTypeRecord,
  'declaredAmountMode' | 'declaredAmountScope' | 'itemsMode' | 'redeliveryPolicy'
>

const BASE_VALUES: SaveOccurrenceTypeValues = {
  active: true,
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null,
  name: 'Devolução parcial',
  notifies: false,
  occurrenceTypeId: TYPE_ID,
  stage: 'delivery',
}

function buildRecord(): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TYPE_ID,
    name: 'Devolução parcial',
    notifies: false,
    stage: 'delivery',
  }
}

async function save(input: {
  readonly stored: null | StoredType
  readonly values: Partial<SaveOccurrenceTypeValues>
}): Promise<SaveOccurrenceTypeValues[]> {
  const saved: SaveOccurrenceTypeValues[] = []
  await saveOccurrenceTypeWithTemplate({
    companyId: COMPANY,
    findCurrentType: async () => input.stored,
    save: async (values) => {
      saved.push(values)
      return buildRecord()
    },
    templates: { hasActiveEmailTemplate: async () => true },
    values: { ...BASE_VALUES, ...input.values },
  })
  return saved
}

function stored(overrides: Partial<StoredType>): StoredType {
  return {
    declaredAmountMode: 'off',
    declaredAmountScope: 'item',
    itemsMode: 'optional',
    redeliveryPolicy: 'unset',
    ...overrides,
  }
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('valor pago por item exige produtos, sobre o estado resultante (spec 247 RF1)', () => {
  test('os três termos: modo ligado, escopo item e produtos desligados é 422 com o código estável', async () => {
    const error = await rejectionOf(
      save({
        stored: stored({}),
        values: { declaredAmountMode: 'optional', declaredAmountScope: 'item', itemsMode: 'off' },
      }),
    )

    expect(error).toBeInstanceOf(OccurrenceTypeDeclaredAmountNeedsItemsError)
    expect((error as { status: number }).status).toBe(422)
    expect((error as { code: string }).code).toBe(NEEDS_ITEMS_CODE)
  })

  test('cada termo sozinho derruba a recusa: modo off, escopo da ocorrência ou produtos ligados', async () => {
    const offMode = await save({
      stored: stored({}),
      values: { declaredAmountMode: 'off', declaredAmountScope: 'item', itemsMode: 'off' },
    })
    const occurrenceScope = await save({
      stored: stored({}),
      values: {
        declaredAmountMode: 'required',
        declaredAmountScope: 'occurrence',
        itemsMode: 'off',
      },
    })
    const withItems = await save({
      stored: stored({}),
      values: {
        declaredAmountMode: 'required',
        declaredAmountScope: 'item',
        itemsMode: 'required',
      },
    })

    expect(offMode).toHaveLength(1)
    expect(occurrenceScope).toHaveLength(1)
    expect(withItems).toHaveLength(1)
  })

  test('campo ausente lê o gravado: desligar os produtos num tipo com valor pago por item é 422', async () => {
    const error = await rejectionOf(
      save({
        stored: stored({ declaredAmountMode: 'optional', declaredAmountScope: 'item' }),
        values: { itemsMode: 'off' },
      }),
    )

    expect(error).toBeInstanceOf(OccurrenceTypeDeclaredAmountNeedsItemsError)
  })

  test('ligar o valor pago por item num tipo que já tem produtos desligados é 422', async () => {
    const error = await rejectionOf(
      save({
        stored: stored({ itemsMode: 'off' }),
        values: { declaredAmountMode: 'required' },
      }),
    )

    expect(error).toBeInstanceOf(OccurrenceTypeDeclaredAmountNeedsItemsError)
  })

  test('trocar o escopo para a ocorrência desfaz a recusa mesmo com os produtos desligados', async () => {
    const saved = await save({
      stored: stored({
        declaredAmountMode: 'optional',
        itemsMode: 'off',
        redeliveryPolicy: 'unset',
      }),
      values: { declaredAmountScope: 'occurrence' },
    })

    expect(saved).toHaveLength(1)
  })

  test('criação sem os campos usa os padrões (modo off): produtos desligados valem', async () => {
    const saved = await save({
      stored: null,
      values: { itemsMode: 'off', occurrenceTypeId: null },
    })

    expect(saved).toHaveLength(1)
  })

  test('o PUT sem os campos novos MANTÉM os gravados: nenhum chega ao repositório', async () => {
    const saved = await save({
      stored: stored({ declaredAmountMode: 'required', itemsMode: 'required' }),
      values: {},
    })

    expect(saved[0]?.declaredAmountMode).toBeUndefined()
    expect(saved[0]?.declaredAmountScope).toBeUndefined()
    expect(saved[0]?.referenceNumberMode).toBeUndefined()
    expect(saved[0]?.emailItemLineTemplate).toBeUndefined()
  })
})

describe('o aviso interno e o e-mail à contratante são independentes (spec 247 RF2, CA05)', () => {
  test('salvar com email_template_key mantém assunto e corpo como vieram', async () => {
    const saved = await save({
      stored: null,
      values: {
        emailBody: 'corpo do SAC',
        emailSubject: 'assunto do SAC',
        emailTemplateKey: 'trip.ocorrencia-personalizada',
        occurrenceTypeId: null,
      },
    })

    expect(saved[0]?.emailTemplateKey).toBe('trip.ocorrencia-personalizada')
    expect(saved[0]?.emailSubject).toBe('assunto do SAC')
    expect(saved[0]?.emailBody).toBe('corpo do SAC')
  })
})
