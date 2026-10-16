/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.4 (ADR-0106): o `PUT` do tipo aceita `contractorMailTemplateId` — ausente é "não mexa", `null`
 * limpa — e o mapeador o repassa ao caso de uso (campo aceito e não repassado é gravação perdida).
 */
import { describe, expect, test } from 'bun:test'

import { ContractorMailTemplateNotUsableError } from '../../src/contractor-mail/domain/contractor-mail-template.error.js'
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

describe('o cadastro do tipo escolhe o modelo de e-mail (spec 269)', () => {
  test('sem o campo, não decide nada', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({}))

    expect(parsed.contractorMailTemplateId).toBeUndefined()
  })

  test('aceita um uuid e null', async () => {
    const chosen = await parseOccurrenceTypeRequest(
      putRequest({ contractorMailTemplateId: TEMPLATE_ID }),
    )
    const cleared = await parseOccurrenceTypeRequest(putRequest({ contractorMailTemplateId: null }))

    expect(chosen.contractorMailTemplateId).toBe(TEMPLATE_ID)
    expect(cleared.contractorMailTemplateId).toBeNull()
  })

  test('recusa o que não é uuid', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ contractorMailTemplateId: 'modelo-1' })),
    ).rejects.toThrow()
  })

  test('o mapeador repassa o campo ao caso de uso', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ contractorMailTemplateId: TEMPLATE_ID }),
    )

    expect(toSaveOccurrenceTypeValues(parsed).contractorMailTemplateId).toBe(TEMPLATE_ID)
  })
})

describe('o erro de modelo inutilizável (spec 269)', () => {
  test('é 409 com o campo da escolha, sem revelar o motivo', () => {
    const error = new ContractorMailTemplateNotUsableError('contractorMailTemplateId')

    expect(error.status).toBe(409)
    expect(error.code).toBe('CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE')
    expect(error.details?.map((detail) => detail.field)).toEqual(['contractorMailTemplateId'])
  })
})
