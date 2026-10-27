/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 281 T7 (RF3, RF5): o boleto por WhatsApp pela tela do escritório. Leituras tolerantes das três rotas da T5, a
 * regra do número, o botão que fica à vista com o motivo, o estado por número e o cliente HTTP (chave no cabeçalho,
 * número só no corpo, "Tentar de novo" sem corpo).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  CLIENT_CHANNELS,
  describeWhatsAppFailure,
  describeWhatsAppSendState,
  parseInformedWhatsAppNumber,
  readContractorReplyWhatsAppOptions,
  readWhatsAppSendOutcome,
  resolveClientWhatsAppAction,
  resolveWhatsAppFailureKey,
  type ContractorReplyWhatsAppOptions,
  type WhatsAppDelivery,
} from '../../src/modules/occurrence-conversation/shared/contractorReplyWhatsApp.service'
import { createOccurrenceConversationClient } from '../../src/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

import en from '../../src/modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json'
import pt from '../../src/modules/occurrence-conversation/locales/occurrenceConversation.locale.json'

const API = '../../../api-transportada/src'

const OPTIONS: ContractorReplyWhatsAppOptions = {
  clientChannel: 'whatsapp',
  contacts: [{ contactId: 'c-1', label: 'Compras', numberMasked: '+55 11 *****-5678' }],
  deliveries: [],
  evolution: { connectionState: 'open', ready: true, status: 'active' },
  sentCount: 0,
  sentLimit: 5,
}

function delivery(patch: Partial<WhatsAppDelivery>): WhatsAppDelivery {
  return {
    createdAt: '2026-10-27T12:00:00.000Z',
    id: 'd-1',
    numberMasked: '+55 11 *****-5678',
    reason: null,
    sentAt: null,
    status: 'queued',
    ...patch,
  }
}

describe('o vocabulário é cópia por valor do da API', () => {
  test('os canais do tipo e os motivos do WhatsApp batem com a API', () => {
    const constant = readFileSync(
      new URL(`${API}/shared/delivery-client-email.constant.ts`, import.meta.url),
      'utf8',
    )
    for (const channel of CLIENT_CHANNELS) expect(constant).toContain(`'${channel}'`)
    const reasons = readFileSync(
      new URL(`${API}/shared/occurrence-contractor-reply.constant.ts`, import.meta.url),
      'utf8',
    )
    for (const reason of [
      'whatsapp_number_not_found',
      'whatsapp_disconnected',
      'attachment_too_large_for_whatsapp',
      'client_boleto_whatsapp',
    ]) {
      expect(reasons).toContain(`'${reason}'`)
    }
  })

  test('as duas línguas têm as mesmas chaves e todo código de erro da API tem texto', () => {
    expect(Object.keys(en.clientWhatsApp).sort()).toEqual(Object.keys(pt.clientWhatsApp).sort())
    expect(Object.keys(en.clientWhatsApp.failure).sort()).toEqual(
      Object.keys(pt.clientWhatsApp.failure).sort(),
    )
    expect(Object.keys(en.details.whatsappState).sort()).toEqual(
      Object.keys(pt.details.whatsappState).sort(),
    )
    const errors = readFileSync(
      new URL(
        `${API}/occurrence-conversation/domain/contractor-reply-whatsapp.error.ts`,
        import.meta.url,
      ),
      'utf8',
    )
    const codes = [...errors.matchAll(/code: '([A-Z_]+)'/gu)].map((match) => match[1] ?? '')
    expect(codes.length).toBeGreaterThan(0)
    for (const code of codes) {
      const key = resolveWhatsAppFailureKey(code)
      expect(key).not.toBe('generic')
      expect(Object.keys(pt.clientWhatsApp.failure)).toContain(key)
    }
    for (const reason of [
      'send_failed',
      'whatsapp_disconnected',
      'whatsapp_number_not_found',
      'attachment_too_large_for_whatsapp',
    ]) {
      expect(Object.keys(pt.clientWhatsApp.reason)).toContain(reason)
    }
  })
})

