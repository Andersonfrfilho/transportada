/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b (T3.4a, achado 6): o nome de um tipo de ocorrência é único por empresa em QUALQUER etapa, e o
 * `PUT /company-settings/occurrence-types` responde 409 `OCCURRENCE_TYPE_NAME_TAKEN` (antes era o erro cru do
 * Postgres, 500). O cadastro tem de dizer o motivo — nomeando o nome, nos dois idiomas — e não o genérico
 * "o servidor recusou": o conflito vem de um tipo de recebimento que a lista nem mostra.
 */
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { i18n } from '@/modules/shared/i18n/i18n.service'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'
import { resolveTripFeedbackKey } from '@/modules/trip/shared/tripFeedback.service'

const SAVE_INPUT = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'off',
  emailTemplateKey: null,
  flow: 'document',
  leavesDocumentBehind: false,
  name: 'Item avariado na chegada',
  notifies: false,
  occurrenceTypeId: null,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
} as const

async function refusedByTheServer(): Promise<unknown> {
  const client = createTripClient({
    apiUrl: 'https://api.example.test',
    fetch: () =>
      Promise.resolve(
        Response.json(
          { error: { code: 'OCCURRENCE_TYPE_NAME_TAKEN', message: 'The name is taken' } },
          { status: 409 },
        ),
      ),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
  return client.saveOccurrenceType(SAVE_INPUT).catch((error: unknown) => error)
}

describe('o cadastro de tipos diz que o nome já está em uso', () => {
  test('o 409 vira a chave própria, não o genérico `serverRefused`', async () => {
    expect(resolveTripFeedbackKey(await refusedByTheServer())).toBe('occurrenceTypeNameTaken')
  })

  test('o texto existe em pt-BR e em en e nomeia o problema (o nome, em qualquer etapa)', async () => {
    const key = `feedback.${resolveTripFeedbackKey(await refusedByTheServer()) ?? ''}`

    const portuguese = i18n.t(key, { lng: 'pt-BR', ns: 'trip' })
    const english = i18n.t(key, { lng: 'en', ns: 'trip' })

    expect(portuguese).toContain('nome')
    expect(portuguese).not.toContain('feedback.')
    expect(english.toLowerCase()).toContain('name')
    expect(english).not.toContain('feedback.')
  })
})
