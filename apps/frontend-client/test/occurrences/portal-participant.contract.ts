/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 263 T1b.4 (RF13): o portal da contratante é o segundo consumidor da visão do participante —
 * só entrega um `ParticipantConversationsApi`, `subjectGroups` e o canal `portal`.
 */
import { describe, expect, test } from 'bun:test'

import {
  createPortalParticipantApi,
  PORTAL_SUBJECT_GROUPS,
} from '../../src/modules/occurrences/shared/portalParticipantApi.service'
import type { PortalClient } from '../../src/modules/shared/portalClient.service'
import type { Occurrence, PortalConversationMessage } from '../../src/modules/shared/portal.types'

const REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    attachments: [],
    caseStatus: 'open',
    conversationRef: REF,
    conversationUnreadCount: 2,
    decidedAt: null,
    decisionKind: null,
    occurrenceId: 'occ-1',
    occurrenceTypeName: 'Avaria',
    openedAt: '2026-10-01T10:00:00.000Z',
    stage: 'stop',
    ...overrides,
  }
}

function message(overrides: Partial<PortalConversationMessage> = {}): PortalConversationMessage {
  return {
    attachments: [],
    body: 'Bom dia',
    channel: 'portal',
    createdAt: '2026-10-01T10:05:00.000Z',
    mine: false,
    side: 'carrier',
    ...overrides,
  }
}

function fakeClient(overrides: Partial<PortalClient> = {}): PortalClient {
  return {
    listOccurrences: () => Promise.resolve([occurrence(), occurrence({ conversationRef: null })]),
    markConversationRead: () => Promise.resolve(undefined),
    readConversation: () => Promise.resolve({ messages: [message()], unreadCount: 0 }),
    sendConversationMessage: () => Promise.resolve(undefined),
    ...overrides,
  } as unknown as PortalClient
}

describe('o portal como consumidor da visão do participante (spec 263 T1b.4)', () => {
  test('só ocorrência com conversa vira linha da lista, com as não lidas e o canal portal', async () => {
    const page = await createPortalParticipantApi(fakeClient()).listConversations()
    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      awaitingParticipant: true,
      channels: ['portal'],
      subjectId: REF,
      subjectLabel: 'Avaria',
      subjectType: 'occurrence',
      unreadCount: 2,
    })
    expect(PORTAL_SUBJECT_GROUPS.map((group) => group.subjectType)).toEqual(['occurrence'])
  })

  test('as mensagens trocam o lado da transportadora por "recebida" e as minhas por "enviada"', async () => {
    const api = createPortalParticipantApi(
      fakeClient({
        readConversation: () =>
          Promise.resolve({
            messages: [message(), message({ body: 'Ok', mine: true, side: 'contractor' })],
            unreadCount: 0,
          }),
      }),
    )
    const messages = await api.fetchMessages({ subjectId: REF, subjectType: 'occurrence' })
    expect(messages.map((item) => item.direction)).toEqual(['inbound', 'outbound'])
  })

  test('enviar repete a chave de idempotência do pacote e ler marca só aquele assunto', async () => {
    const sent: Array<{ idempotencyKey: string; ref: string; body: string }> = []
    const read: string[] = []
    const api = createPortalParticipantApi(
      fakeClient({
        markConversationRead: (ref) => Promise.resolve(void read.push(ref)),
        sendConversationMessage: (input) => Promise.resolve(void sent.push(input)),
      }),
    )
    const subject = { subjectId: REF, subjectType: 'occurrence' }
    const result = await api.sendMessage({
      clientMessageId: 'abcdefghijklmnop',
      subject,
      text: 'Oi',
    })
    await api.markRead(subject)
    expect(sent).toMatchObject([{ body: 'Oi', idempotencyKey: 'abcdefghijklmnop', ref: REF }])
    expect(read).toEqual([REF])
    expect(result.outcome).toBe('sent')
  })

  test('o anexo é resolvido pela URL assinada que a API já entregou', async () => {
    const api = createPortalParticipantApi(
      fakeClient({
        readConversation: () =>
          Promise.resolve({
            messages: [
              message({
                attachments: [
                  {
                    contentType: 'image/png',
                    fileName: 'a.png',
                    sizeBytes: 10,
                    url: 'https://x/a.png',
                  },
                ],
              }),
            ],
            unreadCount: 0,
          }),
      }),
    )
    const [first] = await api.fetchMessages({ subjectId: REF, subjectType: 'occurrence' })
    const attachment = first?.attachments[0]
    expect(attachment).toBeDefined()
    if (attachment !== undefined) {
      expect(await api.resolveAttachmentUrl(attachment)).toBe('https://x/a.png')
    }
  })
})