describe('a leitura das opções é tolerante', () => {
  test('lê o que a T5 devolve e descarta o item malformado', () => {
    const options = readContractorReplyWhatsAppOptions({
      data: {
        ...OPTIONS,
        contacts: [...OPTIONS.contacts, { contactId: 1 }],
        deliveries: [delivery({}), { id: 'x' }],
      },
    })
    expect(options?.contacts).toHaveLength(1)
    expect(options?.deliveries).toHaveLength(1)
    expect(options?.evolution.ready).toBe(true)
  })

  test.each([
    ['sem dado', {}],
    ['sem evolution', { data: { ...OPTIONS, evolution: undefined } }],
    ['canal desconhecido', { data: { ...OPTIONS, clientChannel: 'sms' } }],
    ['teto que não é número', { data: { ...OPTIONS, sentLimit: '5' } }],
  ])('resposta %s vira null, nunca um botão', (_name, payload) => {
    expect(readContractorReplyWhatsAppOptions(payload)).toBeNull()
  })

  test('o resultado do envio exige número mascarado e id da entrega, senão é erro', () => {
    const outcome = readWhatsAppSendOutcome({
      data: {
        results: [
          {
            contactId: 'c-1',
            deliveryId: 'd-1',
            kind: 'sent',
            numberMasked: '+55 *',
            reason: null,
          },
          {
            contactId: null,
            deliveryId: 'd-2',
            kind: 'failed',
            numberMasked: '+55 **',
            reason: 'send_failed',
          },
        ],
        savedContactId: 'c-2',
      },
    })
    expect(outcome.results.map((result) => result.kind)).toEqual(['sent', 'failed'])
    expect(outcome.savedContactId).toBe('c-2')
    expect(() => readWhatsAppSendOutcome({ data: { results: [{ kind: 'sent' }] } })).toThrow()
    expect(() =>
      readWhatsAppSendOutcome({
        data: { results: [{ deliveryId: 'd', kind: 'queued', numberMasked: 'x' }] },
      }),
    ).toThrow()
    expect(() => readWhatsAppSendOutcome({})).toThrow()
  })
})

describe('o número digitado só passa se parece telefone', () => {
  test.each([
    ['(11) 91234-5678', true],
    ['+55 11 91234-5678', true],
    ['11912345678', true],
    ['', false],
    ['abc', false],
    ['12345', false],
    ['11 9123-4567; 11 99999-9999', false],
    ['1'.repeat(16), false],
  ])('%s -> %s', (raw, accepted) => {
    expect(parseInformedWhatsAppNumber(raw) !== null).toBe(accepted)
  })
})

describe('o botão "Enviar por WhatsApp" (RF5)', () => {
  test('só os tipos whatsapp e both oferecem; off e email escondem', () => {
    for (const clientChannel of ['off', 'email'] as const) {
      expect(resolveClientWhatsAppAction({ ...OPTIONS, clientChannel }).kind).toBe('hidden')
    }
    for (const clientChannel of ['whatsapp', 'both'] as const) {
      expect(resolveClientWhatsAppAction({ ...OPTIONS, clientChannel }).kind).toBe('send')
    }
  })

  test('Evolution fora do ar fica à vista com o motivo, não some', () => {
    expect(
      resolveClientWhatsAppAction({
        ...OPTIONS,
        evolution: { connectionState: null, ready: false, status: null },
      }),
    ).toEqual({ kind: 'offline', reason: 'notConfigured' })
    expect(
      resolveClientWhatsAppAction({
        ...OPTIONS,
        evolution: { connectionState: 'unknown', ready: false, status: 'disabled' },
      }),
    ).toEqual({ kind: 'offline', reason: 'disabled' })
    expect(
      resolveClientWhatsAppAction({
        ...OPTIONS,
        evolution: { connectionState: 'close', ready: false, status: 'active' },
      }),
    ).toEqual({ kind: 'offline', reason: 'disconnected' })
  })

  test('o teto por ocorrência desliga o botão', () => {
    expect(resolveClientWhatsAppAction({ ...OPTIONS, sentCount: 5 }).kind).toBe('limitReached')
  })
})

