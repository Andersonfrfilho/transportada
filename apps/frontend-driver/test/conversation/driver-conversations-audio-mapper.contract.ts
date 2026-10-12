/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessage } from '@adatechnology/conversation-contracts'
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const SUBJECT = { subjectId: 'trip-1', subjectType: 'trip' } as const

function rawAudio(overrides: Record<string, unknown> = {}) {
  return {
    contentType: 'audio/mp4',
    fileName: 'audio.m4a',
    id: 'attachment-1',
    sizeBytes: 2048,
    url: 'https://bucket.test/audio.m4a',
    ...overrides,
  }
}

async function fetchAudioMessage(attachment: unknown): Promise<ParticipantMessage> {
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Viagem',
    http: createDriverConversationHttp({
      baseUrl: 'https://api.test/v1',
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attachments: [attachment],
                  bodyText: 'Ouça',
                  createdAt: '2026-10-12T10:00:00.000Z',
                  direction: 'inbound',
                  id: 'message-1',
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      getAccessToken: () => Promise.resolve('token'),
    }),
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
  })
  const messages = await api.fetchMessages(SUBJECT)
  const [message] = messages
  if (message === undefined) throw new Error('expected one message')
  return message
}

const READY = {
  engine: 'whisper-local',
  generatedAt: '2026-10-12T14:03:22.114Z',
  language: 'pt',
  status: 'ready',
  text: 'chego na portaria em dez minutos',
} as const

describe('adapter do motorista: duração e transcrição do áudio (spec 264 T4.2)', () => {
  it.each([
    ['pending', { status: 'pending' }],
    ['ready com texto', READY],
    ['ready vazio', { ...READY, text: '' }],
    ['failed too_long', { maxDurationMs: 600_000, reason: 'too_long', status: 'failed' }],
    ['disabled', { status: 'disabled' }],
  ])('passa o estado válido %s com a duração', async (_name, transcription) => {
    const message = await fetchAudioMessage(rawAudio({ durationMs: 65_000, transcription }))

    expect(message.attachments[0]).toMatchObject({ durationMs: 65_000, kind: 'audio' })
    expect(message.attachments[0]?.transcription).toMatchObject(transcription)
  })

  it('anexo sem os campos novos segue como antes', async () => {
    const message = await fetchAudioMessage(rawAudio())

    expect(message.attachments[0]).toEqual({
      filename: 'audio.m4a',
      id: 'attachment-1',
      kind: 'audio',
      mimeType: 'audio/mp4',
      sizeBytes: 2048,
    })
  })

  it.each([
    ['malformada (string)', 'pronto'],
    ['malformada (array)', ['ready']],
    ['status desconhecido', { status: 'queued-for-review' }],
    ['text objeto', { ...READY, text: { value: 'x' } }],
    ['text número', { ...READY, text: 7 }],
    ['language null', { ...READY, language: null }],
    ['generatedAt com offset', { ...READY, generatedAt: '2026-10-12T14:03:22+03:00' }],
    ['generatedAt sem fuso', { ...READY, generatedAt: '2026-10-12T14:03:22' }],
    ['text acima do teto', { ...READY, text: 'a'.repeat(40_001) }],
  ])(
    'transcrição %s some e só o player fica, com a mensagem intacta',
    async (_name, transcription) => {
      const message = await fetchAudioMessage(rawAudio({ durationMs: 65_000, transcription }))

      expect(message.text).toBe('Ouça')
      expect(message.attachments).toHaveLength(1)
      expect(message.attachments[0]).toMatchObject({ durationMs: 65_000, id: 'attachment-1' })
      expect(message.attachments[0]).not.toHaveProperty('transcription')
    },
  )

  it.each([
    ['string', '65000'],
    ['negativa', -1],
    ['zero', 0],
    ['fracionária', 1.5],
    ['acima do teto', 86_400_001],
    ['nula', null],
    ['NaN', Number.NaN],
  ])('durationMs %s some, a transcrição válida e o resto ficam', async (_name, durationMs) => {
    const message = await fetchAudioMessage(
      rawAudio({ durationMs, transcription: { status: 'pending' } }),
    )

    expect(message.attachments[0]).not.toHaveProperty('durationMs')
    expect(message.attachments[0]?.transcription).toEqual({ status: 'pending' })
    expect(message.text).toBe('Ouça')
  })

  it('um anexo inválido não leva o outro anexo da mesma mensagem', async () => {
    const api = createDriverConversationsApi({
      fallbackSubjectLabel: () => 'Viagem',
      http: createDriverConversationHttp({
        baseUrl: 'https://api.test/v1',
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                data: [
                  {
                    attachments: [
                      rawAudio({ id: 'a', transcription: { status: 'unknown' } }),
                      rawAudio({ id: 'b', transcription: { status: 'pending' } }),
                    ],
                    createdAt: '2026-10-12T10:00:00.000Z',
                    direction: 'inbound',
                    id: 'message-1',
                  },
                ],
              }),
              { status: 200 },
            ),
          ),
        getAccessToken: () => Promise.resolve('token'),
      }),
      outbox: createConversationOutbox({
        getOwnerKey: () => 'owner-1',
        runExclusive: (run) => run(),
        store: createMemoryOutboxStore(),
      }),
    })

    const [message] = await api.fetchMessages(SUBJECT)

    expect(message?.attachments.map((attachment) => attachment.transcription)).toEqual([
      undefined,
      { status: 'pending' },
    ])
  })

  it('transcrição em anexo que não é áudio também passa pela mesma guarda', async () => {
    const message = await fetchAudioMessage(
      rawAudio({ contentType: 'image/jpeg', transcription: { status: 'bogus' } }),
    )

    expect(message.attachments[0]).toMatchObject({ kind: 'image' })
    expect(message.attachments[0]).not.toHaveProperty('transcription')
  })
})
