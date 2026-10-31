/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 283 (T5, D6, RF7): responder ao cliente pelo painel. Só por WhatsApp, pelo `replyTarget` da faixa; o número
 * nunca vai no corpo; o primeiro envio a um número se confirma; cada código da rota vira um aviso que diz o que fazer.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  CLIENT_REPLY_BODY_MAX_LENGTH,
  listClientReplyTargets,
  resolveClientReplyFailure,
  validateClientReplyDraft,
} from '@/modules/occurrence-conversation/shared/clientReply.service'
import { toClientThreadMessage } from '@/modules/occurrence-conversation/shared/clientThreadApi.service'
import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import type { OccurrenceClientChannel } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')
}

const whatsapp = (
  address: string,
  status: OccurrenceClientChannel['status'],
  id: string,
  confirmed = false,
): OccurrenceClientChannel => ({
  kind: 'whatsapp',
  maskedAddress: address,
  replyTarget: { confirmed, id },
  status,
})
const email: OccurrenceClientChannel = {
  kind: 'email',
  maskedAddress: 'fi•••@x.com',
  replyTarget: null,
  status: 'sent',
}

describe('"Responder por": só números de WhatsApp, o que respondeu primeiro', () => {
  test('o e-mail não entra; quem respondeu por último vem à frente', () => {
    const targets = listClientReplyTargets([
      email,
      whatsapp('+55 ••••5678', 'sent', 'b'),
      whatsapp('+55 ••••1234', 'replied', 'a'),
    ])
    expect(targets.map((target) => target.id)).toEqual(['a', 'b'])
  })

  test('só e-mail na faixa: ninguém para responder', () => {
    expect(listClientReplyTargets([email])).toEqual([])
  })
})

describe('o rascunho da resposta (1 a 4000, sem espaço só)', () => {
  test('aparado, vazio e longo demais', () => {
    expect(validateClientReplyDraft('  oi  ')).toEqual({ body: 'oi' })
    expect(validateClientReplyDraft('   ')).toEqual({ error: 'required' })
    expect(validateClientReplyDraft('a'.repeat(CLIENT_REPLY_BODY_MAX_LENGTH + 1))).toEqual({
      error: 'tooLong',
    })
    expect(validateClientReplyDraft('a'.repeat(CLIENT_REPLY_BODY_MAX_LENGTH))).toEqual({
      body: 'a'.repeat(CLIENT_REPLY_BODY_MAX_LENGTH),
    })
  })
})

describe('cada código da rota vira um aviso', () => {
  test('confirmação, WhatsApp desligado, fora do ar e o resto', () => {
    const code = (value: string) => resolveClientReplyFailure(new Error(value))
    expect(code('OCCURRENCE_CLIENT_REPLY_CONFIRMATION_REQUIRED')).toBe('confirmation')
    expect(code('OCCURRENCE_CLIENT_WHATSAPP_OFF')).toBe('whatsappOff')
    expect(code('WHATSAPP_EVOLUTION_UNAVAILABLE')).toBe('unavailable')
    expect(code('WHATSAPP_EVOLUTION_NOT_CONFIGURED')).toBe('whatsappOff')
    expect(code('WHATSAPP_EVOLUTION_DISABLED')).toBe('whatsappOff')
    expect(code('OCCURRENCE_CONVERSATION_REQUEST_FAILED')).toBe('generic')
    expect(resolveClientReplyFailure('texto')).toBe('generic')
  })
})

