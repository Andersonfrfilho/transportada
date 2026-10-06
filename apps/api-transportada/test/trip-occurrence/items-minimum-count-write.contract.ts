/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.4 (RF1b, RF1c, RF1c2): o cadastro do tipo aceita `itemsMode = 'required'`, a quantidade
 * mínima de produtos (nulo = todos os itens) e a de fotos (1..5). `itemsMinimumCount` só vale com
 * Produtos `required` — o estado RESULTANTE é validado, lendo o gravado quando o campo vem ausente —,
 * e ausente é "não mexa" para os dois mínimos. A guarda `off` + política da 241 segue valendo.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  saveOccurrenceTypeWithTemplate,
  type CurrentOccurrenceTypeShape,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const MINIMUM_REQUIRES_REQUIRED_CODE = 'OCCURRENCE_TYPE_ITEMS_MINIMUM_REQUIRES_REQUIRED'

function putRequest(extra: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify({
      emailTemplateKey: null,
      flow: 'document',
      name: 'Recusa total',
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      stage: 'delivery',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function rejectionStatus(extra: Readonly<Record<string, unknown>>): Promise<unknown> {
  const error: unknown = await parseOccurrenceTypeRequest(putRequest(extra)).then(
    () => undefined,
    (reason: unknown) => reason,
  )
  return (error as { status?: number } | undefined)?.status
}

function values(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: OCCURRENCE_TYPE_ID,
    stage: 'delivery',
    ...overrides,
  }
}

async function save(input: {
  readonly stored: CurrentOccurrenceTypeShape | null
  readonly values: SaveOccurrenceTypeValues
}): Promise<SaveOccurrenceTypeValues> {
  const saved: SaveOccurrenceTypeValues[] = []
  await saveOccurrenceTypeWithTemplate({
    companyId: COMPANY_ID,
    findCurrentType: async () => input.stored,
    save: async (written) => {
      saved.push(written)
      return { id: OCCURRENCE_TYPE_ID } as OccurrenceTypeRecord
    },
    templates: { hasActiveEmailTemplate: async () => true },
    values: input.values,
  })
  const [written] = saved
  if (written === undefined) throw new Error('save was not called')
  return written
}

const STORED_OPTIONAL: CurrentOccurrenceTypeShape = {
  itemsMode: 'optional',
  redeliveryPolicy: 'unset',
}
const STORED_REQUIRED_WITH_COUNT: CurrentOccurrenceTypeShape = {
  itemsMinimumCount: 3,
  itemsMode: 'required',
  redeliveryPolicy: 'allowed',
}

describe('a fronteira do cadastro aceita Produtos obrigatório e os dois mínimos (spec 246 T1c.4)', () => {
  test.each(['off', 'optional', 'required'] as const)('itemsMode %s é aceito', async (mode) => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({ itemsMode: mode }))

    expect(parsed.itemsMode).toBe(mode)
  })

  test('vocabulário fora dos três modos continua 400', async () => {
    expect(await rejectionStatus({ itemsMode: 'always' })).toBe(400)
  })

  test.each([2, null])('itemsMinimumCount %p é aceito (nulo = todos os itens)', async (count) => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ itemsMinimumCount: count, itemsMode: 'required' }),
    )

    expect(parsed.itemsMinimumCount).toBe(count)
  })

  test.each([0, -1, 1.5, 'all', 100_000])('itemsMinimumCount %p é 400', async (count) => {
    expect(await rejectionStatus({ itemsMinimumCount: count })).toBe(400)
  })

  test.each([1, 3, 5])('photoMinimumCount %p é aceito', async (count) => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({ photoMinimumCount: count }))

    expect(parsed.photoMinimumCount).toBe(count)
  })

  test.each([0, 6, 2.5, '2', null])('photoMinimumCount %p é 400', async (count) => {
    expect(await rejectionStatus({ photoMinimumCount: count })).toBe(400)
  })

  test('os dois mínimos ausentes ficam ausentes — nunca viram 1 nem nulo', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({}))

    expect('itemsMinimumCount' in parsed).toBe(false)
    expect('photoMinimumCount' in parsed).toBe(false)
  })
})

