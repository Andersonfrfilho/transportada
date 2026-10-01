/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 (D1, RF-B5): o cadastro do tipo ganha `flow` (`document | stop`), obrigatório na
 * criação — um tipo novo sem `flow` não sabe em qual botão do motorista aparecer. Na edição,
 * ausente é "não mexa", no mesmo molde de `leaves-document-behind-schema.contract.ts`.
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

describe('o cadastro do tipo aceita "flow" (spec 218 D1/RF-B5)', () => {
  test('criação sem flow é recusada (FLOW_REQUIRED_ON_CREATE)', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ ...baseBody(), occurrenceTypeId: null })),
    ).rejects.toThrow()
  })

  test('criação com flow: document é aceita', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ ...baseBody(), flow: 'document', occurrenceTypeId: null }),
    )
    expect(parsed.flow).toBe('document')
  })

  test('criação com flow: stop é aceita', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ ...baseBody(), flow: 'stop', occurrenceTypeId: null }),
    )
    expect(parsed.flow).toBe('stop')
  })

  /** Ausente na edição é "não mexa" — o UPDATE preserva o valor gravado. */
  test('edição sem flow não decide nada', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ ...baseBody(), occurrenceTypeId: '00000000-0000-4000-8000-0000000000e1' }),
    )
    expect(parsed.flow).toBeUndefined()
  })

  test('valor fora do vocabulário é recusado', async () => {
    await expect(
      parseOccurrenceTypeRequest(
        putRequest({ ...baseBody(), flow: 'both', occurrenceTypeId: null }),
      ),
    ).rejects.toThrow()
  })
})
