/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T407: o cliente das rotas da conversa (T404). Ler é tolerante — mensagem que o guard não
 * entende sai da lista em vez de derrubar a aba —; enviar leva a `Idempotency-Key` do diálogo; o erro
 * da API chega pelo código, nunca pelo texto.
 */
import { describe, expect, test } from 'bun:test'

import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import { createPortalMessageIdempotencyKey } from '@/modules/occurrence-conversation/shared/occurrenceConversation.service'

const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = 'occurrence-1'

function createClient(response: Response, requests: Request[] = []) {
  return createOccurrenceConversationClient({
    apiUrl: API_URL,
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

const OUTBOUND = {
  author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-1' },
  bodyText: 'Autorizam?',
  channel: 'email',
  createdAt: '2026-09-24T12:00:00.000Z',
  direction: 'outbound',
  id: 'message-1',
  status: 'sent',
  statusTimes: { sent: '2026-09-24T12:00:05.000Z' },
}

describe('cliente da conversa da ocorrência (spec 183 T407)', () => {
  test('lista as conversas; mensagem malformada sai da lista, sem derrubar a aba', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({
        data: {
          conversations: [
            {
              id: 'conversation-1',
              messages: [OUTBOUND, { ...OUTBOUND, id: 'broken', direction: 'sideways' }],
              participant: 'contractor',
              status: 'open',
              unreadCount: 0,
            },
          ],
        },
      }),
      requests,
    )

    const view = await client.listConversations({ occurrenceId: OCCURRENCE_ID })
    const { conversations } = view

    /** Spec 183 T654: sem o campo, o canal Portal fica fechado — nunca aberto por engano. */
    expect(view.contractorPortal).toEqual({ available: false })
    expect(conversations).toHaveLength(1)
    expect(conversations[0]?.messages.map((message) => message.id)).toEqual(['message-1'])
    expect(requests[0]?.url).toBe(`${API_URL}/trip-occurrences/${OCCURRENCE_ID}/conversations`)
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
  })

  test('a leitura diz se o canal Portal está aberto (spec 183 T654)', async () => {
    const client = createClient(
      Response.json({ data: { contractorPortal: { available: true }, conversations: [] } }),
      [],
    )

    expect(
      (await client.listConversations({ occurrenceId: OCCURRENCE_ID })).contractorPortal,
    ).toEqual({ available: true })
  })

  test('envia à contratante pelo portal só o texto, com a chave (spec 183 T654)', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json(
        { data: { conversationId: 'conversation-1', conversationMessageId: 'message-1' } },
        { status: 202 },
      ),
      requests,
    )

    await client.sendContractorPortalMessage({
      body: 'Recebemos a nota.',
      idempotencyKey: 'portal-message:key-0001',
      occurrenceId: OCCURRENCE_ID,
    })

    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(
      `${API_URL}/trip-occurrences/${OCCURRENCE_ID}/conversations/contractor/messages`,
    )
    expect(request?.headers.get('idempotency-key')).toBe('portal-message:key-0001')
    expect(await request?.json()).toEqual({ body: 'Recebemos a nota.', channel: 'portal' })
  })

  test('a chave do envio pelo portal tem prefixo próprio (spec 183 T654)', () => {
    expect(createPortalMessageIdempotencyKey(() => 'abc-123')).toBe('portal-message:abc-123')
  })

  test('envia à contratante com a chave de idempotência e o corpo do diálogo', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json(
        { data: { conversationId: 'conversation-1', recipientCount: 1 } },
        { status: 202 },
      ),
      requests,
    )

    await client.sendContractorMail({
      idempotencyKey: 'occurrence-mail:key-0001',
      occurrenceId: OCCURRENCE_ID,
      request: { body: 'Texto', channel: 'email', contactIds: ['contact-1'], subject: 'Assunto' },
    })

    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(
      `${API_URL}/trip-occurrences/${OCCURRENCE_ID}/conversations/contractor/messages`,
    )
    expect(request?.headers.get('idempotency-key')).toBe('occurrence-mail:key-0001')
    expect(await request?.json()).toEqual({
      body: 'Texto',
      channel: 'email',
      contactIds: ['contact-1'],
      subject: 'Assunto',
    })
  })

  test('a prévia devolve o e-mail e os destinatários', async () => {
    const preview = {
      bodyText: 'Texto',
      contractorName: 'Contratante Alfa',
      html: '<p>Texto</p>',
      recipients: [
        {
          approvesCharges: true,
          contactId: 'contact-1',
          email: 'compras@alfa.example.test',
          name: 'Maria',
          preselected: true,
          roleLabel: 'Compras',
        },
      ],
      subject: 'Assunto',
      suggested: true,
      text: 'Texto\n\n—\nOperadora',
    }
    const client = createClient(Response.json({ data: preview }))

    expect(await client.previewContractorMail({ occurrenceId: OCCURRENCE_ID })).toEqual({
      bodyText: 'Texto',
      contractorName: 'Contratante Alfa',
      recipients: preview.recipients,
      subject: 'Assunto',
      suggested: true,
      text: 'Texto\n\n—\nOperadora',
    })
  })

  test('marca como lida pelo id da conversa', async () => {
    const requests: Request[] = []
    const client = createClient(Response.json({ data: { unreadCount: 0 } }), requests)

    await client.markConversationRead({ conversationId: 'conversation-1' })

    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe(`${API_URL}/occurrence-conversations/conversation-1/read`)
  })

  test('o erro da API chega pelo código', async () => {
    const client = createClient(
      Response.json(
        { error: { code: 'CONTRACTOR_MAIL_NOT_CONFIGURED', message: 'x' } },
        { status: 422 },
      ),
    )

    const failure = await client
      .sendContractorMail({
        idempotencyKey: 'occurrence-mail:key-0002',
        occurrenceId: OCCURRENCE_ID,
        request: { body: 'T', channel: 'email', contactIds: ['c'], subject: 'S' },
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(failure).toMatchObject({ code: 'CONTRACTOR_MAIL_NOT_CONFIGURED' })
  })
})

describe('ao motorista pelo app (spec 183 T603)', () => {
  test('envia só o texto e o canal app, com a chave de idempotência', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json(
        { data: { conversationId: 'conversation-2', conversationMessageId: 'message-9' } },
        { status: 202 },
      ),
      requests,
    )

    await client.sendDriverAppMessage({
      body: 'Pode aguardar na doca?',
      idempotencyKey: 'driver-message:key-0001',
      occurrenceId: OCCURRENCE_ID,
    })

    const [request] = requests
    expect(request?.url).toBe(
      `${API_URL}/trip-occurrences/${OCCURRENCE_ID}/conversations/driver/messages`,
    )
    expect(request?.headers.get('idempotency-key')).toBe('driver-message:key-0001')
    expect(await request?.json()).toEqual({ body: 'Pode aguardar na doca?', channel: 'app' })
  })
})
