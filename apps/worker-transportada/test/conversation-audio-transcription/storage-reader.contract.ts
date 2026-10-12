/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (revisão da T3.4, H2/M4): o leitor próprio separa "não existe" (`head` devolve `undefined`) de
 * erro de transporte (lança, retriável), tem teto de bytes e respeita o `AbortSignal` do prazo.
 */
import { describe, expect, test } from 'bun:test'

import { AUDIO_DOWNLOAD_MAX_BYTES } from '../../src/conversation-audio-transcription/audio-transcription-runtime.constant.js'
import { createStorageAudioObjectReader } from '../../src/conversation-audio-transcription/storage-audio-object-reader.gateway.js'

const LOCATION = { bucket: 'b', key: 'k' }
const BYTES = new Uint8Array([1, 2, 3])

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error)
}

describe('storage audio object reader (spec 264 H2/M4)', () => {
  test('reads an existing object', async () => {
    const reader = createStorageAudioObjectReader({
      getObjectStream: async () => streamOf(BYTES, BYTES),
      headObject: async () => ({ contentLength: 6 }),
    })
    const bytes = await reader.read({ ...LOCATION, signal: new AbortController().signal })
    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3, 1, 2, 3])
  })

  test('a key the storage says does not exist is undefined, and the stream is never opened', async () => {
    let opened = false
    const reader = createStorageAudioObjectReader({
      getObjectStream: async () => ((opened = true), streamOf(BYTES)),
      headObject: async () => undefined,
    })
    expect(await reader.read({ ...LOCATION, signal: new AbortController().signal })).toBeUndefined()
    expect(opened).toBe(false)
  })

  test.each([
    [
      'head',
      {
        getObjectStream: async () => streamOf(BYTES),
        headObject: async () => Promise.reject(new Error('503')),
      },
    ],
    [
      'get',
      {
        getObjectStream: async () => Promise.reject(new Error('503')),
        headObject: async () => ({ contentLength: 3 }),
      },
    ],
  ])(
    'a transport error on %s throws a retriable failure instead of becoming "missing"',
    async (_name, storage) => {
      const failure = await failureOf(
        createStorageAudioObjectReader(storage).read({
          ...LOCATION,
          signal: new AbortController().signal,
        }),
      )
      expect(failure).toMatchObject({ code: 'engine_failed', kind: 'retriable' })
    },
  )

  test('an object above the byte ceiling is refused before and while downloading', async () => {
    const declared = createStorageAudioObjectReader({
      getObjectStream: async () => streamOf(BYTES),
      headObject: async () => ({ contentLength: AUDIO_DOWNLOAD_MAX_BYTES + 1 }),
    })
    expect(
      await failureOf(declared.read({ ...LOCATION, signal: new AbortController().signal })),
    ).toMatchObject({ kind: 'definitive' })
    const liar = createStorageAudioObjectReader({
      getObjectStream: async () => streamOf(new Uint8Array(AUDIO_DOWNLOAD_MAX_BYTES + 1)),
      headObject: async () => ({ contentLength: 3 }),
    })
    expect(
      await failureOf(liar.read({ ...LOCATION, signal: new AbortController().signal })),
    ).toMatchObject({ kind: 'definitive' })
  })

  test('an expired download deadline is a retriable engine_timeout', async () => {
    const reader = createStorageAudioObjectReader({
      getObjectStream: async () => streamOf(BYTES),
      headObject: async () => ({ contentLength: 3 }),
    })
    const failure = await failureOf(
      reader.read({
        ...LOCATION,
        signal: AbortSignal.abort(new DOMException('t', 'TimeoutError')),
      }),
    )
    expect(failure).toMatchObject({ code: 'engine_timeout', kind: 'retriable' })
  })
})
