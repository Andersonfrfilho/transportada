/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AudioObjectReader, AudioObjectReadParams } from './audio-object-reader.port.js'
import { SPEECH_TO_TEXT_FAILURE_KIND } from './audio-transcription-engine.constant.js'
import { AUDIO_DOWNLOAD_MAX_BYTES } from './audio-transcription-runtime.constant.js'
import { SpeechToTextError } from './speech-to-text.error.js'

type ObjectLocation = { readonly bucket: string; readonly key: string }

type StorageGateway = {
  headObject(location: ObjectLocation): Promise<{ readonly contentLength: number } | undefined>
  getObjectStream(location: ObjectLocation): Promise<ReadableStream<Uint8Array>>
}

const TRANSPORT_FAILURE = {
  code: 'engine_failed',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
} as const
const TIMEOUT_FAILURE = {
  code: 'engine_timeout',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
} as const
const TOO_LARGE_FAILURE = {
  code: 'unsupported_format',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE,
} as const

function failureOfAbort(signal: AbortSignal): SpeechToTextError {
  const isTimeout = signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
  return new SpeechToTextError(isTimeout ? TIMEOUT_FAILURE : TRANSPORT_FAILURE)
}

async function collectBytes(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      if (signal.aborted) throw failureOfAbort(signal)
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > AUDIO_DOWNLOAD_MAX_BYTES) throw new SpeechToTextError(TOO_LARGE_FAILURE)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks)
}

/**
 * O pacote de storage colapsa todo erro do `get` em "indisponível", então a existência vem do `head`
 * (que devolve `undefined` para chave ausente); depois disso, qualquer erro é de transporte.
 */
export function createStorageAudioObjectReader(storage: StorageGateway): AudioObjectReader {
  async function read(params: AudioObjectReadParams): Promise<Uint8Array | undefined> {
    const location = { bucket: params.bucket, key: params.key }
    let stream: ReadableStream<Uint8Array>
    try {
      const head = await storage.headObject(location)
      if (head === undefined) return undefined
      if (head.contentLength > AUDIO_DOWNLOAD_MAX_BYTES)
        throw new SpeechToTextError(TOO_LARGE_FAILURE)
      stream = await storage.getObjectStream(location)
    } catch (error) {
      if (error instanceof SpeechToTextError) throw error
      throw new SpeechToTextError(TRANSPORT_FAILURE)
    }
    try {
      return await collectBytes(stream, params.signal)
    } catch (error) {
      if (error instanceof SpeechToTextError) throw error
      throw new SpeechToTextError(TRANSPORT_FAILURE)
    }
  }

  return { read }
}
