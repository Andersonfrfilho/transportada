/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  callbackRequest,
  CALLBACK_PATH_PREFIX,
  CALLBACK_TOKEN,
  COMPANY_ID,
  createNfseCallbacksHttpFixture,
  OTHER_CALLBACK_TOKEN,
  OTHER_COMPANY_ID,
  UNKNOWN_CALLBACK_TOKEN,
} from '../fixtures/nfse-callbacks-http.fixture'
import { API_PUBLIC_NFSE_CALLBACKS_PATH } from '../../src/shared/api.constant'
import { resolveLogPathname } from '../../src/http/request-path.service'

const SENSITIVE_BODIES = [
  { body: '', label: 'corpo vazio' },
  { body: 'not-json-at-all', label: 'corpo malformado' },
  { body: { situacao: 'AUTORIZADA', numeroNota: '42' }, label: 'corpo pedindo autorização' },
  { body: 'x'.repeat(200_000), label: 'corpo grande' },
] as const

const HOSTILE_TOKENS = [
  { label: 'token desconhecido', token: UNKNOWN_CALLBACK_TOKEN },
  { label: 'token vazio como segmento', token: '%20' },
  { label: 'token com barra codificada', token: '%2F' },
  { label: 'token com percent inválido', token: '%E0%A4%A' },
  { label: 'token gigante', token: 'z'.repeat(2_000) },
  { label: 'token que parece hash', token: 'a'.repeat(64) },
] as const

describe('nfse callback public route contract', () => {
  test('o caminho declarado é público e leva o token como parâmetro', () => {
    expect(API_PUBLIC_NFSE_CALLBACKS_PATH).toBe(`${CALLBACK_PATH_PREFIX}/:token`)
  })

  test('antecipa a consulta da empresa dona do token e responde 204 sem corpo', async () => {
    const fixture = await createNfseCallbacksHttpFixture()

    const response = await fixture.handle(callbackRequest())

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('content-type')).toBeNull()
    expect(fixture.anticipateCalls).toEqual([{ companyId: COMPANY_ID }])
  })

  test('o token decide a empresa — a rota nunca resolve tenant pelo contexto', async () => {
    const fixture = await createNfseCallbacksHttpFixture()

    await fixture.handle(callbackRequest({ token: OTHER_CALLBACK_TOKEN }))

    expect(fixture.anticipateCalls).toEqual([{ companyId: OTHER_COMPANY_ID }])
    expect(fixture.events).not.toContain('tenant')
    expect(fixture.events).not.toContain('authenticate')
    expect(fixture.events).not.toContain('authorize')
  })

  for (const hostile of HOSTILE_TOKENS) {
    test(`responde 204 e não toca em nota nenhuma com ${hostile.label}`, async () => {
      const fixture = await createNfseCallbacksHttpFixture()

      const response = await fixture.handle(callbackRequest({ token: hostile.token }))

      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
      expect(fixture.anticipateCalls).toEqual([])
      expect(fixture.events).not.toContain('authenticate')
    })
  }

  // Acima de 2 KiB o caminho é recusado na fronteira de transporte, antes de existir rota: o 400 é o
  // mesmo para qualquer caminho da API e não conta se o token existe. Nada de negócio acontece.
  test('caminho acima do teto morre na fronteira, sem tocar em nota nenhuma', async () => {
    const fixture = await createNfseCallbacksHttpFixture()

    const response = await fixture.handle(callbackRequest({ token: 'z'.repeat(4_096) }))

    expect(response.status).toBe(400)
    expect(fixture.anticipateCalls).toEqual([])
    expect(fixture.events).toEqual([])
  })

  for (const scenario of SENSITIVE_BODIES) {
    test(`responde 204 sem ler o corpo com ${scenario.label}`, async () => {
      const fixture = await createNfseCallbacksHttpFixture()
      const request = callbackRequest({ body: scenario.body })

      const response = await fixture.handle(request)

      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
      expect(request.bodyUsed).toBe(false)
      expect(fixture.anticipateCalls).toEqual([{ companyId: COMPANY_ID }])
    })
  }

  test('falha de banco não vira 500 nem revela nada: a resposta continua 204', async () => {
    const listFailure = await createNfseCallbacksHttpFixture({
      listError: new Error('database unavailable'),
    })
    const anticipateFailure = await createNfseCallbacksHttpFixture({
      anticipateError: new Error('database unavailable'),
    })

    const listResponse = await listFailure.handle(callbackRequest())
    const anticipateResponse = await anticipateFailure.handle(callbackRequest())

    expect(listResponse.status).toBe(204)
    expect(anticipateResponse.status).toBe(204)
    expect(await listResponse.text()).toBe('')
    expect(await anticipateResponse.text()).toBe('')
  })

  test('sem credencial cadastrada a rota segue 204, sem efeito', async () => {
    const fixture = await createNfseCallbacksHttpFixture({ credentials: [] })

    const response = await fixture.handle(callbackRequest())

    expect(response.status).toBe(204)
    expect(fixture.anticipateCalls).toEqual([])
  })

  test('instalação sem endereço de callback publicado não expõe superfície pública nenhuma', async () => {
    const fixture = await createNfseCallbacksHttpFixture({ callbackBaseUrl: undefined })

    const response = await fixture.handle(callbackRequest())

    expect(response.status).toBe(404)
    expect(fixture.anticipateCalls).toEqual([])
  })

  test('método diferente de POST é 404 e não custa autenticação', async () => {
    const fixture = await createNfseCallbacksHttpFixture()

    const response = await fixture.handle(callbackRequest({ method: 'GET' }))

    expect(response.status).toBe(404)
    expect(fixture.events).not.toContain('authenticate')
    expect(fixture.anticipateCalls).toEqual([])
  })

  test('nenhum log carrega o token nem o corpo do postback', async () => {
    const fixture = await createNfseCallbacksHttpFixture()

    await fixture.handle(callbackRequest({ body: { segredo: 'corpo-hostil-do-postback' } }))
    await fixture.handle(callbackRequest({ token: UNKNOWN_CALLBACK_TOKEN }))

    const serializedLogs = JSON.stringify(fixture.logs)
    expect(serializedLogs).not.toContain(CALLBACK_TOKEN)
    expect(serializedLogs).not.toContain(UNKNOWN_CALLBACK_TOKEN)
    expect(serializedLogs).not.toContain('corpo-hostil-do-postback')
    expect(fixture.logs.length).toBeGreaterThan(0)
  })

  test('o caminho do callback nunca entra na allowlist de log — o token viraria log', () => {
    expect(resolveLogPathname(`${CALLBACK_PATH_PREFIX}/${CALLBACK_TOKEN}`)).toBe('<unmatched>')
    expect(resolveLogPathname(API_PUBLIC_NFSE_CALLBACKS_PATH)).toBe('<unmatched>')
  })
})
