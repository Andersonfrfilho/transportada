/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 272 T1.1: a prévia com o layout novo do e-mail e a mensagem do histórico com nome de exibição e
 * papel do assinante passam pelas guardas do cliente, com e sem as chaves novas (painel publicado antes da API).
 */
import { describe, expect, test } from 'bun:test'

import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = 'occurrence-1'

const PREVIEW_CORE = {
  bodyText: 'Texto',
  contractorName: 'Contratante Alfa',
  missingNotificationTemplate: false,
  recipients: [],
  subject: 'Assunto',
  suggested: true,
  text: 'Texto',
} as const

const PREVIEW_LAYOUT_KEYS = {
  fromDisplayName: 'Transportadora Alfa — Ana Operação',
  fullSubject: '[Transportadora Alfa] Assunto',
  html: '<!doctype html><html><body><p>Olá</p></body></html>',
  inlineLogo: { contentBase64: 'iVBORw0KGgo=', mimeType: 'image/png' },
} as const

const MESSAGE_CORE = {
  attachments: [],
  author: { kind: 'operation', name: 'Ana Operação', userId: 'user-1' },
  bodyText: 'Olá, segue o boleto.',
  channel: 'email',
  createdAt: '2026-10-17T10:00:00Z',
  direction: 'outbound',
  id: 'message-1',
  status: 'sent',
  statusTimes: {},
} as const

const MESSAGE_LAYOUT_KEYS = {
  fromDisplayName: 'Transportadora Alfa — Ana Operação',
  signerKind: 'operator',
} as const

function clientFor(response: unknown) {
  return createOccurrenceConversationClient({
    apiUrl: API_URL,
    fetch: () => Promise.resolve(Response.json(response)),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

function conversationsResponse(message: Readonly<Record<string, unknown>>) {
  return {
    data: {
      contractorPortal: { available: true },
      conversations: [{ id: 'conversation-1', messages: [message], participant: 'contractor' }],
    },
  }
}

describe('spec 272 T1.1: tolerância à prévia do e-mail com o layout novo', () => {
  test('a prévia sem as chaves novas (API anterior) passa', async () => {
    const client = clientFor({ data: PREVIEW_CORE })

    const preview = await client.previewContractorMail({ occurrenceId: OCCURRENCE_ID })

    expect(preview.subject).toBe('Assunto')
    expect(preview.bodyText).toBe('Texto')
  })

  test('a prévia com html, fullSubject, fromDisplayName e inlineLogo passa', async () => {
    const client = clientFor({ data: { ...PREVIEW_CORE, ...PREVIEW_LAYOUT_KEYS } })

    const preview = await client.previewContractorMail({ occurrenceId: OCCURRENCE_ID })

    expect(preview.subject).toBe('Assunto')
    expect(preview.bodyText).toBe('Texto')
  })

  test('a prévia sem inlineLogo (envio sem logo) passa', async () => {
    const client = clientFor({
      data: {
        ...PREVIEW_CORE,
        fromDisplayName: PREVIEW_LAYOUT_KEYS.fromDisplayName,
        fullSubject: PREVIEW_LAYOUT_KEYS.fullSubject,
        html: PREVIEW_LAYOUT_KEYS.html,
      },
    })

    const preview = await client.previewContractorMail({ occurrenceId: OCCURRENCE_ID })

    expect(preview.subject).toBe('Assunto')
  })
})

describe('spec 272 T1.1: tolerância à mensagem do histórico com o assinante', () => {
  test('a mensagem sem fromDisplayName e signerKind (API anterior) entra na lista', async () => {
    const client = clientFor(conversationsResponse(MESSAGE_CORE))

    const view = await client.listConversations({ occurrenceId: OCCURRENCE_ID })

    expect(view.conversations[0]?.messages.map((message) => message.id)).toEqual(['message-1'])
  })

  test('a mensagem com fromDisplayName e signerKind entra na lista', async () => {
    const client = clientFor(conversationsResponse({ ...MESSAGE_CORE, ...MESSAGE_LAYOUT_KEYS }))

    const view = await client.listConversations({ occurrenceId: OCCURRENCE_ID })

    expect(view.conversations[0]?.messages.map((message) => message.id)).toEqual(['message-1'])
  })

  test('a mensagem com fromDisplayName e signerKind nulos entra na lista', async () => {
    const client = clientFor(
      conversationsResponse({ ...MESSAGE_CORE, fromDisplayName: null, signerKind: null }),
    )

    const view = await client.listConversations({ occurrenceId: OCCURRENCE_ID })

    expect(view.conversations[0]?.messages.map((message) => message.id)).toEqual(['message-1'])
  })
})
