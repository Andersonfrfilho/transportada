/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.3 (RF1b): `allowsMultipleItems` é do cadastro do tipo — o `PUT` o grava quando vem, e
 * ausente é "não mexa". Um `default(true)` na fronteira religaria "vários produtos" num tipo de
 * produto único a cada edição que não toca o campo (a lição da 242).
 */
import { describe, expect, test } from 'bun:test'

import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'

function putRequest(extra: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify({
      emailTemplateKey: null,
      flow: 'document',
      name: 'Item avariado',
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      stage: 'delivery',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('o cadastro do tipo grava "allowsMultipleItems" só quando ele vem (spec 246 T1c.3)', () => {
  test.each([true, false])('%s presente chega ao resultado', async (isAllowed) => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({ allowsMultipleItems: isAllowed }))

    expect(parsed.allowsMultipleItems).toBe(isAllowed)
  })

  test('ausente fica ausente — nunca vira `true`', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({}))

    expect('allowsMultipleItems' in parsed).toBe(false)
  })

  test('forma errada é 400', async () => {
    const error: unknown = await parseOccurrenceTypeRequest(
      putRequest({ allowsMultipleItems: 'yes' }),
    ).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect((error as { status?: number }).status).toBe(400)
  })
})
