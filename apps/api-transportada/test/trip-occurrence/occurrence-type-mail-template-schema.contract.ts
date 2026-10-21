/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (D14): o `PUT` do tipo ainda **aceita** `contractorMailTemplateId` (o painel antigo o manda) e o **ignora** —
 * nada o repassa ao caso de uso, e a chave sai do corpo só depois das telas novas em produção (T5.5).
 */
import { describe, expect, test } from 'bun:test'

import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const TEMPLATE_ID = '4b581a02-3dba-4df9-a20b-20ac66163fa1'

function putRequest(extra: Record<string, unknown>): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify({
      active: true,
      emailTemplateKey: null,
      flow: 'document',
      name: 'Recusa total',
      notifies: false,
      occurrenceTypeId: null,
      stage: 'delivery',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('a chave da 269 no PUT do tipo é aceita e ignorada (spec 271 D14)', () => {
  test('uuid e null passam, e o mapeador não os repassa', async () => {
    for (const contractorMailTemplateId of [TEMPLATE_ID, null]) {
      const parsed = await parseOccurrenceTypeRequest(putRequest({ contractorMailTemplateId }))

      expect(toSaveOccurrenceTypeValues(parsed)).not.toHaveProperty('contractorMailTemplateId')
    }
  })

  test('o que não é uuid continua sendo 400', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ contractorMailTemplateId: 'modelo-1' })),
    ).rejects.toThrow()
  })
})
