/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: a rota interna que transcreve o áudio do bot do WhatsApp.
 */
import { describe, expect, test } from 'bun:test'

import { SpeechToTextError } from '../src/conversation-audio-transcription/speech-to-text.error.js'
import type { SpeechToText } from '../src/conversation-audio-transcription/speech-to-text.port.js'
import {
  BOT_AUDIO_TRANSCRIPTION_PATH,
  createBotAudioTranscriptionHandler,
} from '../src/http/bot-audio-transcription-request-handler.service.js'
import type { WorkerLogger } from '../src/shared/worker.types.js'

const TOKEN = 'x'.repeat(40)
const server = { timeout: () => undefined }

function createLogger(lines: unknown[]): WorkerLogger {
  const push = (...args: unknown[]) => {
    lines.push(args)
  }
  return { debug: push, error: push, info: push, warn: push } as unknown as WorkerLogger
}

function request(
  init: { body?: Uint8Array<ArrayBuffer>; token?: null | string; type?: string } = {},
) {
  const headers: Record<string, string> = { 'content-type': init.type ?? 'audio/ogg; codecs=opus' }
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? TOKEN}`
  return new Request(`http://worker${BOT_AUDIO_TRANSCRIPTION_PATH}`, {
    body: init.body ?? new Uint8Array([1, 2, 3]),
    headers,
    method: 'POST',
  })
}

describe('bot audio transcription route', () => {
  test('transcribes the audio and answers only the text, never logging it', async () => {
    const lines: unknown[] = []
    const seen: string[] = []
    const speechToText: SpeechToText = {
      transcribe: async ({ audio, mimeType }) => {
        seen.push(`${mimeType}:${audio.length}`)
        return { engine: 'whisper-local', language: 'pt', text: '  prorrogação da nota 17234  ' }
      },
    }
    const handle = createBotAudioTranscriptionHandler({
      logger: createLogger(lines),
      speechToText,
      token: TOKEN,
    })

    const response = await handle(request(), server)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { text: 'prorrogação da nota 17234' } })
    expect(seen).toEqual(['audio/ogg:3'])
    expect(JSON.stringify(lines)).not.toContain('17234')
  })

  test('answers 404 without the token, as if the route did not exist', async () => {
    const handle = createBotAudioTranscriptionHandler({
      logger: createLogger([]),
      speechToText: { transcribe: async () => ({ engine: 'x', language: 'pt', text: 'x' }) },
      token: TOKEN,
    })
    expect((await handle(request({ token: null }), server)).status).toBe(404)
    expect((await handle(request({ token: 'y'.repeat(40) }), server)).status).toBe(404)
  })

  test('refuses what is not audio and empty bodies', async () => {
    const handle = createBotAudioTranscriptionHandler({
      logger: createLogger([]),
      speechToText: { transcribe: async () => ({ engine: 'x', language: 'pt', text: 'x' }) },
      token: TOKEN,
    })
    expect((await handle(request({ type: 'image/jpeg' }), server)).status).toBe(415)
    expect((await handle(request({ body: new Uint8Array() }), server)).status).toBe(400)
  })

  test('engine failure is 502 with the code, and the next request still runs', async () => {
    let calls = 0
    const handle = createBotAudioTranscriptionHandler({
      logger: createLogger([]),
      speechToText: {
        transcribe: async () => {
          calls += 1
          if (calls === 1) {
            throw new SpeechToTextError({ code: 'engine_failed', kind: 'retriable' })
          }
          return { engine: 'x', language: 'pt', text: 'ok' }
        },
      },
      token: TOKEN,
    })
    const failed = await handle(request(), server)
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({
      error: { code: 'TRANSCRIPTION_FAILED', reason: 'engine_failed' },
    })
    expect((await handle(request(), server)).status).toBe(200)
  })

  test('runs one transcription at a time', async () => {
    let running = 0
    let maxRunning = 0
    const handle = createBotAudioTranscriptionHandler({
      logger: createLogger([]),
      speechToText: {
        transcribe: async () => {
          running += 1
          maxRunning = Math.max(maxRunning, running)
          await new Promise((resolve) => setTimeout(resolve, 5))
          running -= 1
          return { engine: 'x', language: 'pt', text: 'ok' }
        },
      },
      token: TOKEN,
    })
    const responses = await Promise.all([1, 2, 3].map(() => handle(request(), server)))
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(maxRunning).toBe(1)
  })
})
