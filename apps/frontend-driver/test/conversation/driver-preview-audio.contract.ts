/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createConversationRoutes } from '../../scripts/driver-preview-conversations'
import {
  PREVIEW_AUDIO_ATTACHMENT_IDS,
  PREVIEW_AUDIO_DOCUMENT_ID,
} from '../../scripts/driver-preview-conversations-audio'
import { createConversationRepository } from '../../scripts/driver-preview-conversations-repository'

const BASE = 'http://localhost:53901'
const AUDIO_ROUTE = `/v1/me/trips/current/conversations/document/${PREVIEW_AUDIO_DOCUMENT_ID}`

type ApiAttachment = { id: string; transcription?: { status: string; text?: string } }

function createRoutes() {
  const repository = createConversationRepository()
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
  return { call, repository }
}

async function readAttachments(call: ReturnType<typeof createRoutes>['call']) {
  const response = await call('GET', `${AUDIO_ROUTE}/messages`)
  const { data } = (await response?.json()) as { data: { attachments: ApiAttachment[] }[] }
  return data.flatMap((message) => message.attachments)
}

async function readSummary(call: ReturnType<typeof createRoutes>['call']) {
  const response = await call('GET', '/v1/me/trips/current/conversations')
  const { data } = (await response?.json()) as {
    data: { subjectId: string; transcriptionUpdatedAt?: string }[]
  }
  return data.find((item) => item.subjectId === PREVIEW_AUDIO_DOCUMENT_ID)
}

describe('API de demonstração do motorista: áudio e transcrição (spec 264 T4.3)', () => {
  it('a conversa de áudio traz um anexo por estado: pending, ready, failed e disabled', async () => {
    const { call } = createRoutes()

    const attachments = await readAttachments(call)

    expect(attachments.map((attachment) => attachment.id)).toEqual([
      PREVIEW_AUDIO_ATTACHMENT_IDS.pending,
      PREVIEW_AUDIO_ATTACHMENT_IDS.ready,
      PREVIEW_AUDIO_ATTACHMENT_IDS.failed,
      PREVIEW_AUDIO_ATTACHMENT_IDS.disabled,
    ])
    const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]))
    expect(byId.get(PREVIEW_AUDIO_ATTACHMENT_IDS.pending)?.transcription).toEqual({
      status: 'pending',
    })
    expect(byId.get(PREVIEW_AUDIO_ATTACHMENT_IDS.ready)?.transcription?.status).toBe('ready')
    expect(byId.get(PREVIEW_AUDIO_ATTACHMENT_IDS.failed)?.transcription).toMatchObject({
      maxDurationMs: 600_000,
      reason: 'too_long',
      status: 'failed',
    })
    expect(byId.get(PREVIEW_AUDIO_ATTACHMENT_IDS.disabled)?.transcription).toEqual({
      status: 'disabled',
    })
  })

  it('o __debug avança pending -> ready e muda o transcriptionUpdatedAt do resumo', async () => {
    let now = Date.parse('2026-10-12T10:00:00.000Z')
    const repository = createConversationRepository(() => now)
    const routes = createConversationRoutes({
      corsHeaders: {},
      officeReplyDelayMs: 0,
      port: 53901,
      repository,
    })
    const call = (method: string, path: string, body?: object) =>
      routes(
        new Request(`${BASE}${path}`, {
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          method,
        }),
        new URL(`${BASE}${path}`),
      )
    const before = (await readSummary(call))?.transcriptionUpdatedAt
    now += 40_000

    const response = await call('POST', '/__debug/conversations/transcription-ready', {})

    expect(await response?.json()).toEqual({ data: { advanced: 1 } })
    const attachments = await readAttachments(call)
    expect(
      attachments.find((item) => item.id === PREVIEW_AUDIO_ATTACHMENT_IDS.pending)?.transcription
        ?.status,
    ).toBe('ready')
    const after = (await readSummary(call))?.transcriptionUpdatedAt
    expect(before).toBeDefined()
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
  })

  it('áudio enviado pelo app nasce pending; imagem enviada não ganha transcrição', async () => {
    const { call } = createRoutes()
    const send = async (contentType: string, key: string) => {
      const upload = await call('POST', `${AUDIO_ROUTE}/uploads`, {
        body: { contentType, fileName: 'a.bin', sizeBytes: 100 },
      })
      const { data } = (await upload?.json()) as { data: { uploadId: string } }
      await call('POST', `${AUDIO_ROUTE}/messages`, {
        body: { attachmentIds: [data.uploadId], body: '' },
        headers: { 'idempotency-key': key },
      })
    }
    await send('audio/webm', 'key-audio')
    await send('image/jpeg', 'key-image')

    const attachments = await readAttachments(call)
    const sent = attachments.slice(-2)

    expect(sent[0]?.transcription).toEqual({ status: 'pending' })
    expect(sent[1]).not.toHaveProperty('transcription')
  })

  it('o arquivo de áudio é um WAV que o navegador toca; a imagem continua PNG', async () => {
    const { call } = createRoutes()

    const audio = await call('GET', `/__conversation-storage/${PREVIEW_AUDIO_ATTACHMENT_IDS.ready}`)
    const image = await call('GET', '/__conversation-storage/qualquer-imagem')

    expect(audio?.headers.get('content-type')).toBe('audio/wav')
    expect(new TextDecoder().decode((await audio?.arrayBuffer())?.slice(0, 4))).toBe('RIFF')
    expect(image?.headers.get('content-type')).toBe('image/png')
  })
})