describe('o estado do envio por número', () => {
  test('a última tentativa de cada número vale; a recusada fica no histórico', () => {
    const items = describeWhatsAppSendState([
      delivery({
        createdAt: '2026-10-27T12:00:00.000Z',
        id: 'old',
        reason: 'send_failed',
        status: 'failed',
      }),
      delivery({
        createdAt: '2026-10-27T12:05:00.000Z',
        id: 'new',
        sentAt: '2026-10-27T12:05:10.000Z',
        status: 'sent',
      }),
      delivery({ id: 'other', numberMasked: '+55 21 *****-0000', status: 'queued' }),
      delivery({ id: 'no-number', numberMasked: null }),
    ])
    expect(items.map((item) => [item.deliveryId, item.state])).toEqual([
      ['other', 'queued'],
      ['new', 'sent'],
    ])
  })

  test('só a recusa do provedor e a queda de conexão tentam de novo; sem WhatsApp e arquivo grande vão para o e-mail', () => {
    expect(describeWhatsAppFailure('send_failed')).toMatchObject({
      canRetry: true,
      offerEmail: false,
    })
    expect(describeWhatsAppFailure('whatsapp_disconnected')).toMatchObject({
      canRetry: true,
      offerEmail: true,
    })
    expect(describeWhatsAppFailure('whatsapp_number_not_found')).toMatchObject({
      canRetry: false,
      offerEmail: true,
    })
    expect(describeWhatsAppFailure('attachment_too_large_for_whatsapp')).toMatchObject({
      canRetry: false,
      offerEmail: true,
    })
    expect(describeWhatsAppFailure('motivo_novo')).toMatchObject({
      canRetry: true,
      key: 'send_failed',
    })
  })
})

describe('o cliente HTTP do envio por WhatsApp', () => {
  function capture(respond: () => Response) {
    const requests: Array<{ body: unknown; headers: Headers; method: string; url: string }> = []
    const client = createOccurrenceConversationClient({
      apiUrl: 'https://api.example.test',
      fetch: async (request) => {
        const text = await request.clone().text()
        requests.push({
          body: text === '' ? undefined : JSON.parse(text),
          headers: request.headers,
          method: request.method,
          url: request.url,
        })
        return respond()
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    return { client, requests }
  }

  test('o envio leva os ids e o número novo no corpo, com a chave no cabeçalho', async () => {
    const { client, requests } = capture(() =>
      Response.json(
        {
          data: {
            results: [
              {
                contactId: 'c-1',
                deliveryId: 'd-1',
                kind: 'sent',
                numberMasked: '+55 *',
                reason: null,
              },
            ],
            savedContactId: 'c-2',
          },
        },
        { status: 201 },
      ),
    )
    const outcome = await client.forwardContractorReplyToClientWhatsApp({
      contactIds: ['c-1'],
      idempotencyKey: 'client-whatsapp:abc',
      number: '(11) 91234-5678',
      occurrenceId: 'occurrence-1',
      save: true,
    })
    expect(requests[0]?.url).toBe(
      'https://api.example.test/trip-occurrences/occurrence-1/contractor-reply/whatsapp-delivery',
    )
    expect(requests[0]?.headers.get('idempotency-key')).toBe('client-whatsapp:abc')
    expect(requests[0]?.body).toEqual({
      contactIds: ['c-1'],
      number: '(11) 91234-5678',
      save: true,
    })
    expect(outcome.savedContactId).toBe('c-2')
  })

  test('sem número novo o corpo não leva number nem save', async () => {
    const { client, requests } = capture(() =>
      Response.json({ data: { results: [], savedContactId: null } }),
    )
    await client.forwardContractorReplyToClientWhatsApp({
      contactIds: ['c-1'],
      idempotencyKey: 'client-whatsapp:abc',
      occurrenceId: 'occurrence-1',
    })
    expect(requests[0]?.body).toEqual({ contactIds: ['c-1'] })
  })

  test('"Tentar de novo" manda só a chave: o número e o anexo vêm da entrega', async () => {
    const { client, requests } = capture(() =>
      Response.json({ data: { results: [], savedContactId: null } }),
    )
    await client.resendContractorReplyWhatsAppDelivery({
      deliveryId: 'd 1',
      idempotencyKey: 'client-whatsapp:xyz',
      occurrenceId: 'occurrence-1',
    })
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.body).toBeUndefined()
    expect(requests[0]?.url).toBe(
      'https://api.example.test/trip-occurrences/occurrence-1/contractor-reply/whatsapp-deliveries/d%201/resend',
    )
    expect(requests[0]?.headers.get('idempotency-key')).toBe('client-whatsapp:xyz')
  })

  test('a leitura das opções vai ao GET da T5', async () => {
    const { client, requests } = capture(() => Response.json({ data: OPTIONS }))
    const options = await client.readContractorReplyWhatsAppOptions({
      occurrenceId: 'occurrence-1',
    })
    expect(requests[0]?.url).toBe(
      'https://api.example.test/trip-occurrences/occurrence-1/contractor-reply/whatsapp-options',
    )
    expect(options?.clientChannel).toBe('whatsapp')
  })
})
