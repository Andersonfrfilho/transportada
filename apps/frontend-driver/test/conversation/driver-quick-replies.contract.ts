/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createDriverQuickReplies } from '../../src/modules/conversation/shared/driverQuickReplies.service'

type Reply = 'ok' | 'network-down' | 'not-registered' | 'server-error' | 'malformed' | 'bad-json'

function createHarness(ownerKey: string | null = 'owner-1') {
  let reply: Reply = 'ok'
  let owner = ownerKey ?? undefined
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  }
  const http = createDriverConversationHttp({
    baseUrl: 'https://api.test/v1',
    fetch: (request) => {
      expect(new URL(request.url).pathname).toBe('/v1/me/trips/current/quick-replies')
      if (reply === 'network-down') return Promise.reject(new TypeError('Failed to fetch'))
      if (reply === 'not-registered') {
        return Promise.resolve(
          Response.json({ error: { code: 'DRIVER_NOT_REGISTERED' } }, { status: 409 }),
        )
      }
      if (reply === 'server-error') return Promise.resolve(Response.json({}, { status: 503 }))
      if (reply === 'malformed') return Promise.resolve(Response.json({ data: [{ id: 1 }] }))
      if (reply === 'bad-json') return Promise.resolve(new Response('<html>', { status: 200 }))
      return Promise.resolve(
        Response.json({
          data: [
            { id: 'a', text: 'Cheguei ao local' },
            { id: 'b', text: 'Cliente ausente' },
          ],
        }),
      )
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  const service = createDriverQuickReplies({ getOwnerKey: () => owner, http, storage })
  return {
    service,
    values,
    setOwner: (next: string | undefined) => void (owner = next),
    setReply: (next: Reply) => void (reply = next),
  }
}

const EXPECTED = [
  { id: 'a', text: 'Cheguei ao local' },
  { id: 'b', text: 'Cliente ausente' },
]

describe('respostas prontas do motorista', () => {
  it('sucesso: devolve a lista da empresa e a guarda', async () => {
    const harness = createHarness()
    expect(await harness.service.fetchQuickReplies()).toEqual(EXPECTED)
    expect(harness.values.size).toBe(1)
  })

  it('sem rede: usa a última lista boa guardada', async () => {
    const harness = createHarness()
    await harness.service.fetchQuickReplies()
    harness.setReply('network-down')
    expect(await harness.service.fetchQuickReplies()).toEqual(EXPECTED)
    harness.setReply('server-error')
    expect(await harness.service.fetchQuickReplies()).toEqual(EXPECTED)
  })

  it('sem rede e sem lista guardada: vazio', async () => {
    const harness = createHarness()
    harness.setReply('network-down')
    expect(await harness.service.fetchQuickReplies()).toEqual([])
  })

  it('409 (sem cadastro de motorista): vazio, e a lista antiga não volta', async () => {
    const harness = createHarness()
    await harness.service.fetchQuickReplies()
    harness.setReply('not-registered')
    expect(await harness.service.fetchQuickReplies()).toEqual([])
    harness.setReply('network-down')
    expect(await harness.service.fetchQuickReplies()).toEqual([])
  })

  it('resposta malformada: vazio, sem lançar e sem sobrescrever o cache com lixo', async () => {
    const harness = createHarness()
    await harness.service.fetchQuickReplies()
    const cached = [...harness.values.values()]
    harness.setReply('malformed')
    expect(await harness.service.fetchQuickReplies()).toEqual([])
    harness.setReply('bad-json')
    expect(await harness.service.fetchQuickReplies()).toEqual([])
    harness.setReply('network-down')
    expect([...harness.values.values()]).toEqual(cached)
  })

  it('sem dono da sessão não há cache: outro motorista no aparelho não herda os chips', async () => {
    const harness = createHarness(null)
    await harness.service.fetchQuickReplies()
    expect(harness.values.size).toBe(0)
    harness.setOwner('owner-2')
    harness.setReply('network-down')
    expect(await harness.service.fetchQuickReplies()).toEqual([])
  })
})
