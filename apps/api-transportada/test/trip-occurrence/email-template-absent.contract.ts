/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 D9: o painel antigo ainda manda `emailBody`/`emailSubject`/`emailItemLineTemplate` durante a
 * publicação em etapas. O `PUT` do tipo os aceita, sem conferir marcador, e o mapeador os descarta: nenhum
 * valor chega ao caso de uso. A etapa B tira as chaves.
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

describe('o PUT do tipo aceita e ignora o texto antigo do e-mail (spec 269 D9)', () => {
  test('o painel antigo, com as três chaves e marcadores {{camelCase}}, não toma 400', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({}))

    expect(parsed.name).toBe('Devolução parcial')
  })

  test('nenhuma das três chaves chega aos valores do caso de uso', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ emailBody: 'x', emailItemLineTemplate: 'y', emailSubject: 'z' }),
    )

    const values = toSaveOccurrenceTypeValues(parsed) as Record<string, unknown>
    expect(values.emailBody).toBeUndefined()
    expect(values.emailItemLineTemplate).toBeUndefined()
    expect(values.emailSubject).toBeUndefined()
  })

  test('sem as chaves também passa', async () => {
    await expect(parseOccurrenceTypeRequest(putRequest({}))).resolves.toBeDefined()
  })
})
