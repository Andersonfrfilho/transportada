/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  PARTICIPANT_AUDIO_DURATION_MAX_MS,
  participantTranscriptionSchema,
} from '@adatechnology/conversation-contracts'
import { describe, expect, it } from 'bun:test'

import { createConversationRoutes } from '../../scripts/driver-preview-conversations'
import { createConversationRepository } from '../../scripts/driver-preview-conversations-repository'
import { PREVIEW_TRIP_ID } from '../../scripts/driver-preview-conversations-seed'

const BASE = 'http://localhost:53901'
const TRIP_MESSAGES = `/v1/me/trips/current/conversations/trip/${PREVIEW_TRIP_ID}/messages`

type ApiAttachment = {
  contentType: string
  durationMs?: number
  id: string
  transcription?: unknown
}
type ApiMessage = { attachments: ApiAttachment[]; bodyText: string }

function createRoutes() {
  let clock = Date.parse('2026-10-12T12:00:00.000Z')
  const repository = createConversationRepository(() => clock)
  const routes = createConversationRoutes({
    corsHeaders: {},
    officeReplyDelayMs: 0,
    port: 53901,
    repository,
  })
  const call = (
    method: string,
    path: string,
    init?: { body?: object; headers?: Record<string, string> },
  ) =>
    routes(
      new Request(`${BASE}${path}`, {
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        headers: init?.headers ?? {},
        method,
      }),
      new URL(`${BASE}${path}`),
    )
  return {
    advance: (milliseconds: number) => {
      clock += milliseconds
    },
    call,
    repository,
  }
}

async function readAudioMessages(harness: ReturnType<typeof createRoutes>): Promise<ApiMessage[]> {
  const response = await harness.call('GET', TRIP_MESSAGES)
  const { data } = (await response?.json()) as { data: ApiMessage[] }
  return data.filter((message) =>
    message.attachments.some((a) => a.contentType.startsWith('audio/')),
  )
}

async function readTranscriptionUpdatedAt(
  harness: ReturnType<typeof createRoutes>,
): Promise<string | undefined> {
  const response = await harness.call('GET', '/v1/me/trips/current/conversations')
  const { data } = (await response?.json()) as {
    data: { subjectId: string; transcriptionUpdatedAt?: string }[]
  }
  return data.find((item) => item.subjectId === PREVIEW_TRIP_ID)?.transcriptionUpdatedAt
}

const seedAudio = (harness: ReturnType<typeof createRoutes>) =>
  harness.call('POST', '/__debug/conversations/audio-samples', {
    body: { subjectId: PREVIEW_TRIP_ID },
  })

