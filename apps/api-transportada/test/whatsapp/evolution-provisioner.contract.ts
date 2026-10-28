/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createEvolutionProvisioner } from '../../src/whatsapp/infrastructure/evolution-connection.gateway.js'

type Call = { body: unknown; headers: Record<string, string>; method: string; url: string }

function build(responses: { body: unknown; status: number }[]) {
  const calls: Call[] = []
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({
      body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      headers: init.headers as Record<string, string>,
      method: String(init.method),
      url,
    })
    const next = responses.shift() ?? { body: null, status: 500 }
    return new Response(JSON.stringify(next.body), { status: next.status })
  }) as unknown as typeof fetch
  const provisioner = createEvolutionProvisioner({
    baseUrl: 'https://evolution.exemplo.com',
    fetch: fakeFetch,
    globalApiKey: 'chave-global',
  })
  return { calls, provisioner }
}

describe('o provisionador do Evolution (spec 281 T4b)', () => {
  test('cria a instância com a chave global só no cabeçalho e lê o token de hash.apikey', async () => {
    const { calls, provisioner } = build([
      { body: { hash: { apikey: 'token-1' }, instance: { instanceName: 'i' } }, status: 201 },
    ])

    expect(await provisioner.createInstance({ instanceName: 'i' })).toEqual({ token: 'token-1' })
    expect(calls[0]?.url).toBe('https://evolution.exemplo.com/instance/create')
    expect(calls[0]?.headers.apikey).toBe('chave-global')
    expect(calls[0]?.url).not.toContain('chave-global')
    expect(calls[0]?.body).toEqual({
      instanceName: 'i',
      integration: 'WHATSAPP-BAILEYS',
      qrcode: false,
    })
  })

  test('aceita o token como texto em hash', async () => {
    const { provisioner } = build([{ body: { hash: 'token-2' }, status: 201 }])
    expect(await provisioner.createInstance({ instanceName: 'i' })).toEqual({ token: 'token-2' })
  })

  test('instância que já existe é lida em vez de criada de novo', async () => {
    const { calls, provisioner } = build([
      { body: { response: { message: ['already in use'] } }, status: 403 },
      { body: [{ name: 'i', token: 'token-3' }], status: 200 },
    ])

    expect(await provisioner.createInstance({ instanceName: 'i' })).toEqual({ token: 'token-3' })
    expect(calls[1]?.method).toBe('GET')
    expect(calls[1]?.url).toContain('/instance/fetchInstances?instanceName=i')
  })

  test('resposta sem token falha sem vazar nada', async () => {
    const { provisioner } = build([{ body: { instance: {} }, status: 201 }])
    await expect(provisioner.createInstance({ instanceName: 'i' })).rejects.toThrow(
      'evolution provisioning failed',
    )
  })
})