describe('a chamada à API', () => {
  function createClient(response: Response, requests: Request[]) {
    return createOccurrenceConversationClient({
      apiUrl: 'https://api.example.test',
      fetch: (request) => {
        requests.push(request)
        return Promise.resolve(response)
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })
  }

  test('POST em /client/messages com a chave, o alvo e sem número no corpo', async () => {
    const requests: Request[] = []
    const client = createClient(
      new Response(JSON.stringify({ data: { messageId: 'm1', replayed: false, status: 'sent' } }), {
        status: 202,
      }),
      requests,
    )
    const receipt = await client.sendClientReply({
      body: 'Bom dia',
      confirmNumber: true,
      idempotencyKey: 'client-reply:k1',
      occurrenceId: 'o1',
      replyTargetId: 'rt-1',
    })
    expect(receipt).toEqual({ messageId: 'm1', replayed: false, status: 'sent' })
    const request = requests[0]
    expect(request?.method).toBe('POST')
    expect(new URL(request?.url ?? '').pathname).toBe(
      '/trip-occurrences/o1/conversations/client/messages',
    )
    expect(request?.headers.get('idempotency-key')).toBe('client-reply:k1')
    expect(await request?.json()).toEqual({
      body: 'Bom dia',
      channel: 'whatsapp',
      confirmNumber: true,
      replyTargetId: 'rt-1',
    })
  })

  test('sem `confirmNumber` o campo não vai; o 409 de confirmação chega como código', async () => {
    const requests: Request[] = []
    const client = createClient(
      new Response(
        JSON.stringify({ error: { code: 'OCCURRENCE_CLIENT_REPLY_CONFIRMATION_REQUIRED' } }),
        { status: 409 },
      ),
      requests,
    )
    const failure = await client
      .sendClientReply({
        body: 'oi',
        idempotencyKey: 'k',
        occurrenceId: 'o1',
        replyTargetId: 'rt',
      })
      .catch((error: unknown) => error)
    expect(resolveClientReplyFailure(failure)).toBe('confirmation')
    expect(await requests[0]?.json()).toEqual({
      body: 'oi',
      channel: 'whatsapp',
      replyTargetId: 'rt',
    })
  })

  test('resposta sem recibo válido é inválida, nunca sucesso silencioso', async () => {
    const client = createClient(new Response(JSON.stringify({ data: {} }), { status: 202 }), [])
    const failure = await client
      .sendClientReply({
        body: 'oi',
        idempotencyKey: 'k',
        occurrenceId: 'o1',
        replyTargetId: 'rt',
      })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('OCCURRENCE_CONVERSATION_RESPONSE_INVALID')
  })
})

describe('o campo de resposta na tela', () => {
  test('o número nunca é montado no painel: só `replyTargetId`, e o texto é por locale', async () => {
    const composer = await source(
      'modules/occurrence-conversation/components/ClientConversationPanel.component.tsx',
    )
    expect(composer).toContain('ConversationThread')
    expect(composer).toContain('evolution.ready === false')
    expect(composer).toContain("t('client.reply.confirm'")
    const api = await source('modules/occurrence-conversation/shared/clientThreadApi.service.ts')
    expect(api).toContain('replyTargetId: target.id')
    expect(api).toContain('confirmNumber: true')
    const pt = JSON.parse(
      await source('modules/occurrence-conversation/locales/occurrenceConversation.locale.json'),
    ) as { client: { reply: Record<string, unknown> } }
    const en = JSON.parse(
      await source('modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json'),
    ) as { client: { reply: Record<string, unknown> } }
    expect(Object.keys(en.client.reply).sort()).toEqual(Object.keys(pt.client.reply).sort())
  })
})

describe('o chat do cliente tem o mesmo desenho do chat do motorista', () => {
  const labels = {
    bySystem: 'Sistema',
    channel: { app: 'app', email: 'e-mail', portal: 'portal', whatsapp: 'WhatsApp' },
    fromUs: 'Nós',
    sentDocument: (name: string) => `Boleto enviado: ${name}`,
    sentNoText: 'Mensagem enviada.',
  } as const
  const base = {
    attachments: [],
    author: { kind: 'automatic' },
    bodyText: '',
    channel: 'whatsapp',
    createdAt: '2026-10-30T20:36:00.000Z',
    direction: 'outbound',
    id: 'm1',
    status: 'delivered',
    statusTimes: {},
  } as const

  test('o envio do boleto vira balão com o arquivo, sem repetir o nome no texto', () => {
    const message = toClientThreadMessage(
      {
        ...base,
        attachments: [
          {
            contentType: 'application/pdf',
            fileName: 'boleto.pdf',
            id: 'a1',
            sizeBytes: 4500,
            url: 'https://x/a1',
          },
        ],
        clientDelivery: {
          actorKind: 'system',
          actorName: null,
          deliveryId: 'd1',
          documentName: 'boleto.pdf',
          recipientMasked: '+55 •••• 6772',
        },
      },
      labels,
    )
    expect(message.attachments).toHaveLength(1)
    expect(message.text).toBe('')
    expect(message.authorName).toBe('Sistema · WhatsApp')
  })

  test('sem arquivo no balão, o texto diz qual boleto foi', () => {
    const message = toClientThreadMessage(
      {
        ...base,
        clientDelivery: {
          actorKind: 'system',
          actorName: null,
          deliveryId: 'd1',
          documentName: 'boleto.pdf',
          recipientMasked: '+55 •••• 6772',
        },
      },
      labels,
    )
    expect(message.text).toBe('Boleto enviado: boleto.pdf')
  })

  test('o texto escrito segue como veio, com a formatação do SDK (*negrito*, _itálico_)', () => {
    const message = toClientThreadMessage(
      { ...base, bodyText: 'Segue o *boleto* _prorrogado_ 😀' },
      labels,
    )
    expect(message.text).toBe('Segue o *boleto* _prorrogado_ 😀')
  })
})
