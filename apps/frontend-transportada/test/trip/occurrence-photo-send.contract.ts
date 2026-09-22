/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrencePhotoSendState,
  hasOccurrencePhotoSendFailure,
  isSameOccurrencePhotoQueue,
  markOccurrencePhotoFailed,
  markOccurrencePhotoSending,
  markOccurrencePhotoSent,
  resolveOccurrencePhotoIdempotencyKey,
  resolveOccurrencePhotoSendQueue,
  sendOccurrencePhotosSequentially,
  type OccurrencePhotoSendPort,
} from '../../src/modules/trip/shared/occurrencePhotoSend.service'

const FIVE_PHOTO_IDS = ['photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5'] as const

function buildFakePort(
  input: Readonly<{ failOn?: readonly string[] }> = {},
): OccurrencePhotoSendPort & Readonly<{ attached: string[]; registered: string[] }> {
  const failOn = new Set(input.failOn ?? [])
  const attached: string[] = []
  const registered: string[] = []
  return {
    attached,
    async attach({ photoId }) {
      await Promise.resolve()
      if (failOn.has(photoId)) throw new Error(`ATTACH_FAILED:${photoId}`)
      attached.push(photoId)
    },
    registered,
    async registerFirst({ photoId }) {
      await Promise.resolve()
      if (failOn.has(photoId)) throw new Error(`REGISTER_FAILED:${photoId}`)
      registered.push(photoId)
      return { occurrenceId: 'occurrence-1' }
    },
  }
}

