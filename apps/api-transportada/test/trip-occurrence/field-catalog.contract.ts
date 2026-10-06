/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { listFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { buildFieldOccurrenceType } from '../fixtures/field-occurrence-type.fixture.js'

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
      buildFieldOccurrenceType({
        attachmentMode: 'required',
        id: '00000000-0000-4000-8000-0000000000e1',
        name: 'Cliente ausente',
      }),
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
      buildFieldOccurrenceType({
        attachmentMode: 'off',
        id: '00000000-0000-4000-8000-0000000000e1',
        name: 'Cliente ausente',
      }),
    ])
  })
})

/**
 * Spec 218 RF-B2/T9: sem `contractorId`/`recipientTaxId` (ou sem a `overrides` port), a resolução
 * fica em 1 camada — regressão zero, byte a byte igual ao teste acima. Com eles, resolve as 3
 * camadas usando `listOverridesForTypes`, uma consulta em lote, nunca uma por tipo.
 */
describe('a resolução de 3 camadas do attachmentMode (spec 218 RF-B2, T9)', () => {
  test('sem contractorId/recipientTaxId: nenhuma mudança visível (regressão zero)', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      overrides: {
        async listOverridesForTypes() {
          throw new Error('NÃO DEVERIA CONSULTAR SEM CONTEXTO')
        },
      },
      repository: {
        async listOccurrenceTypes() {
          return [tipo({ attachmentMode: 'optional' })]
        },
      },
    })

    expect(types).toEqual([
      buildFieldOccurrenceType({
        attachmentMode: 'optional',
        id: '00000000-0000-4000-8000-0000000000e1',
        name: 'Cliente ausente',
      }),
    ])
  })

  test('com contractorId: o override do contratante vence o attachmentMode do tipo', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      contractorId: 'contractor-alfa',
      overrides: {
        async listOverridesForTypes() {
          return {
            contractorOverrides: [
              {
                attachmentMode: 'required',
                contractorId: 'contractor-alfa',
                occurrenceTypeId: '00000000-0000-4000-8000-0000000000e1',
              },
            ],
            recipientOverrides: [],
          }
        },
      },
      repository: {
        async listOccurrenceTypes() {
          return [tipo({ attachmentMode: 'optional' })]
        },
      },
    })

    expect(types[0]?.attachmentMode).toBe('required')
  })

  test('destinatário vence contratante quando os dois têm exceção (P4)', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      contractorId: 'contractor-alfa',
      overrides: {
        async listOverridesForTypes() {
          return {
            contractorOverrides: [
              {
                attachmentMode: 'off',
                contractorId: 'contractor-alfa',
                occurrenceTypeId: '00000000-0000-4000-8000-0000000000e1',
              },
            ],
            recipientOverrides: [
              {
                attachmentMode: 'required',
                occurrenceTypeId: '00000000-0000-4000-8000-0000000000e1',
                taxId: 'mercado-central',
              },
            ],
          }
        },
      },
      recipientTaxId: 'mercado-central',
      repository: {
        async listOccurrenceTypes() {
          return [tipo({ attachmentMode: 'optional' })]
        },
      },
    })

    expect(types[0]?.attachmentMode).toBe('required')
  })
})
