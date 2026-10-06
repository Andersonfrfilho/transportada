/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.1b: o cadastro do tipo grava o conjunto de momentos. Com `moments`, `stage`/`flow`
 * gravados são os derivados do conjunto; sem `moments`, o gravado fica — e se o `PUT` muda
 * `stage`/`flow` de um tipo cujo conjunto o par não consegue dizer, é `409`. Nota e parada juntas
 * são recusadas.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  saveOccurrenceTypeWithTemplate,
  type CurrentOccurrenceTypeShape,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'

function values(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Avaria',
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

describe('o cadastro grava o conjunto de momentos (spec 246 T1b.1b)', () => {
  test('com moments, stage e flow gravados são os derivados do conjunto', async () => {
    const written = await save({
      stored: null,
      values: values({ flow: 'stop', moments: ['document', 'separation'], stage: 'delivery' }),
    })

    expect(written.moments).toEqual(['separation', 'document'])
    expect(written.stage).toBe('separation')
    expect(written.flow).toBe('document')
  })

  /** Spec 246 T1b.6: tipo sem momento nenhum não apareceria para ninguém. */
  test('conjunto vazio é recusado antes de gravar', async () => {
    await expect(save({ stored: null, values: values({ moments: [] }) })).rejects.toMatchObject({
      code: 'OCCURRENCE_TYPE_MOMENTS_REQUIRED',
      status: 422,
    })
  })

  test('nota e parada juntas são recusadas antes de gravar', async () => {
    await expect(
      save({ stored: null, values: values({ moments: ['document', 'stop'] }) }),
    ).rejects.toMatchObject({ code: 'OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP', status: 422 })
  })

  test('sem moments e sem mudar stage/flow, o conjunto gravado fica intocado', async () => {
    const written = await save({
      stored: { flow: 'document', moments: ['separation', 'document'], stage: 'separation' },
      values: values({ stage: 'separation' }),
    })

    expect('moments' in written).toBe(false)
  })

  test('sem moments, mudar o flow de tipo que o par diz inteiro re-deriva o conjunto', async () => {
    const written = await save({
      stored: { flow: 'document', moments: ['document', 'office'], stage: 'delivery' },
      values: values({ flow: 'stop' }),
    })

    expect(written.moments).toEqual(['stop', 'office'])
  })

  test('tipo antigo sem linha de momento segue a mesma regra, pelos derivados', async () => {
    const written = await save({
      stored: { flow: 'document', moments: [], stage: 'delivery' },
      values: values({ stage: 'separation' }),
    })

    expect(written.moments).toEqual(['separation'])
  })

  test('sem moments, mudar stage/flow de tipo com vários momentos é 409', async () => {
    await expect(
      save({
        stored: { flow: 'document', moments: ['separation', 'document'], stage: 'separation' },
        values: values({ stage: 'delivery' }),
      }),
    ).rejects.toMatchObject({ code: 'OCCURRENCE_TYPE_MOMENTS_STAGE_CONFLICT', status: 409 })
  })

  test('"deixa a nota para trás" vale pelo stage derivado do conjunto', async () => {
    const written = await save({
      stored: null,
      values: values({ leavesDocumentBehind: true, moments: ['separation', 'document'] }),
    })
    expect(written.stage).toBe('separation')

    await expect(
      save({ stored: null, values: values({ leavesDocumentBehind: true, moments: ['document'] }) }),
    ).rejects.toMatchObject({ code: 'OCCURRENCE_TYPE_LEAVES_BEHIND_REQUIRES_SEPARATION' })
  })
})

describe('o corpo do PUT do catálogo aceita moments (spec 246 T1b.1b)', () => {
  function putRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/company-settings/occurrence-types', {
      body: JSON.stringify({
        active: true,
        flow: 'document',
        name: 'Avaria',
        occurrenceTypeId: OCCURRENCE_TYPE_ID,
        stage: 'delivery',
        ...body,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
  }

  test('moments no vocabulário passa; ausente continua ausente (mantém o gravado)', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ moments: ['separation', 'document'] }),
    )
    expect(parsed.moments).toEqual(['separation', 'document'])
    expect((await parseOccurrenceTypeRequest(putRequest({}))).moments).toBeUndefined()
  })

  test('momento fora do vocabulário é 400', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ moments: ['warehouse'] })),
    ).rejects.toMatchObject({ status: 400 })
  })
})