describe('occurrencePhotoSend.service', () => {
  test('estado inicial: todas as fotos nascem pending', () => {
    const state = buildOccurrencePhotoSendState(FIVE_PHOTO_IDS)
    expect(state).toHaveLength(5)
    expect(state.every((item) => item.status === 'pending')).toBe(true)
    expect(resolveOccurrencePhotoSendQueue(state)).toEqual([...FIVE_PHOTO_IDS])
  })

  test('reducers puros: sending, sent e failed só tocam a foto pedida', () => {
    const initial = buildOccurrencePhotoSendState(['photo-1', 'photo-2'])
    const sending = markOccurrencePhotoSending(initial, 'photo-1')
    expect(sending.find((item) => item.photoId === 'photo-1')?.status).toBe('sending')
    expect(sending.find((item) => item.photoId === 'photo-2')?.status).toBe('pending')

    const sent = markOccurrencePhotoSent(sending, 'photo-1')
    expect(sent.find((item) => item.photoId === 'photo-1')?.status).toBe('sent')

    const failed = markOccurrencePhotoFailed(sent, 'photo-2', 'REDE_INDISPONIVEL')
    expect(failed.find((item) => item.photoId === 'photo-2')).toEqual({
      error: 'REDE_INDISPONIVEL',
      photoId: 'photo-2',
      status: 'failed',
    })
    expect(hasOccurrencePhotoSendFailure(failed)).toBe(true)
    expect(hasOccurrencePhotoSendFailure(sent)).toBe(false)
  })

  test('CA16: uma foto por requisição, levando os dois objetos (original + miniatura)', async () => {
    const port = buildFakePort()
    const state = buildOccurrencePhotoSendState(['photo-1', 'photo-2'])
    const sendingLog: string[] = []
    const sentLog: string[] = []

    const result = await sendOccurrencePhotosSequentially({
      occurrenceId: undefined,
      onFailed: () => {
        throw new Error('não deveria falhar')
      },
      onSending: (photoId) => sendingLog.push(photoId),
      onSent: (photoId) => sentLog.push(photoId),
      photoIds: resolveOccurrencePhotoSendQueue(state),
      port,
    })

    // Uma chamada de criação (leva a primeira foto) e uma de anexo (leva a segunda) — nunca as
    // duas fotos numa chamada só.
    expect(port.registered).toEqual(['photo-1'])
    expect(port.attached).toEqual(['photo-2'])
    expect(sendingLog).toEqual(['photo-1', 'photo-2'])
    expect(sentLog).toEqual(['photo-1', 'photo-2'])
    expect(result.occurrenceId).toBe('occurrence-1')
  })

  test('CA16: falha da terceira de cinco preserva as duas anteriores', async () => {
    const port = buildFakePort({ failOn: ['photo-3'] })
    let state = buildOccurrencePhotoSendState(FIVE_PHOTO_IDS)

    const result = await sendOccurrencePhotosSequentially({
      occurrenceId: undefined,
      onFailed: (photoId, error) => {
        state = markOccurrencePhotoFailed(
          state,
          photoId,
          error instanceof Error ? error.message : String(error),
        )
      },
      onSending: (photoId) => {
        state = markOccurrencePhotoSending(state, photoId)
      },
      onSent: (photoId, occurrenceId) => {
        state = markOccurrencePhotoSent(state, photoId)
        expect(occurrenceId).toBe('occurrence-1')
      },
      photoIds: resolveOccurrencePhotoSendQueue(state),
      port,
    })

    // As duas primeiras foram enviadas — a ocorrência foi criada com a primeira e a segunda foi
    // anexada. A terceira falhou; a quarta e a quinta nem chegaram a ser tentadas (sequencial).
    expect(port.registered).toEqual(['photo-1'])
    expect(port.attached).toEqual(['photo-2'])
    expect(state.find((item) => item.photoId === 'photo-1')?.status).toBe('sent')
    expect(state.find((item) => item.photoId === 'photo-2')?.status).toBe('sent')
    expect(state.find((item) => item.photoId === 'photo-3')?.status).toBe('failed')
    expect(state.find((item) => item.photoId === 'photo-4')?.status).toBe('pending')
    expect(state.find((item) => item.photoId === 'photo-5')?.status).toBe('pending')
    expect(result.occurrenceId).toBe('occurrence-1')

    // Reenvio: a fila só traz o que não chegou a `sent` — as duas primeiras não voltam a ser
    // tentadas, nunca "tudo ou nada".
    const retryQueue = resolveOccurrencePhotoSendQueue(state)
    expect(retryQueue).toEqual(['photo-3', 'photo-4', 'photo-5'])

    const retryPort = buildFakePort()
    const retryResult = await sendOccurrencePhotosSequentially({
      occurrenceId: result.occurrenceId,
      onFailed: () => {
        throw new Error('não deveria falhar no reenvio')
      },
      onSending: (photoId) => {
        state = markOccurrencePhotoSending(state, photoId)
      },
      onSent: (photoId) => {
        state = markOccurrencePhotoSent(state, photoId)
      },
      photoIds: retryQueue,
      port: retryPort,
    })

    // No reenvio, a ocorrência já existe — as três fotos restantes vão por anexo, nunca por um
    // segundo registro (o que criaria uma segunda ocorrência).
    expect(retryPort.registered).toEqual([])
    expect(retryPort.attached).toEqual(['photo-3', 'photo-4', 'photo-5'])
    expect(retryResult.occurrenceId).toBe('occurrence-1')
    expect(state.every((item) => item.status === 'sent')).toBe(true)
  })

  test('chave de idempotência: nasce na primeira tentativa e se repete no reenvio da mesma foto', () => {
    let keys: Readonly<Record<string, string>> = {}
    let counter = 0
    const generateKey = () => `key-${++counter}`

    const first = resolveOccurrencePhotoIdempotencyKey(keys, 'photo-1', generateKey)
    keys = first.keys
    expect(first.key).toBe('key-1')

    // Outra foto ganha uma chave própria.
    const second = resolveOccurrencePhotoIdempotencyKey(keys, 'photo-2', generateKey)
    keys = second.keys
    expect(second.key).toBe('key-2')

    // Reenvio da primeira foto: mesma chave, `generateKey` nem é chamado de novo.
    const retry = resolveOccurrencePhotoIdempotencyKey(keys, 'photo-1', generateKey)
    expect(retry.key).toBe('key-1')
    expect(counter).toBe(2)
  })
})

/**
 * B2 (revisão spec 161): reusar a fila por comprimento, não por identidade de `photoId`, fazia um
 * segundo registro com o mesmo número de fotos herdar itens `sent` da fila anterior — o envio de
 * verdade virava no-op silencioso para fotos que nunca tinham ido.
 */
describe('isSameOccurrencePhotoQueue — identidade da fila por photoId, não por comprimento', () => {
  test('mesmo comprimento, fotos diferentes: não é a mesma fila', () => {
    const previousState = buildOccurrencePhotoSendState(['photo-a1', 'photo-a2'])
    expect(isSameOccurrencePhotoQueue(previousState, ['photo-b1', 'photo-b2'])).toBe(false)
  })

  test('mesmo conjunto de photoId (ordem diferente): é a mesma fila', () => {
    const previousState = buildOccurrencePhotoSendState(['photo-a1', 'photo-a2'])
    expect(isSameOccurrencePhotoQueue(previousState, ['photo-a2', 'photo-a1'])).toBe(true)
  })

  test('comprimento diferente: não é a mesma fila', () => {
    const previousState = buildOccurrencePhotoSendState(['photo-a1'])
    expect(isSameOccurrencePhotoQueue(previousState, ['photo-a1', 'photo-a2'])).toBe(false)
  })
})
