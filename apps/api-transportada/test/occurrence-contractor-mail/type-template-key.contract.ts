/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.4 (ADR-0108): o `PUT` do tipo aceita `contractorNotificationTemplateKey` — ausente é "não mexa",
 * `null` limpa — e o caso de uso o confere **antes** de gravar, com todos os problemas de uma vez.
 */
import { describe, expect, test } from 'bun:test'

import { OccurrenceContractorTemplateInvalidError } from '../../src/occurrence-conversation/domain/occurrence-contractor-template.error.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const KEY = 'ocorrencia.avaria'

const BASE_VALUES: SaveOccurrenceTypeValues = {
  active: true,
  emailTemplateKey: null,
  name: 'Avaria',
  notifies: false,
  occurrenceTypeId: null,
  stage: 'delivery',
}

function putRequest(extra: Record<string, unknown>): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify({
      active: true,
      emailTemplateKey: null,
      flow: 'document',
      name: 'Avaria',
      notifies: false,
      occurrenceTypeId: null,
      stage: 'delivery',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

function buildRun(template: { body: string; subject: string } | null) {
  const lookups: string[] = []
  const saved: SaveOccurrenceTypeValues[] = []
  return {
    lookups,
    run: (values: Partial<SaveOccurrenceTypeValues>) =>
      saveOccurrenceTypeWithTemplate({
        companyId: COMPANY,
        findCurrentType: async () => null,
        save: async (toSave) => {
          saved.push(toSave)
          return { ...BASE_VALUES, id: 'type-1' } as unknown as OccurrenceTypeRecord
        },
        templates: {
          findContractorTemplate: async ({ key }) => {
            lookups.push(key)
            return template
          },
          hasActiveEmailTemplate: async () => true,
        },
        values: { ...BASE_VALUES, ...values },
      }),
    saved,
  }
}

describe('a chave do modelo do e-mail à contratante no cadastro do tipo (spec 271)', () => {
  test('sem o campo, não decide nada; aceita texto e null; recusa vazio e acima de 128', async () => {
    expect(
      (await parseOccurrenceTypeRequest(putRequest({}))).contractorNotificationTemplateKey,
    ).toBe(undefined)
    expect(
      (await parseOccurrenceTypeRequest(putRequest({ contractorNotificationTemplateKey: KEY })))
        .contractorNotificationTemplateKey,
    ).toBe(KEY)
    expect(
      (await parseOccurrenceTypeRequest(putRequest({ contractorNotificationTemplateKey: null })))
        .contractorNotificationTemplateKey,
    ).toBeNull()
    for (const invalid of ['', '   ', 'a'.repeat(129), 7]) {
      await expect(
        parseOccurrenceTypeRequest(putRequest({ contractorNotificationTemplateKey: invalid })),
      ).rejects.toThrow()
    }
  })

  test('o mapeador repassa o campo ao caso de uso', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ contractorNotificationTemplateKey: KEY }),
    )

    expect(toSaveOccurrenceTypeValues(parsed).contractorNotificationTemplateKey).toBe(KEY)
  })

  test('modelo utilizável: confere a chave uma vez e grava', async () => {
    const { lookups, run, saved } = buildRun({ body: 'Nota {{numeroNota}}', subject: 'Assunto' })

    await run({ contractorNotificationTemplateKey: KEY })

    expect(lookups).toEqual([KEY])
    expect(saved[0]?.contractorNotificationTemplateKey).toBe(KEY)
  })

  test('null limpa e ausente não mexe: nenhuma consulta ao módulo', async () => {
    const { lookups, run, saved } = buildRun(null)

    await run({ contractorNotificationTemplateKey: null })
    await run({})

    expect(lookups).toEqual([])
    expect(saved[0]?.contractorNotificationTemplateKey).toBeNull()
    expect(saved[1]?.contractorNotificationTemplateKey).toBeUndefined()
  })

  test('modelo inexistente: 400 not_found e nada é gravado', async () => {
    const { run, saved } = buildRun(null)

    const error = await run({ contractorNotificationTemplateKey: KEY }).catch((cause) => cause)

    expect(error).toBeInstanceOf(OccurrenceContractorTemplateInvalidError)
    expect(error.status).toBe(400)
    expect(error.code).toBe('OCCURRENCE_CONTRACTOR_TEMPLATE_INVALID')
    expect(error.details).toEqual([
      { field: 'contractorNotificationTemplateKey', message: 'not_found' },
    ])
    expect(saved).toEqual([])
  })

  test('todos os problemas de uma vez, com as variáveis desconhecidas', async () => {
    const { run } = buildRun({ body: '<script>{{foo}}</script>', subject: '' })

    const error = await run({ contractorNotificationTemplateKey: KEY }).catch((cause) => cause)

    expect(error.details).toEqual([
      { field: 'contractorNotificationTemplateKey', message: 'unsafe_html' },
      { field: 'contractorNotificationTemplateKey', message: 'missing_message_area' },
      { field: 'contractorNotificationTemplateKey', message: 'empty_subject' },
      { field: 'contractorNotificationTemplateKey', message: 'unknown_variables' },
      { field: 'variables', message: 'foo' },
    ])
  })
})
