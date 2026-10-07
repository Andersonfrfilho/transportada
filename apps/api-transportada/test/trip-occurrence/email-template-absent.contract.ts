/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2 R1, M1): o `PUT` do tipo sem `emailBody`/`emailSubject` — o painel publicado não os
 * manda — não pode apagar o e-mail à contratante. Ausente é "não mexa"; `''` explícito apaga de
 * propósito. Antes, `.default('')` na fronteira transformava a ausência em "apague".
 */
import { describe, expect, test } from 'bun:test'

import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e2'

function putRequest(extra: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify({
      emailTemplateKey: null,
      flow: 'document',
      name: 'Devolução parcial',
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      stage: 'delivery',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('o PUT do tipo sem o e-mail à contratante não o apaga (spec 247 T7.2 M1)', () => {
  test('sem emailBody e emailSubject, a fronteira os deixa ausentes', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({}))

    expect(parsed.emailBody).toBeUndefined()
    expect(parsed.emailSubject).toBeUndefined()
    const values = toSaveOccurrenceTypeValues(parsed)
    expect(values.emailBody).toBeUndefined()
    expect(values.emailSubject).toBeUndefined()
  })

  test("'' explícito continua válido e chega ao caso de uso (apaga de propósito)", async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({ emailBody: '', emailSubject: '' }))

    expect(parsed.emailBody).toBe('')
    expect(parsed.emailSubject).toBe('')
  })

  test('texto presente chega como veio', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ emailBody: 'corpo {{contratante}}', emailSubject: 'assunto' }),
    )

    expect(parsed.emailBody).toBe('corpo {{contratante}}')
    expect(parsed.emailSubject).toBe('assunto')
  })
})
