/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T101 (RF1, CA01/CA07/CA08): o cadastro do tipo de ocorrência aceita a exigência de
 * comprovante (`attachmentMode`, o mesmo vocabulário de `DELIVERY_PROOF_FIELD_MODES`). Omitido,
 * vira `'off'` — nenhuma instalação muda de comportamento ao aplicar esta migration.
 */
import { describe, expect, test } from 'bun:test'

import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

function baseBody(): string {
  return JSON.stringify({
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('o cadastro do tipo aceita a exigência de comprovante (spec 179 RF1)', () => {
  test('sem o campo, o padrão é off', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(JSON.parse(baseBody())))

    expect(parsed.attachmentMode).toBe('off')
  })

  test('aceita optional e required', async () => {
    const optional = await parseOccurrenceTypeRequest(
      putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'optional' }),
    )
    expect(optional.attachmentMode).toBe('optional')

    const required = await parseOccurrenceTypeRequest(
      putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'required' }),
    )
    expect(required.attachmentMode).toBe('required')
  })

  test('valor fora do vocabulário é recusado', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'sim' })),
    ).rejects.toThrow()
  })
})
