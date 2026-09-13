/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  API_KEY,
  CHECKS_RESULT,
  READ_ONLY_CONTEXT,
  SETTINGS_SUMMARY,
  WEBHOOK_SIGNING_SECRET,
  createContractorMailHttpFixture,
  getRequest,
  jsonRequest,
} from '../fixtures/contractor-mail-http.fixture'
import { ContractorMailSettingsVersionConflictError } from '../../src/contractor-mail/domain/contractor-mail.error'

const SETTINGS_BODY = {
  apiKey: API_KEY,
  replyDomain: 'resposta.fernandes-transportadora.com.br',
  senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
  senderName: 'Fernandes Transportadora',
  webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
} as const

describe('contractor mail settings routes contract (spec 143, T008)', () => {
  test('reads the settings without ever exposing a secret', async () => {
    const fixture = await createContractorMailHttpFixture()

    const response = await fixture.handle(getRequest('/contractor-mail-settings'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as { readonly data: Record<string, unknown> }
    expect(body).toEqual({ data: SETTINGS_SUMMARY })
    expect(Object.keys(body.data).sort()).toEqual([
      'apiKeyConfigured',
      'id',
      'lastWebhookAt',
      'replyDomain',
      'senderAddress',
      'senderName',
      'status',
      'version',
      'webhookId',
      'webhookSecretConfigured',
    ])
  })

  /** plan.md/spec 143: sem configuração ainda, a página mostra `null` — não 404 — como a Nota RP. */
  test('reports an unconfigured company as null instead of 404', async () => {
    const fixture = await createContractorMailHttpFixture({ settings: null })

    const response = await fixture.handle(getRequest('/contractor-mail-settings'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })
  })

  test('never returns the api key, the webhook secret or the sealed envelope on any route', async () => {
    const fixture = await createContractorMailHttpFixture()

    const responses = [
      await fixture.handle(getRequest('/contractor-mail-settings')),
      await fixture.handle(
        jsonRequest({ body: SETTINGS_BODY, method: 'PUT', path: '/contractor-mail-settings' }),
      ),
      await fixture.handle(getRequest('/contractor-mail-settings/checks')),
    ]

    for (const response of responses) {
      const text = await response.text()
      expect(text).not.toContain(API_KEY)
      expect(text).not.toContain(WEBHOOK_SIGNING_SECRET)
      expect(text.toLowerCase()).not.toContain('secretenvelope')
      expect(text.toLowerCase()).not.toContain('ciphertext')
    }
  })

  test('cache-control is no-store on every route', async () => {
    const fixture = await createContractorMailHttpFixture()

    const responses = [
      await fixture.handle(getRequest('/contractor-mail-settings')),
      await fixture.handle(
        jsonRequest({ body: SETTINGS_BODY, method: 'PUT', path: '/contractor-mail-settings' }),
      ),
      await fixture.handle(getRequest('/contractor-mail-settings/checks')),
    ]

    for (const response of responses) {
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('saves the settings passing both secrets to the use case', async () => {
    const fixture = await createContractorMailHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: SETTINGS_BODY, method: 'PUT', path: '/contractor-mail-settings' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: SETTINGS_SUMMARY })
    expect(fixture.saveCalls[0]).toMatchObject({
      apiKey: API_KEY,
      replyDomain: 'resposta.fernandes-transportadora.com.br',
      senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
      senderName: 'Fernandes Transportadora',
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
  })

  /** Omitir os dois segredos preserva o que já está selado (T006 abre e sela de novo). */
  test('saves the settings without secrets, letting the use case keep what is already sealed', async () => {
    const fixture = await createContractorMailHttpFixture()
    const bodyWithoutSecrets = {
      replyDomain: SETTINGS_BODY.replyDomain,
      senderAddress: SETTINGS_BODY.senderAddress,
      senderName: SETTINGS_BODY.senderName,
    }

    const response = await fixture.handle(
      jsonRequest({ body: bodyWithoutSecrets, method: 'PUT', path: '/contractor-mail-settings' }),
    )

    expect(response.status).toBe(200)
    expect(fixture.saveCalls[0]).toMatchObject({
      apiKey: undefined,
      webhookSigningSecret: undefined,
    })
  })

  /**
   * Revisão do `architect`: o `PUT` repassa `expectedVersion` até o caso de uso — é ele quem decide
   * se é criação (ausente) ou atualização otimista (presente), nunca a rota.
   */
  test('passes expectedVersion through to the use case, and omits it when absent', async () => {
    const fixture = await createContractorMailHttpFixture()

    await fixture.handle(
      jsonRequest({
        body: { ...SETTINGS_BODY, expectedVersion: '3' },
        method: 'PUT',
        path: '/contractor-mail-settings',
      }),
    )
    await fixture.handle(
      jsonRequest({ body: SETTINGS_BODY, method: 'PUT', path: '/contractor-mail-settings' }),
    )

    expect(fixture.saveCalls[0]).toMatchObject({ expectedVersion: '3' })
    expect(fixture.saveCalls[1]).toMatchObject({ expectedVersion: undefined })
  })

  /** Uma corrida perdida (spec 143, revisão da T008) responde 409, nunca 500 nem 200 silencioso. */
  test('maps a lost version race to 409', async () => {
    const fixture = await createContractorMailHttpFixture({
      saveError: new ContractorMailSettingsVersionConflictError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: SETTINGS_BODY, method: 'PUT', path: '/contractor-mail-settings' }),
    )

    expect(response.status).toBe(409)
  })

  test('rejects a reply domain with fewer than three labels', async () => {
    const fixture = await createContractorMailHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...SETTINGS_BODY, replyDomain: 'example.com' },
        method: 'PUT',
        path: '/contractor-mail-settings',
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.saveCalls).toHaveLength(0)
  })

  test('rejects an unknown field or a missing sender address', async () => {
    const fixture = await createContractorMailHttpFixture()

    const unknownField = await fixture.handle(
      jsonRequest({
        body: { ...SETTINGS_BODY, webhookId: 'chosen-by-the-client' },
        method: 'PUT',
        path: '/contractor-mail-settings',
      }),
    )
    const missingSenderAddress = await fixture.handle(
      jsonRequest({
        body: {
          replyDomain: SETTINGS_BODY.replyDomain,
          senderName: SETTINGS_BODY.senderName,
        },
        method: 'PUT',
        path: '/contractor-mail-settings',
      }),
    )

    expect([unknownField.status, missingSenderAddress.status]).toEqual([400, 400])
    expect(fixture.saveCalls).toHaveLength(0)
  })

  test('reads the checklist with every item of RF12', async () => {
    const fixture = await createContractorMailHttpFixture()

    const response = await fixture.handle(getRequest('/contractor-mail-settings/checks'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: CHECKS_RESULT })
    const keys = CHECKS_RESULT.map((item) => item.key)
    expect(keys).toEqual([
      'api_key',
      'sender_domain',
      'reply_mx',
      'webhook_received',
      'test_sent',
      'test_replied',
      'test_dkim',
    ])
  })

  test('denies all three routes without settings.manage', async () => {
    const fixture = await createContractorMailHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const read = await fixture.handle(getRequest('/contractor-mail-settings'))
    const save = await fixture.handle(
      jsonRequest({ body: SETTINGS_BODY, method: 'PUT', path: '/contractor-mail-settings' }),
    )
    const checks = await fixture.handle(getRequest('/contractor-mail-settings/checks'))

    expect([read.status, save.status, checks.status]).toEqual([403, 403, 403])
    expect(fixture.readCalls).toHaveLength(0)
    expect(fixture.saveCalls).toHaveLength(0)
    expect(fixture.runChecksCalls).toHaveLength(0)
  })
})
