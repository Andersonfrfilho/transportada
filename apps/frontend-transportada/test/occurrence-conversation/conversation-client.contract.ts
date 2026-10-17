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

  test('o aviso automático do tipo (autor sem pessoa) é lido, não descartado (spec 183 T802)', async () => {
    const client = createClient(
      Response.json({
        data: {
          conversations: [
            {
              id: 'conversation-1',
              messages: [{ ...OUTBOUND, author: { kind: 'automatic' }, id: 'automatic-1' }],
              participant: 'contractor',
              status: 'open',
              unreadCount: 0,
            },
          ],
        },
      }),
    )

    const { conversations } = await client.listConversations({ occurrenceId: OCCURRENCE_ID })

    expect(conversations[0]?.messages.map((message) => message.author)).toEqual([
      { kind: 'automatic' },
    ])
  })

  /** Spec 267 RF8/RF9: a cópia da mensagem de saída e o responsável que respondeu (interno) são lidos. */
  test('lê a cópia da mensagem de saída e a identidade interna do responsável', async () => {
    const client = createClient(
      Response.json({
        data: {
          conversations: [
            {
              id: 'conversation-1',
              messages: [
                {
                  ...OUTBOUND,
                  copy: [
                    { maskedEmail: 'a***@e***.test', name: 'Ana' },
                    { maskedEmail: 'b***@e***.test', name: null },
                    { broken: true },
                  ],
                  id: 'with-copy',
                },
                {
                  ...OUTBOUND,
                  author: {
                    identity: {
                      arrivedAs: 'ana@empresa.test',
                      kind: 'internal',
                      name: 'Ana',
                      reachedContractor: false,
                      userId: 'user-ana',
                    },
                    kind: 'contractor',
                    userId: null,
                  },
                  direction: 'inbound',
                  id: 'internal-reply',
                  status: null,
                },
              ],
              participant: 'contractor',
              status: 'open',
              unreadCount: 0,
            },
          ],
        },
      }),
    )

    const { conversations } = await client.listConversations({ occurrenceId: OCCURRENCE_ID })
    const [withCopy, internal] = conversations[0]?.messages ?? []

    expect(withCopy?.copy).toEqual([
      { maskedEmail: 'a***@e***.test', name: 'Ana' },
      { maskedEmail: 'b***@e***.test', name: null },
    ])
    expect(internal?.author).toEqual({
      identity: {
        arrivedAs: 'ana@empresa.test',
        kind: 'internal',
        name: 'Ana',
        reachedContractor: false,
        userId: 'user-ana',
      },
      kind: 'contractor',
      userId: null,
    })
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
      notificationTemplateKey: 'ocorrencia.avaria',
      text: 'Texto\n\n—\nOperadora',
    }
    const client = createClient(Response.json({ data: preview }))

    /** Spec 267: API antiga, sem a cópia — a prévia segue legível, com a lista vazia. */
    expect(await client.previewContractorMail({ occurrenceId: OCCURRENCE_ID })).toEqual({
      bodyText: 'Texto',
      cc: [],
      ccSource: null,
      contractorName: 'Contratante Alfa',
      missingNotificationTemplate: false,
      recipients: preview.recipients,
      subject: 'Assunto',
      suggested: true,
      notificationTemplateKey: 'ocorrencia.avaria',
      text: 'Texto\n\n—\nOperadora',
    })
  })

  /** Spec 267 RF4: a cópia efetiva (nome e e-mail mascarado) e de qual lista ela veio. */
  test('a prévia traz a cópia dos responsáveis e a lista de origem; entrada inválida some', async () => {
    const client = createClient(
      Response.json({
        data: {
          bodyText: 'Texto',
          cc: [{ maskedEmail: 'a***@e***.test', name: 'Ana', userId: 'user-ana' }, { broken: 1 }],
          ccSource: 'contractor',
          contractorName: 'Contratante Alfa',
          recipients: [],
          subject: 'Assunto',
          suggested: false,
          text: 'Texto',
        },
      }),
    )

    expect(await client.previewContractorMail({ occurrenceId: OCCURRENCE_ID })).toMatchObject({
      cc: [{ maskedEmail: 'a***@e***.test', name: 'Ana', userId: 'user-ana' }],
      ccSource: 'contractor',
    })
  })

  /** Spec 271 T1.2: a cópia do tipo (`occurrence_type`) e a chave do modelo chegam; `templateId` some sem quebrar. */
  test('a prévia aceita ccSource do tipo e a chave do modelo, sem templateId', async () => {
    const client = createClient(
      Response.json({
        data: {
          bodyText: 'Texto',
          ccSource: 'occurrence_type',
          contractorName: 'Contratante Alfa',
          notificationTemplateKey: 'ocorrencia.avaria',
          recipients: [],
          subject: 'Assunto',
          suggested: true,
          text: 'Texto',
        },
      }),
    )

    expect(await client.previewContractorMail({ occurrenceId: OCCURRENCE_ID })).toMatchObject({
      ccSource: 'occurrence_type',
      notificationTemplateKey: 'ocorrencia.avaria',
    })
  })

  test('a prévia sem modelo efetivo traz a flag; API anterior sem os campos vira "tem modelo"', async () => {
    const base = { bodyText: '', html: '', recipients: [], subject: '', suggested: false, text: '' }
    const missing = createClient(
      Response.json({ data: { ...base, missingNotificationTemplate: true } }),
    )
    const legacy = createClient(Response.json({ data: base }))

    expect(await missing.previewContractorMail({ occurrenceId: OCCURRENCE_ID })).toMatchObject({
      missingNotificationTemplate: true,
      notificationTemplateKey: null,
    })
    expect(await legacy.previewContractorMail({ occurrenceId: OCCURRENCE_ID })).toMatchObject({
      missingNotificationTemplate: false,
      notificationTemplateKey: null,
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
