/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5: o envio do boleto pelo Evolution da empresa. A chave sai só no cabeçalho `apikey`, o PDF vai em
 * base64 ao `sendMedia`, e a resposta do Evolution vira um motivo fechado — nunca o corpo do provedor.
 */
import { describe, expect, test } from 'bun:test'

import { ContractorReplyWhatsAppSendError } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import { createEvolutionDocumentSender } from '../../src/whatsapp/infrastructure/evolution-document-sender.gateway.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const ENVELOPE = {
  algorithm: 'A256GCM',
  ciphertext: 'c',
  keyId: 'k',
  nonce: 'n',
  version: 1,
} as const

function build(answer: () => Promise<Response>, status: 'active' | 'disabled' = 'active') {
  const calls: Array<{ body: unknown; headers: Record<string, string>; url: string }> = []
  const sender = createEvolutionDocumentSender({
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
        headers: init.headers as Record<string, string>,
        url,
      })
      return answer()
    }) as unknown as typeof fetch,
    repository: {
      findCredential: async () => ({
        baseUrl: 'https://evolution.exemplo.com',
        companyId: COMPANY_ID,
        envelope: ENVELOPE,
        instanceName: 'empresa-1',
        settingsId: 'settings-1',
        status,
      }),
    },
    secrets: { decrypt: async () => ({ apiKey: 'chave-da-instancia' }) },
  })
  return { calls, sender }
}

const SEND = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  caption: 'Boleto prorrogado',
  companyId: COMPANY_ID,
  fileName: 'boleto.pdf',
  mimeType: 'application/pdf',
  number: '+5516999998888',
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ContractorReplyWhatsAppSendError) return error.failure
    throw error
  }
  throw new Error('expected a failure')
}

describe('spec 281 T5: envio do documento pelo Evolution', () => {
  test('manda o PDF em base64 ao número só com dígitos e devolve o id da mensagem', async () => {
    const { calls, sender } = build(async () => Response.json({ key: { id: 'wamid-1' } }))
    const sent = await sender.sendDocument(SEND)

    expect(sent).toEqual({ providerMessageId: 'wamid-1' })
    expect(calls[0]?.url).toBe('https://evolution.exemplo.com/message/sendMedia/empresa-1')
    expect(calls[0]?.headers.apikey).toBe('chave-da-instancia')
    expect(calls[0]?.body).toEqual({
      caption: 'Boleto prorrogado',
      fileName: 'boleto.pdf',
      media: 'JVBERg==',
      mediatype: 'document',
      mimetype: 'application/pdf',
      number: '5516999998888',
    })
  })

  test('400 é número sem WhatsApp; 401/404 e rede são instância fora; 5xx é falha do envio', async () => {
    const cases = [
      [async () => new Response('{"exists":false}', { status: 400 }), 'number_not_found'],
      [async () => new Response('{}', { status: 401 }), 'disconnected'],
      [async () => new Response('{}', { status: 404 }), 'disconnected'],
      [async () => Promise.reject(new TypeError('fetch failed')), 'disconnected'],
      [async () => new Response('{}', { status: 500 }), 'failed'],
    ] as const
    for (const [answer, failure] of cases) {
      const { sender } = build(answer)
      expect(await failureOf(sender.sendDocument(SEND))).toBe(failure)
    }
  })

  test('Evolution desligado na configuração não chama o provedor', async () => {
    const { calls, sender } = build(async () => Response.json({}), 'disabled')
    expect(await failureOf(sender.sendDocument(SEND))).toBe('disconnected')
    expect(calls).toEqual([])
  })

  test('conectado só com o estado `open`', async () => {
    const open = build(async () => Response.json({ instance: { state: 'open' } }))
    const closed = build(async () => Response.json({ instance: { state: 'close' } }))
    expect(await open.sender.isConnected({ companyId: COMPANY_ID })).toBe(true)
    expect(await closed.sender.isConnected({ companyId: COMPANY_ID })).toBe(false)
  })
})
