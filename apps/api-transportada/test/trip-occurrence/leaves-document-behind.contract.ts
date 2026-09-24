/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T2.1 (RF6/CA06, ADR-0074 §4): só tipo de separação pode "deixar a nota para trás" — o
 * cadastro de um tipo de entrega com `leavesDocumentBehind: true` é recusado no caso de uso, antes
 * de tocar o banco (a CHECK é a rede, não a primeira defesa). No molde de
 * `template-key.contract.ts` (spec 079 revisão).
 */
import { describe, expect, test } from 'bun:test'

import { saveOccurrenceTypeWithTemplate } from '../../src/trips/application/save-occurrence-type.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { OccurrenceTypeLeavesDocumentBehindRequiresSeparationError } from '../../src/trips/domain/trip.error.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const TIPO = '00000000-0000-4000-8000-0000000000e1'

const BASE_VALUES = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'off' as const,
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null as null | string,
  name: 'Item faltante',
  notifies: false,
  occurrenceTypeId: null,
  stage: 'separation' as const,
}

function buildType(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TIPO,
    name: 'Item faltante',
    notifies: false,
    stage: 'separation',
    ...overrides,
  }
}

describe('só separação pode "segue sem a nota" (spec 185 RF6)', () => {
  test('tipo de entrega com leavesDocumentBehind: true é recusado com código estável', async () => {
    expect(
      saveOccurrenceTypeWithTemplate({
        companyId: COMPANY,
        save: async () => buildType({ stage: 'delivery' }),
        templates: { hasActiveEmailTemplate: async () => true },
        values: { ...BASE_VALUES, leavesDocumentBehind: true, stage: 'delivery' },
      }),
    ).rejects.toBeInstanceOf(OccurrenceTypeLeavesDocumentBehindRequiresSeparationError)

    const error = new OccurrenceTypeLeavesDocumentBehindRequiresSeparationError()
    expect(error.code).toBe('OCCURRENCE_TYPE_LEAVES_BEHIND_REQUIRES_SEPARATION')
    expect(error.status).toBe(422)
  })

  test('tipo de separação com leavesDocumentBehind: true grava normalmente', async () => {
    let savedValues: Record<string, unknown> = {}
    const saved = await saveOccurrenceTypeWithTemplate({
      companyId: COMPANY,
      save: async (values) => {
        savedValues = values
        return buildType({ leavesDocumentBehind: true })
      },
      templates: { hasActiveEmailTemplate: async () => true },
      values: { ...BASE_VALUES, leavesDocumentBehind: true },
    })

    expect(savedValues.leavesDocumentBehind).toBe(true)
    expect(saved.leavesDocumentBehind).toBe(true)
  })

  test('tipo de entrega sem o campo não é recusado', async () => {
    const saved = await saveOccurrenceTypeWithTemplate({
      companyId: COMPANY,
      save: async () => buildType({ stage: 'delivery' }),
      templates: { hasActiveEmailTemplate: async () => true },
      values: { ...BASE_VALUES, stage: 'delivery' },
    })

    expect(saved.stage).toBe('delivery')
  })
})