describe('API de demonstração do motorista: áudio e transcrição (spec 264 T4.3)', () => {
  it('audio-samples põe áudio nos quatro estados, no contrato do pacote, com duração', async () => {
    const harness = createRoutes()
    expect((await seedAudio(harness))?.status).toBe(201)

    const attachments = (await readAudioMessages(harness)).flatMap((message) => message.attachments)

    expect(attachments).toHaveLength(4)
    const transcriptions = attachments.map((attachment) =>
      participantTranscriptionSchema.parse(attachment.transcription),
    )
    expect(
      transcriptions.map((t) =>
        t.status === 'ready' ? `ready:${t.text === '' ? 'vazio' : 'texto'}` : t.status,
      ),
    ).toEqual(['pending', 'ready:texto', 'ready:vazio', 'failed'])
    const failed = transcriptions[3]
    expect(failed).toEqual({ maxDurationMs: 600_000, reason: 'too_long', status: 'failed' })
    const ready = transcriptions[1]
    expect(ready?.status === 'ready' && ready.generatedAt.endsWith('Z')).toBe(true)
    for (const attachment of attachments) {
      expect(Number.isInteger(attachment.durationMs)).toBe(true)
      expect(attachment.durationMs).toBeGreaterThan(0)
      expect(attachment.durationMs).toBeLessThanOrEqual(PARTICIPANT_AUDIO_DURATION_MAX_MS)
    }
  })

  it('subjectId desconhecido é 404 e o reset tira os áudios', async () => {
    const harness = createRoutes()
    const unknown = await harness.call('POST', '/__debug/conversations/audio-samples', {
      body: { subjectId: 'nope' },
    })
    expect(unknown?.status).toBe(404)

    await seedAudio(harness)
    await harness.call('POST', '/__debug/conversations/reset')

    expect(await readAudioMessages(harness)).toEqual([])
    expect(await readTranscriptionUpdatedAt(harness)).toBeUndefined()
  })

  it('transcription-ready leva o pending a ready e move transcriptionUpdatedAt no resumo', async () => {
    const harness = createRoutes()
    expect(await readTranscriptionUpdatedAt(harness)).toBeUndefined()
    await seedAudio(harness)
    const seeded = await readTranscriptionUpdatedAt(harness)
    expect(seeded).toBeDefined()

    harness.advance(5000)
    const response = await harness.call('POST', '/__debug/conversations/transcription-ready', {
      body: { subjectId: PREVIEW_TRIP_ID },
    })

    expect(response?.status).toBe(200)
    expect(((await response?.json()) as { data: { count: number } }).data.count).toBe(1)
    const statuses = (await readAudioMessages(harness)).map(
      (message) => (message.attachments[0]?.transcription as { status: string }).status,
    )
    expect(statuses).toEqual(['ready', 'ready', 'ready', 'failed'])
    const after = await readTranscriptionUpdatedAt(harness)
    expect(after).toBeDefined()
    expect(after).not.toBe(seeded)
    expect(Date.parse(after ?? '')).toBeGreaterThan(Date.parse(seeded ?? ''))
  })

  it('sem pending, transcription-ready não muda nada nem o resumo', async () => {
    const harness = createRoutes()
    await seedAudio(harness)
    await harness.call('POST', '/__debug/conversations/transcription-ready', {
      body: { subjectId: PREVIEW_TRIP_ID },
    })
    const before = await readTranscriptionUpdatedAt(harness)
    harness.advance(5000)

    const response = await harness.call('POST', '/__debug/conversations/transcription-ready', {
      body: { subjectId: PREVIEW_TRIP_ID },
    })

    expect(((await response?.json()) as { data: { count: number } }).data.count).toBe(0)
    expect(await readTranscriptionUpdatedAt(harness)).toBe(before)
  })

  it('o áudio enviado pelo motorista (upload em duas etapas) nasce pending e vira ready no debug', async () => {
    const harness = createRoutes()
    const upload = await harness.call(
      'POST',
      `/v1/me/trips/current/conversations/trip/${PREVIEW_TRIP_ID}/uploads`,
      {
        body: { contentType: 'audio/mp4', fileName: 'audio-20261012-101500.m4a', sizeBytes: 4096 },
      },
    )
    const { data } = (await upload?.json()) as { data: { uploadId: string; uploadUrl: string } }
    expect((await harness.call('PUT', new URL(data.uploadUrl).pathname))?.status).toBe(200)

    const sent = await harness.call('POST', TRIP_MESSAGES, {
      body: { attachmentIds: [data.uploadId], body: '' },
      headers: { 'idempotency-key': 'audio-key-1' },
    })

    expect(sent?.status).toBe(201)
    const [message] = await readAudioMessages(harness)
    expect(message?.attachments[0]?.transcription).toEqual({ status: 'pending' })
    expect(await readTranscriptionUpdatedAt(harness)).toBeDefined()
    await harness.call('POST', '/__debug/conversations/transcription-ready', {
      body: { subjectId: PREVIEW_TRIP_ID },
    })
    const [ready] = await readAudioMessages(harness)
    expect((ready?.attachments[0]?.transcription as { status: string }).status).toBe('ready')
  })

  it('a URL do anexo de áudio entrega um áudio que o navegador toca; a de imagem segue PNG', async () => {
    const harness = createRoutes()
    await seedAudio(harness)
    const [message] = await readAudioMessages(harness)
    const audioId = message?.attachments[0]?.id ?? ''

    const audio = await harness.call('GET', `/__conversation-storage/${audioId}`)
    const image = await harness.call('GET', '/__conversation-storage/not-an-audio')

    expect(audio?.headers.get('content-type')).toBe('audio/wav')
    expect(new TextDecoder().decode((await audio?.arrayBuffer())?.slice(0, 4))).toBe('RIFF')
    expect(image?.headers.get('content-type')).toBe('image/png')
  })

  it('o resumo antigo (rota de ocorrência) e as mensagens sem áudio ficam como estavam', async () => {
    const harness = createRoutes()
    await seedAudio(harness)

    const response = await harness.call('GET', '/v1/me/trips/current/occurrence-conversations')
    const { data } = (await response?.json()) as { data: object[] }

    expect(data.every((item) => !('transcriptionUpdatedAt' in item))).toBe(true)
  })
})
