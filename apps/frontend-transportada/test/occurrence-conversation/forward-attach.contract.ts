/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702d (P7): a foto que o motorista manda pela conversa pode ir à ocorrência ou à
 * contratante. Encaminhar é o envio pelo portal com o anexo do motorista (o objeto é o mesmo); anexar
 * à ocorrência baixa a foto pela URL temporária, reduz pelo mesmo compressor da foto da ocorrência
 * (spec 161) e usa a rota que já existe — com a chave derivada do anexo, o segundo clique não
 * duplica a foto.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import {
  attachConversationPhotoToOccurrence,
  conversationPhotoIdempotencyKey,
  isForwardableToOccurrence,
} from '@/modules/trip/shared/conversationPhotoToOccurrence.service'

const API_URL = 'https://api.example.test'

describe('encaminhar à contratante (spec 183 T702d)', () => {
  test('o envio pelo portal leva os anexos do motorista em forwardAttachmentIds', async () => {
    const requests: Request[] = []
    const client = createOccurrenceConversationClient({
      apiUrl: API_URL,
      fetch: (request) => {
        requests.push(request)
        return Promise.resolve(Response.json({ data: {} }, { status: 202 }))
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })

    await client.sendContractorPortalMessage({
      body: '',
      forwardAttachmentIds: ['attachment-driver-1'],
      idempotencyKey: 'portal-forward:1',
      occurrenceId: 'occurrence-1',
    })

    expect(await requests[0]?.json()).toEqual({
      body: '',
      channel: 'portal',
      forwardAttachmentIds: ['attachment-driver-1'],
    })
  })
})

describe('anexar à ocorrência (spec 183 T702d)', () => {
  const PHOTO = {
    contentType: 'image/jpeg',
    fileName: 'canhoto.jpg',
    id: 'attachment-driver-1',
    sizeBytes: 3_000_000,
    url: 'https://s3.test/occurrence-conversations/token',
  }

  test('só a foto, e só na ocorrência de separação com a nota da viagem', () => {
    const occurrence = { stage: 'separation', tripDocumentId: 'document-1' } as const
    expect(isForwardableToOccurrence(PHOTO, occurrence)).toBe(true)
    expect(
      isForwardableToOccurrence({ ...PHOTO, contentType: 'application/pdf' }, occurrence),
    ).toBe(false)
    expect(isForwardableToOccurrence(PHOTO, { ...occurrence, stage: 'delivery' })).toBe(false)
    expect(isForwardableToOccurrence(PHOTO, { ...occurrence, tripDocumentId: null })).toBe(false)
  })

  test('baixa, reduz e anexa pela rota da spec 161, com a chave do anexo', async () => {
    const calls: unknown[] = []
    const original = new Blob(['jpeg-reduzido'], { type: 'image/jpeg' })
    const thumbnail = new Blob(['miniatura'], { type: 'image/jpeg' })

    const result = await attachConversationPhotoToOccurrence({
      attach: (input) => {
        calls.push(input)
        return Promise.resolve({ id: 'occurrence-attachment-1', position: 2 })
      },
      attachment: PHOTO,
      build: (file) => {
        calls.push({ built: file.name, type: file.type })
        return Promise.resolve({ original, thumbnail })
      },
      download: (url) => {
        calls.push({ downloaded: url })
        return Promise.resolve(new Blob(['bytes-originais'], { type: 'image/jpeg' }))
      },
      occurrence: { occurrenceId: 'occurrence-1', tripDocumentId: 'document-1', tripId: 'trip-1' },
    })

    expect(result).toEqual({ id: 'occurrence-attachment-1', position: 2 })
    expect(calls).toEqual([
      { downloaded: PHOTO.url },
      { built: 'canhoto.jpg', type: 'image/jpeg' },
      {
        documentId: 'document-1',
        file: original,
        idempotencyKey: conversationPhotoIdempotencyKey(PHOTO.id),
        occurrenceId: 'occurrence-1',
        thumbnail,
        tripId: 'trip-1',
      },
    ])
    expect(conversationPhotoIdempotencyKey(PHOTO.id)).toBe(
      conversationPhotoIdempotencyKey(PHOTO.id),
    )
    expect(conversationPhotoIdempotencyKey(PHOTO.id).length).toBeGreaterThanOrEqual(16)
  })

  test('as duas ações aparecem só na foto que o motorista mandou (texto de fonte)', async () => {
    const source = await readFile(
      new URL(
        '../../src/modules/occurrence-conversation/components/OccurrenceConversations.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toMatch(/renderAttachmentActions/u)
    expect(source).toMatch(/message\.direction === 'inbound'/u)
  })
})
