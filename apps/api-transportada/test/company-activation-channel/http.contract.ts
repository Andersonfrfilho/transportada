/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createCompanySettingsHttpFixture,
  getSettingsRequest,
  patchSettingsRequest,
} from '../fixtures/company-settings-http.fixture'
import {
  EXPECTED_HTTP_SETTINGS_DATA,
  VALID_HTTP_SETTINGS_BODY,
} from '../fixtures/company-settings-http-payload.fixture'

/**
 * O canal de ativação é da empresa, não do usuário: quem convida não escolhe por onde o código sai.
 * O bloco é opcional no corpo porque cliente antigo não o envia — ausente significa `email`, que é
 * o único canal com driver hoje.
 */
describe('canal de ativação em PATCH /company-settings', () => {
  test('o canal escolhido chega ao caso de uso', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(
      patchSettingsRequest({
        body: { ...VALID_HTTP_SETTINGS_BODY, activation: { channel: 'whatsapp' } },
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.activation).toEqual({ channel: 'whatsapp' })
  })

  test('corpo sem o bloco assume e-mail em vez de recusar o cliente antigo', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(patchSettingsRequest())

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.activation).toEqual({ channel: 'email' })
  })

  test('canal desconhecido é recusado na fronteira', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(
      patchSettingsRequest({
        body: { ...VALID_HTTP_SETTINGS_BODY, activation: { channel: 'pombo-correio' } },
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.updateCalls).toEqual([])
  })

  test('a leitura devolve o canal persistido', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(getSettingsRequest())

    expect(await response.json()).toEqual({
      data: { ...EXPECTED_HTTP_SETTINGS_DATA, activation: { channel: 'email' } },
    })
  })

  test('empresa sem configuração devolve o bloco vazio como os demais', async () => {
    const fixture = await createCompanySettingsHttpFixture({ getResult: null })

    const response = await fixture.handle(getSettingsRequest())

    expect(await response.json()).toEqual({
      data: {
        activation: null,
        billing: null,
        cte: null,
        cteRetry: null,
        mdfe: null,
        profile: null,
      },
    })
  })
})
