/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T2.1 (RF6/CA06, ADR-0074 §4): o cadastro do tipo de ocorrência aceita "a viagem segue
 * sem a nota" (`leavesDocumentBehind`), no mesmo molde de `attachmentMode` (spec 179 T101) —
 * ausente é "não mexa", nunca `false`.
 */
import { describe, expect, test } from 'bun:test'

import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

function baseBody(): Record<string, unknown> {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Item faltante',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'separation',
  }
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('o cadastro do tipo aceita "a viagem segue sem a nota" (spec 185 RF6)', () => {
  /**
   * ⚠️ Ausente é **"não mexa"**, não `false` — o UPDATE sobrescreve o registro inteiro e o editor
   * do painel ainda não manda o campo; ver `save-occurrence-type.use-case.ts`.
   */
  test('sem o campo, não decide nada — quem grava preserva o valor atual', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(baseBody()))

    expect(parsed.leavesDocumentBehind).toBeUndefined()
  })

  test('aceita true e false', async () => {
    const withTrue = await parseOccurrenceTypeRequest(
      putRequest({ ...baseBody(), leavesDocumentBehind: true }),
    )
    expect(withTrue.leavesDocumentBehind).toBe(true)

    const withFalse = await parseOccurrenceTypeRequest(
      putRequest({ ...baseBody(), leavesDocumentBehind: false }),
    )
    expect(withFalse.leavesDocumentBehind).toBe(false)
  })

  test('valor fora do vocabulário booleano é recusado', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ ...baseBody(), leavesDocumentBehind: 'sim' })),
    ).rejects.toThrow()
  })
})