describe('itemsMinimumCount só vale com Produtos obrigatório (spec 246 T1c.4, RF1c2)', () => {
  test('required com mínimo grava, e o mínimo chega ao banco', async () => {
    const written = await save({
      stored: STORED_OPTIONAL,
      values: values({ itemsMinimumCount: 2, itemsMode: 'required' }),
    })

    expect(written.itemsMode).toBe('required')
    expect(written.itemsMinimumCount).toBe(2)
  })

  test('required com política de reentrega grava (a guarda `off` da 241 não o atinge)', async () => {
    const written = await save({
      stored: STORED_OPTIONAL,
      values: values({ itemsMode: 'required', redeliveryPolicy: 'blocked' }),
    })

    expect(written.itemsMode).toBe('required')
  })

  test.each([
    [
      'optional com mínimo no corpo',
      { itemsMinimumCount: 2, itemsMode: 'optional' },
      STORED_OPTIONAL,
    ],
    ['off com mínimo no corpo', { itemsMinimumCount: 2, itemsMode: 'off' }, STORED_OPTIONAL],
    [
      'mínimo no corpo e modo ausente sobre tipo gravado optional',
      { itemsMinimumCount: 2 },
      STORED_OPTIONAL,
    ],
    [
      'modo optional no corpo, mínimo ausente e mínimo gravado',
      { itemsMode: 'optional' },
      STORED_REQUIRED_WITH_COUNT,
    ],
    ['mínimo no corpo sem tipo gravado', { itemsMinimumCount: 2 }, null],
  ] as const)('%s: 422 com código estável e nada gravado', async (_label, overrides, stored) => {
    const saved: SaveOccurrenceTypeValues[] = []
    const error: unknown = await saveOccurrenceTypeWithTemplate({
      companyId: COMPANY_ID,
      findCurrentType: async () => stored,
      save: async (written) => {
        saved.push(written)
        return { id: OCCURRENCE_TYPE_ID } as OccurrenceTypeRecord
      },
      templates: { hasActiveEmailTemplate: async () => true },
      values: values(overrides),
    }).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toMatchObject({ code: MINIMUM_REQUIRES_REQUIRED_CODE, status: 422 })
    expect(saved).toHaveLength(0)
  })

  test('sair de required levando o mínimo para nulo grava', async () => {
    const written = await save({
      stored: STORED_REQUIRED_WITH_COUNT,
      values: values({ itemsMinimumCount: null, itemsMode: 'optional' }),
    })

    expect(written.itemsMode).toBe('optional')
    expect(written.itemsMinimumCount).toBeNull()
  })

  test('mínimo no corpo com o tipo gravado required (modo ausente) grava', async () => {
    const written = await save({
      stored: STORED_REQUIRED_WITH_COUNT,
      values: values({ itemsMinimumCount: 5 }),
    })

    expect(written.itemsMinimumCount).toBe(5)
  })

  test('a guarda `off` + política da 241 segue valendo', async () => {
    await expect(
      save({
        stored: STORED_OPTIONAL,
        values: values({ itemsMode: 'off', redeliveryPolicy: 'allowed' }),
      }),
    ).rejects.toMatchObject({ code: 'OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY', status: 422 })
  })

  test('sem os campos novos, o PUT não os toca', async () => {
    const written = await save({ stored: STORED_REQUIRED_WITH_COUNT, values: values() })

    expect(written.itemsMinimumCount).toBeUndefined()
    expect(written.photoMinimumCount).toBeUndefined()
    expect(written.itemsMode).toBeUndefined()
  })
})

describe('o `PUT` entrega ao caso de uso tudo o que a fronteira aceitou (spec 246 T1c.4)', () => {
  test('cada campo do corpo chega aos valores, e ausente continua ausente', () => {
    const everything = {
      active: true,
      allowsMultipleItems: false,
      attachmentMode: 'required',
      emailBody: 'corpo',
      emailSubject: 'assunto',
      emailTemplateKey: 'template',
      emailsContractor: true,
      flow: 'stop',
      itemsMinimumCount: null,
      itemsMode: 'required',
      leavesDocumentBehind: true,
      moments: ['separation'],
      name: 'Tipo',
      notifies: true,
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      photoMinimumCount: 4,
      redeliveryPolicy: 'allowed',
      stage: 'separation',
    } as const

    expect(toSaveOccurrenceTypeValues(everything)).toEqual(everything)
    expect(toSaveOccurrenceTypeValues(values()).moments).toBeUndefined()
  })
})
