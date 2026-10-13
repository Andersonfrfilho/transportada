/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationEvent } from '@adatechnology/conversations-ui/participant'
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import {
  diffConversationSnapshots,
  type ConversationSnapshot,
} from '../../src/modules/conversation/shared/conversationSnapshot.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const SUBJECT = { subjectId: 'occurrence-1', subjectType: 'occurrence' } as const
const GENERATED_AT = '2026-10-12T10:00:00.000Z'

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function createApi(respond: () => Response) {
  return createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http: createDriverConversationHttp({
      baseUrl: 'https://api.test/v1',
      fetch: () => Promise.resolve(respond()),
      getAccessToken: () => Promise.resolve('token'),
    }),
    isOnline: () => true,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
  })
}

const audioAttachment = (extra: Record<string, unknown>) => ({
  contentType: 'audio/webm',
  fileName: 'audio-20261012-100000.webm',
  id: 'audio-1',
  sizeBytes: 2048,
  url: 'https://s3/audio-1',
  ...extra,
})

const messageWith = (attachments: readonly unknown[]) => ({
  attachments,
  authorName: 'Maria',
  bodyText: '',
  createdAt: '2026-10-12T09:59:00.000Z',
  direction: 'outbound',
  id: 'message-1',
  status: 'sent',
})

async function fetchAttachments(attachments: readonly unknown[]) {
  const api = createApi(() => json({ data: [messageWith(attachments)] }))
  const [message] = await api.fetchMessages(SUBJECT)
  return message?.attachments ?? []
}

describe('driverConversationsMapper: transcrição e duração por anexo (spec 264 T4.2)', () => {
  it.each([
    [{ status: 'pending' }],
    [{ generatedAt: GENERATED_AT, status: 'ready', text: 'Cheguei no cliente' }],
    [{ generatedAt: GENERATED_AT, status: 'ready', text: '' }],
    [{ maxDurationMs: 600_000, reason: 'too_long', status: 'failed' }],
    [{ status: 'failed' }],
    [{ status: 'disabled' }],
  ])('transcrição válida passa como veio: %o', async (transcription) => {
    const [attachment] = await fetchAttachments([audioAttachment({ transcription })])

    expect(attachment?.transcription).toEqual(transcription as never)
  })

  it('texto fora de ready é descartado pelo schema, e o status segue', async () => {
    const [attachment] = await fetchAttachments([
      audioAttachment({ transcription: { status: 'pending', text: 'não deve aparecer' } }),
    ])

    expect(attachment?.transcription).toEqual({ status: 'pending' })
  })

  it.each([
    ['status desconhecido', { status: 'queued-for-review' }],
    [
      'texto acima do teto',
      { generatedAt: GENERATED_AT, status: 'ready', text: 'x'.repeat(40_001) },
    ],
    ['generatedAt sem fuso', { generatedAt: '2026-10-12T10:00:00', status: 'ready', text: 'oi' }],
    ['text que não é string', { generatedAt: GENERATED_AT, status: 'ready', text: 42 }],
    ['não é objeto', 'ready'],
  ])('%s: o campo some daquele anexo e a página segue', async (_name, transcription) => {
    const attachments = await fetchAttachments([
      audioAttachment({ transcription }),
      audioAttachment({ id: 'audio-2', transcription: { status: 'pending' } }),
    ])

    expect(attachments).toHaveLength(2)
    expect(attachments[0]).not.toHaveProperty('transcription')
    expect(attachments[1]?.transcription).toEqual({ status: 'pending' })
  })

  it('transcrição nula ou ausente não vira campo', async () => {
    const attachments = await fetchAttachments([
      audioAttachment({ transcription: null }),
      audioAttachment({ id: 'audio-2' }),
    ])

    for (const attachment of attachments) expect(attachment).not.toHaveProperty('transcription')
  })

  it('durationMs válido passa; negativo, zero, fracionário, texto e acima de 24 h somem', async () => {
    const durations = [61_000, -5, 0, 1.5, '61000', 86_400_001]
    const attachments = await fetchAttachments(
      durations.map((durationMs, index) => audioAttachment({ durationMs, id: `audio-${index}` })),
    )

    expect(attachments).toHaveLength(durations.length)
    expect(attachments[0]?.durationMs).toBe(61_000)
    for (const attachment of attachments.slice(1))
      expect(attachment).not.toHaveProperty('durationMs')
  })
})

function snapshotOf(transcriptionUpdatedAt: string | null): ConversationSnapshot {
  return [
    {
      lastMessageAt: 't1',
      officeReadAt: null,
      subject: SUBJECT,
      transcriptionUpdatedAt,
      unreadCount: 0,
    },
  ]
}

describe('snapshot do refresh: transcriptionUpdatedAt (spec 264 T4.2, contract.md §5.3)', () => {
  it('pending -> ready só mexe em transcriptionUpdatedAt e já pede revalidar a conversa', () => {
    const pending = snapshotOf('2026-10-12T10:00:00.000Z')
    const ready = snapshotOf('2026-10-12T10:00:40.000Z')

    expect(diffConversationSnapshots(pending, ready)).toEqual({
      changedSubjects: [SUBJECT],
      inboxChanged: true,
    })
    expect(diffConversationSnapshots(snapshotOf(null), pending).inboxChanged).toBe(true)
    expect(diffConversationSnapshots(ready, ready)).toEqual({
      changedSubjects: [],
      inboxChanged: false,
    })
  })

  it('a transcrição pronta dispara conversation-changed e não vaza para o resumo do pacote; valor ruim é ausente', async () => {
    const server: { transcriptionUpdatedAt?: unknown } = {}
    let timerCallback: (() => void) | undefined
    const events: ParticipantConversationEvent[] = []
    const api = createDriverConversationsApi({
      fallbackSubjectLabel: () => 'Viagem',
      http: createDriverConversationHttp({
        baseUrl: 'https://api.test/v1',
        fetch: () =>
          Promise.resolve(
            json({
              data: [
                {
                  awaitingDriver: false,
                  lastMessageAt: '2026-10-12T09:00:00.000Z',
                  status: 'open',
                  subjectId: 'trip-1',
                  subjectLabel: 'Viagem',
                  subjectType: 'trip',
                  unreadCount: 0,
                  ...('transcriptionUpdatedAt' in server
                    ? { transcriptionUpdatedAt: server.transcriptionUpdatedAt }
                    : {}),
                },
              ],
              pagination: { nextCursor: null },
            }),
          ),
        getAccessToken: () => Promise.resolve('token'),
      }),
      outbox: createConversationOutbox({
        getOwnerKey: () => 'owner-1',
        random: () => 0.5,
        runExclusive: (run) => run(),
        store: createMemoryOutboxStore(),
      }),
      refreshEnvironment: {
        bindTriggers: () => () => undefined,
        isOnline: () => true,
        isVisible: () => true,
        startTimer: (callback) => {
          timerCallback = callback
          return () => undefined
        },
      },
    })
    const unsubscribe = api.subscribe?.((event) => events.push(event))
    server.transcriptionUpdatedAt = 12
    await settle()

    server.transcriptionUpdatedAt = 13
    timerCallback?.()
    await settle()
    expect(events).toEqual([])

    server.transcriptionUpdatedAt = '2026-10-12T10:00:40.000Z'
    timerCallback?.()
    await settle()
    expect(events).toEqual([
      { subject: { subjectId: 'trip-1', subjectType: 'trip' }, type: 'conversation-changed' },
      { type: 'inbox-changed' },
    ])
    expect((await api.listConversations()).data[0]).not.toHaveProperty('transcriptionUpdatedAt')
    unsubscribe?.()
  })
})
