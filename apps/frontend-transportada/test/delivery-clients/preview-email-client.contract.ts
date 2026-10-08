/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 237 T4.6b (ADR-0094 §10, `security.md` §8): o cliente HTTP da entrada da prévia por e-mail. Resposta de
 * API é entrada não confiável — chave a mais ou a menos é recusada; o `POST` de gerar vai sem corpo e o token
 * volta uma vez; o `PUT` das listas leva só as duas listas; código de motivo novo não derruba a tabela.
 */
import { describe, expect, test } from 'bun:test'

import { createPreviewEmailClient } from '../../src/modules/delivery-clients/shared/previewEmailClient.service'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000237b01'
const BASE = `http://api.test/contractors/${CONTRACTOR_ID}/receiving-profile`
const TOKEN = 'abcdefghijklmnopqrstuvwxyz'

const SETTINGS = {
  contractorId: CONTRACTOR_ID,
  forwarderAllowlist: ['equipe@transportadora.exemplo.test'],
  hasInboundToken: true,
  inboundTokenSetAt: '2026-10-07T12:00:00.000Z',
  senderAllowlist: ['contratante.exemplo.test'],
}
const INTAKES = [
  {
    outcome: 'accepted',
    previewId: '00000000-0000-4000-8000-000000237b02',
    reasonCode: null,
    receivedAt: '2026-10-07T12:00:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'RATE_LIMITED',
    receivedAt: '2026-10-07T11:00:00.000Z',
  },
]

async function failureMessage(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : undefined
  }
}

type RecordedCall = { body: string; headers: Headers; method: string; url: string }

function createFixture(respond: (call: RecordedCall) => { body: unknown; status?: number }) {
  const calls: RecordedCall[] = []
  const client = createPreviewEmailClient({
    apiUrl: 'http://api.test',
    fetch: async (input) => {
      const request = input as Request
      const call = {
        body: await request.text(),
        headers: request.headers,
        method: request.method,
        url: request.url,
      }
      calls.push(call)
      const { body, status = 200 } = respond(call)
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status,
      })
    },
    getAccessToken: () => Promise.resolve('token-sintetico'),
  })
  return { calls, client }
}

describe('a leitura da entrada por e-mail no transporte', () => {
  test('o GET lê as listas e se há endereço, e nada além das cinco chaves', async () => {
    const { calls, client } = createFixture(() => ({ body: { data: SETTINGS } }))

    expect(await client.getSettings(CONTRACTOR_ID)).toEqual(SETTINGS)
    expect(calls[0]?.url).toBe(`${BASE}/preview-email`)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-sintetico')
  })

  test.each([
    [
      'uma chave a mais (o hash não é da tela)',
      { ...SETTINGS, previewInboundTokenHash: 'a'.repeat(64) },
    ],
    ['uma chave a menos', { ...SETTINGS, inboundTokenSetAt: undefined }],
    ['lista que não é de texto', { ...SETTINGS, forwarderAllowlist: [1] }],
    ['hasInboundToken que não é booleano', { ...SETTINGS, hasInboundToken: 'sim' }],
  ])('resposta com %s é recusada', async (_name, data) => {
    const { client } = createFixture(() => ({ body: { data } }))

    expect(await failureMessage(client.getSettings(CONTRACTOR_ID))).toBe('RESPONSE_INVALID')
  })

  test('as recusas recentes: quatro chaves, e código de motivo desconhecido passa (a tela mostra o código)', async () => {
    const { calls, client } = createFixture(() => ({
      body: { data: [...INTAKES, { ...INTAKES[1], reasonCode: 'MOTIVO_NOVO_DA_API' }] },
    }))

    const intakes = await client.listIntakes(CONTRACTOR_ID)

    expect(intakes).toHaveLength(3)
    expect(intakes[2]?.reasonCode).toBe('MOTIVO_NOVO_DA_API')
    expect(calls[0]?.url).toBe(`${BASE}/email-intakes?limit=20`)
  })

  test.each([
    ['uma chave a mais (endereço do remetente)', { ...INTAKES[1], sender: 'x@y.test' }],
    ['uma chave a menos', { outcome: 'rejected', reasonCode: 'RATE_LIMITED', receivedAt: 'x' }],
    ['resultado que não é texto', { ...INTAKES[1], outcome: 1 }],
  ])('recusa recente com %s é recusada', async (_name, intake) => {
    const { client } = createFixture(() => ({ body: { data: [intake] } }))

    expect(await failureMessage(client.listIntakes(CONTRACTOR_ID))).toBe('RESPONSE_INVALID')
  })
})

describe('gravar as listas e gerar o endereço no transporte', () => {
  test('o PUT leva só as duas listas, e a empresa nunca viaja', async () => {
    const { calls, client } = createFixture(() => ({ body: { data: SETTINGS } }))

    await client.saveAllowlists({
      contractorId: CONTRACTOR_ID,
      lists: { forwarderAllowlist: ['a@x.test'], senderAllowlist: ['y.test'] },
    })

    const call = calls[0]
    expect(call?.method).toBe('PUT')
    expect(call?.url).toBe(`${BASE}/preview-email`)
    expect(call?.headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      forwarderAllowlist: ['a@x.test'],
      senderAllowlist: ['y.test'],
    })
  })

  test('o POST de gerar não leva corpo, e o endereço e o token voltam', async () => {
    const { calls, client } = createFixture(() => ({
      body: { data: { address: `${TOKEN}@entrada.exemplo.test`, token: TOKEN } },
    }))

    const generated = await client.generateAddress(CONTRACTOR_ID)

    expect(generated).toEqual({ address: `${TOKEN}@entrada.exemplo.test`, token: TOKEN })
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe(`${BASE}/inbound-token`)
    expect(calls[0]?.body).toBe('')
    expect(calls[0]?.headers.get('content-type')).toBeNull()
  })

  test.each([
    ['uma chave a mais', { address: 'a@b.test', token: TOKEN, hash: 'x' }],
    ['sem o token', { address: 'a@b.test' }],
    ['token que não é texto', { address: 'a@b.test', token: 1 }],
  ])('resposta de gerar com %s é recusada', async (_name, data) => {
    const { client } = createFixture(() => ({ body: { data } }))

    expect(await failureMessage(client.generateAddress(CONTRACTOR_ID))).toBe('RESPONSE_INVALID')
  })

  test('o código estável da recusa sobe como veio, com os campos que faltam', async () => {
    const { client } = createFixture(() => ({
      body: {
        error: {
          code: 'RECEIVING_PROFILE_ALLOWLISTS_REQUIRED',
          details: [{ field: 'senderAllowlist', message: 'x' }],
          message: 'x',
        },
      },
      status: 422,
    }))

    const failure = await client.generateAddress(CONTRACTOR_ID).then(
      () => undefined,
      (error: unknown) => error as { details: readonly { field: string }[]; message: string },
    )

    expect(failure?.message).toBe('RECEIVING_PROFILE_ALLOWLISTS_REQUIRED')
    expect(failure?.details.map((detail) => detail.field)).toEqual(['senderAllowlist'])
  })
})
