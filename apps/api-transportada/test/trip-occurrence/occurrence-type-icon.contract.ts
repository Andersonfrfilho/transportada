/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255 (T2.2, RF2, RF3, CA2): o cadastro do tipo aceita o ícone do catálogo, `null` limpa, ausente
 * é "não mexa" e fora do catálogo é 400; o mapper, o tipo de rua e a resolução de configurações o levam.
 */
import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_TYPE_ICON_NAMES } from '../../src/shared/trip-occurrence.constant.js'
import { resolveFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import {
  readSettingsResolution,
  type SettingsResolutionPort,
} from '../../src/trips/application/read-settings-resolution.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import { saveOccurrenceTypeWithTemplate } from '../../src/trips/application/save-occurrence-type.use-case.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const INVALID_REQUEST_CODE = 'INVALID_REQUEST'

const TYPE_BODY = {
  emailTemplateKey: null,
  flow: 'document',
  name: 'Devolução parcial',
  occurrenceTypeId: TYPE_ID,
  stage: 'delivery',
}

function jsonRequest(body: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/x', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

function buildRecord(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: TYPE_ID,
    name: 'Qualquer nome',
    notifies: false,
    stage: 'delivery',
    ...overrides,
  }
}

describe('o PUT do catálogo valida o ícone do tipo (spec 255 RF2, CA2)', () => {
  test.each([...OCCURRENCE_TYPE_ICON_NAMES])('aceita %s do catálogo', async (iconName) => {
    const body = await parseOccurrenceTypeRequest(jsonRequest({ ...TYPE_BODY, iconName }))

    expect(body.iconName).toBe(iconName)
    expect(toSaveOccurrenceTypeValues(body).iconName).toBe(iconName)
  })

  test('null limpa e chega nulo ao caso de uso', async () => {
    const body = await parseOccurrenceTypeRequest(jsonRequest({ ...TYPE_BODY, iconName: null }))

    expect(body.iconName).toBeNull()
    expect(toSaveOccurrenceTypeValues(body).iconName).toBeNull()
  })

  test('ausente fica ausente — "não mexa", sem padrão escondido', async () => {
    const body = await parseOccurrenceTypeRequest(jsonRequest(TYPE_BODY))

    expect(body.iconName).toBeUndefined()
    expect(toSaveOccurrenceTypeValues(body).iconName).toBeUndefined()
  })

  test.each(['rocket', '', 'MONEY', 7])(
    'fora do catálogo (%p) é 400 com código estável',
    async (iconName) => {
      const error: unknown = await parseOccurrenceTypeRequest(
        jsonRequest({ ...TYPE_BODY, iconName }),
      ).then(
        () => undefined,
        (reason: unknown) => reason,
      )

      expect(error).toMatchObject({ code: INVALID_REQUEST_CODE, status: 400 })
      expect(JSON.stringify(error)).toContain('iconName')
    },
  )

  test('o caso de uso entrega o ícone, e o nulo, a quem grava', async () => {
    for (const iconName of ['money', null] as const) {
      const saved = await saveOccurrenceTypeWithTemplate({
        companyId: COMPANY,
        findCurrentType: async () => null,
        save: async (values) => buildRecord({ iconName: values.iconName ?? null }),
        templates: { hasActiveEmailTemplate: async () => true },
        values: {
          active: true,
          emailTemplateKey: null,
          iconName,
          name: 'x',
          notifies: false,
          occurrenceTypeId: null,
          stage: 'delivery',
        },
      })

      expect(saved.iconName).toBe(iconName)
    }
  })
})

describe('as leituras do tipo trazem o ícone (spec 255 RF3)', () => {
  test('o tipo de rua leva o ícone gravado, e nulo quando não há', () => {
    const [withIcon, withoutIcon] = resolveFieldOccurrenceTypes({
      types: [
        buildRecord({ iconName: 'truck' }),
        buildRecord({ id: '00000000-0000-4000-8000-0000000000e2' }),
      ],
    })

    expect(withIcon?.iconName).toBe('truck')
    expect(withoutIcon?.iconName).toBeNull()
  })

  test('a exceção do contratante não toca o ícone: vem direto do tipo', () => {
    const [resolved] = resolveFieldOccurrenceTypes({
      contractorId: 'c1',
      overrides: {
        contractorOverrides: [
          {
            attachmentMode: 'required',
            contractorId: 'c1',
            declaredAmountMode: 'required',
            occurrenceTypeId: TYPE_ID,
          },
        ],
        recipientOverrides: [],
      },
      types: [buildRecord({ iconName: 'alert' })],
    })

    expect(resolved?.iconName).toBe('alert')
  })

  test('a resolução de configurações devolve o ícone de cada tipo', async () => {
    const port: SettingsResolutionPort = {
      deliveryProof: {
        listContractorOverrides: async () => [],
        listOverrides: async () => [],
        readSettings: async () => ({
          canhotoOcrEnabled: false,
          cargo: 'off',
          cargoMinimumCount: 1,
          latePenaltyPoints: 5,
          missingAfterHours: 24,
          missingPenaltyPoints: 10,
          photo: 'optional',
          proofRadiusMeters: 300,
          proofWindowMinutes: 60,
          receivedBy: 'optional',
          receiverDocument: 'off',
          receiverName: 'optional',
          signature: 'optional',
        }),
      },
      occurrenceTypeOverrides: {
        listOverridesForTypes: async () => ({ contractorOverrides: [], recipientOverrides: [] }),
      },
      occurrenceTypes: {
        listOccurrenceTypes: async () => [
          buildRecord({ iconName: 'invoice' }),
          buildRecord({ id: '00000000-0000-4000-8000-0000000000e2' }),
        ],
      },
    }

    const result = await readSettingsResolution({
      companyId: COMPANY,
      contractorId: null,
      port,
      recipientTaxId: '12345678000190',
    })

    expect(result.occurrenceTypes.map((type) => type.iconName)).toEqual(['invoice', null])
  })
})
