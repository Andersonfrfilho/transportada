/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T101 (RF1/RF9, CA01/CA07/CA08): o cadastro do tipo de ocorrência aceita a exigência de
 * comprovante (`attachmentMode`, o mesmo vocabulário de `DELIVERY_PROOF_FIELD_MODES`) e a marca de
 * devolução ao barracão (`returnsToDepot`). Omitidos, os dois viram `'off'` e `false` — nenhuma
 * instalação muda de comportamento ao aplicar esta migration.
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

describe('o cadastro do tipo aceita a exigência de comprovante e a devolução ao barracão (spec 179 RF1/RF9)', () => {
  test('sem os campos, os padrões são off e false', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(JSON.parse(baseBody())))

    expect(parsed.attachmentMode).toBe('off')
    expect(parsed.returnsToDepot).toBe(false)
  })

  test('aceita optional e required, e preserva returnsToDepot true', async () => {
    const optional = await parseOccurrenceTypeRequest(
      putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'optional' }),
    )
    expect(optional.attachmentMode).toBe('optional')

    const required = await parseOccurrenceTypeRequest(
      putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'required', returnsToDepot: true }),
    )
    expect(required.attachmentMode).toBe('required')
    expect(required.returnsToDepot).toBe(true)
  })

  test('valor fora do vocabulário é recusado', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'sim' })),
    ).rejects.toThrow()
  })
})
