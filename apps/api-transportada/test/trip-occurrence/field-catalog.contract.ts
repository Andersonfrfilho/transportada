/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { listFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'

function tipo(overrides: Partial<OccurrenceTypeRecord> = {}): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: '00000000-0000-4000-8000-0000000000e1',
    name: 'Cliente ausente',
    notifies: false,
    stage: 'delivery',
    ...overrides,
  }
}

/**
 * Spec 179 T304: a app do motorista já lê `attachmentMode` quando ele vem — o servidor é quem
 * ainda não mandava. Sem ele, a observação obrigatória só aparece depois do 422
 * `TRIP_OCCURRENCE_NOTE_REQUIRED`, com a ocorrência recusada na fila offline.
 */
describe('o catálogo do motorista informa se o tipo exige comprovante (spec 179 T304)', () => {
  test('repassa attachmentMode quando o tipo cadastrado tem um', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      repository: {
        async listOccurrenceTypes() {
          return [tipo({ attachmentMode: 'required' })]
        },
      },
    })

    expect(types).toEqual([
      {
        attachmentMode: 'required',
        id: '00000000-0000-4000-8000-0000000000e1',
        name: 'Cliente ausente',
      },
    ])
  })

  /** Dado legado, sem a coluna preenchida (o mesmo caso que `driver.contract.ts` cobre no registro). */
  test('tipo sem attachmentMode cadastrado sai como off', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      repository: {
        async listOccurrenceTypes() {
          return [tipo()]
        },
      },
    })

    expect(types).toEqual([
      {
        attachmentMode: 'off',
        id: '00000000-0000-4000-8000-0000000000e1',
        name: 'Cliente ausente',
      },
    ])
  })
})
