/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF21 (link do aviso, decisão de 26/09/2026): o aviso por e-mail às contas do portal leva
 * o link direto para "Ocorrências" quando a instalação declara `CLIENT_PORTAL_URL`. Sem ela, o texto
 * diz onde ler, como antes — nunca um link vazio.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { describePortalAccess } from '../../src/occurrence-conversation/infrastructure/contractor-portal-notifier.gateway.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const PORTAL = 'https://cliente.transportadora.exemplo.com.br'

describe('a URL do portal no ambiente (spec 183 RF21)', () => {
  test('lê a URL declarada', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, CLIENT_PORTAL_URL: PORTAL }).clientPortalUrl,
    ).toBe(PORTAL)
  })

  for (const value of [undefined, '', '   ']) {
    test(`fica indefinida com ${JSON.stringify(value)}`, () => {
      expect(
        parseEnvironment({ ...API_ENVIRONMENT, CLIENT_PORTAL_URL: value }).clientPortalUrl,
      ).toBeUndefined()
    })
  }

  for (const hostile of [
    'http://cliente.exemplo.com.br',
    'https://u:s@cliente.exemplo.com.br',
    'x',
  ]) {
    test(`derruba o boot com endereço não confiável ${hostile}`, () => {
      expect(() => parseEnvironment({ ...API_ENVIRONMENT, CLIENT_PORTAL_URL: hostile })).toThrow()
    })
  }

  test('o .env.example declara o portal local', async () => {
    const example = await Bun.file(new URL('../../../../.env.example', import.meta.url)).text()
    expect(example).toContain('\nCLIENT_PORTAL_URL=http://localhost:53100\n')
  })
})

describe('o texto de acesso no aviso (spec 183 RF21)', () => {
  test('com a URL, o link abre direto a aba Ocorrências', () => {
    expect(describePortalAccess(`${PORTAL}/`)).toBe(
      `Acesse ${PORTAL}/?aba=ocorrencias para ler e responder.`,
    )
  })

  test('sem a URL, diz onde ler, sem link', () => {
    expect(describePortalAccess(undefined)).toBe(
      'Entre no portal de acompanhamento, em Ocorrências, para ler e responder.',
    )
  })
})
