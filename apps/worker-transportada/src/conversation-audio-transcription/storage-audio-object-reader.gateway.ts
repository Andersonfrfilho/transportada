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

/** Rejeita no aborto do sinal, para correr contra qualquer chamada ao storage que possa nunca responder. */
function abortRace(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let onAbort: () => void = () => undefined
  const promise = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(failureOfAbort(signal))
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  promise.catch(() => undefined)
  return { dispose: () => signal.removeEventListener('abort', onAbort), promise }
}

async function collectBytes(
  stream: ReadableStream<Uint8Array>,
  aborted: Promise<never>,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted])
      if (done) break
      total += value.byteLength
      if (total > AUDIO_DOWNLOAD_MAX_BYTES) throw new SpeechToTextError(TOO_LARGE_FAILURE)
      chunks.push(value)
    }
  } finally {
    // O aborto já rejeitou a corrida; cancelar aqui solta o fluxo parado no storage.
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks)
}

async function openStream(
  storage: StorageGateway,
  location: ObjectLocation,
  aborted: Promise<never>,
): Promise<ReadableStream<Uint8Array> | undefined> {
  const head = await Promise.race([storage.headObject(location), aborted])
  if (head === undefined) return undefined
  if (head.contentLength > AUDIO_DOWNLOAD_MAX_BYTES) throw new SpeechToTextError(TOO_LARGE_FAILURE)
  return Promise.race([storage.getObjectStream(location), aborted])
}

/**
 * O pacote de storage colapsa todo erro do `get` em "indisponível", então a existência vem do `head`
 * (que devolve `undefined` para chave ausente); depois disso, qualquer erro é de transporte. Toda chamada
 * corre contra o aborto do sinal (prazo do download ou desligamento): o storage que nunca responde, ou o
 * fluxo que para no meio, vira falha retriável no prazo — nunca `object_missing`.
 */
export function createStorageAudioObjectReader(storage: StorageGateway): AudioObjectReader {
  async function read(params: AudioObjectReadParams): Promise<Uint8Array | undefined> {
    const location = { bucket: params.bucket, key: params.key }
    const race = abortRace(params.signal)
    try {
      if (params.signal.aborted) throw failureOfAbort(params.signal)
      const stream = await openStream(storage, location, race.promise)
      if (stream === undefined) return undefined
      return await collectBytes(stream, race.promise)
    } catch (error) {
      if (error instanceof SpeechToTextError) throw error
      throw new SpeechToTextError(TRANSPORT_FAILURE)
    } finally {
      race.dispose()
    }
  }

  return { read }
}
