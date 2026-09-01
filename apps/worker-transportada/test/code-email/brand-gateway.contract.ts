/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A marca do e-mail vem das rotas públicas que o painel já edita. Falha e ausência dão no mesmo: o
 * template cai na marca do produto, porque o código de acesso não espera cadastro para sair.
 */
import { describe, expect, test } from 'bun:test'

import { createLandingEmailBrandGateway } from '../../src/identity/infrastructure/landing-email-brand.gateway.js'

const SETTINGS = {
  data: {
    accentColor: '#1a2b3c',
    brandName: '  Transportes Exemplo  ',
    contactEmail: 'contato@exemplo.com.br',
    contactPhone: '(16) 3333-4444',
    units: [{ tradeName: 'Exemplo Matriz' }],
  },
}

function jsonFetch(payload: unknown, input: { readonly ok?: boolean } = {}) {
  const calls: string[] = []
  const fetchImplementation = (async (url: string | URL | Request) => {
    calls.push(String(url))
    return new Response(JSON.stringify(payload), { status: input.ok === false ? 500 : 200 })
  }) as unknown as typeof globalThis.fetch

  return { calls, fetch: fetchImplementation }
}

describe('a leitura da marca para o e-mail', () => {
  test('lê marca, cor e contatos do cadastro, e monta a URL pública do logotipo', async () => {
    const remote = jsonFetch(SETTINGS)
    const gateway = createLandingEmailBrandGateway({
      apiBaseUrl: 'https://api.exemplo.com.br/',
      appBaseUrl: 'https://painel.exemplo.com.br',
      fetch: remote.fetch,
    })

    expect(await gateway.read()).toEqual({
      accentColor: '#1a2b3c',
      appBaseUrl: 'https://painel.exemplo.com.br',
      contactEmail: 'contato@exemplo.com.br',
      contactPhone: '(16) 3333-4444',
      logoUrl: 'https://api.exemplo.com.br/public/landing-logo',
      name: 'Transportes Exemplo',
    })
    expect(remote.calls).toEqual(['https://api.exemplo.com.br/public/landing-settings'])
  })

  test('sem `brandName` o nome vem da primeira unidade — o cadastro da própria empresa', async () => {
    const remote = jsonFetch({ data: { ...SETTINGS.data, brandName: '   ' } })
    const gateway = createLandingEmailBrandGateway({
      apiBaseUrl: 'https://api.exemplo.com.br',
      appBaseUrl: undefined,
      fetch: remote.fetch,
    })

    expect((await gateway.read()).name).toBe('Exemplo Matriz')
  })

  test('a leitura é guardada: dois envios seguidos não são duas idas à API', async () => {
    const remote = jsonFetch(SETTINGS)
    const gateway = createLandingEmailBrandGateway({
      apiBaseUrl: 'https://api.exemplo.com.br',
      appBaseUrl: undefined,
      fetch: remote.fetch,
      now: () => 1_000,
    })

    await gateway.read()
    await gateway.read()

    expect(remote.calls).toHaveLength(1)
  })

  test('API fora do ar, resposta de erro e endereço ausente caem na marca do produto', async () => {
    const failing = (async () => {
      throw new Error('offline')
    }) as unknown as typeof globalThis.fetch
    const rejected = jsonFetch(SETTINGS, { ok: false })
    const expected = {
      accentColor: undefined,
      appBaseUrl: 'https://painel.exemplo.com.br',
      contactEmail: undefined,
      contactPhone: undefined,
      logoUrl: undefined,
      name: undefined,
    }

    const offline = createLandingEmailBrandGateway({
      apiBaseUrl: 'https://api.exemplo.com.br',
      appBaseUrl: 'https://painel.exemplo.com.br',
      fetch: failing,
    })
    const errored = createLandingEmailBrandGateway({
      apiBaseUrl: 'https://api.exemplo.com.br',
      appBaseUrl: 'https://painel.exemplo.com.br',
      fetch: rejected.fetch,
    })
    const unconfigured = createLandingEmailBrandGateway({
      apiBaseUrl: undefined,
      appBaseUrl: 'https://painel.exemplo.com.br',
      fetch: rejected.fetch,
    })

    expect(await offline.read()).toEqual(expected)
    expect(await errored.read()).toEqual(expected)
    expect(await unconfigured.read()).toEqual(expected)
    expect(rejected.calls).toHaveLength(1)
  })
})
