/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.4, contra Postgres de verdade: o ciclo da rotina com transcritor, sonda e armazenamento falsos.
 */
import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { buildAudioTranscriptionRuntime } from '../../src/conversation-audio-transcription/build-audio-transcription-runtime.js'
import type { AudioTranscriptionDatabase } from '../../src/conversation-audio-transcription/drizzle-audio-transcription-cycle.repository.js'
import {
  createFixedProbe,
  createInstantTranscriber,
  createLogCapture,
  createMapReader,
} from '../fixtures/audio-transcription-doubles.fixture.js'
import {
  AUDIO_FIXTURE_BYTES,
  seedAudioAttachment,
} from '../fixtures/audio-transcription-graph.fixture.js'
import {
  describeDatabase,
  useAudioIntegrationContext,
  WINDOW_HOURS,
} from './audio-transcription-integration.support.js'

describeDatabase('ciclo completo da transcrição com o executor (spec 264 T3.4)', () => {
  const { database, enabledCompany, rowOf } = useAudioIntegrationContext()

  describe('ciclo completo com o executor (T3.4)', () => {
    test('a new audio is discovered, transcribed by the fake engine and stored; six statements per cycle, two per line', async () => {
      const company = await enabledCompany()
      const audio = await seedAudioAttachment(database, { ageSeconds: 60, company })
      // Sobras de outros testes desta suíte também seriam descobertas: o ciclo é global.
      await database.execute(sql`
        update occurrence_conversation_attachments set content_type = 'application/octet-stream'
        where content_type like 'audio/%' and id <> ${audio.attachmentId}::uuid
      `)
      let statements = 0
      const countingDatabase = {
        execute: (query: never) => {
          statements += 1
          return database.execute(query)
        },
      } as unknown as AudioTranscriptionDatabase
      const logs = createLogCapture()
      const runtime = buildAudioTranscriptionRuntime({
        database: countingDatabase,
        durationProbe: createFixedProbe(3_000),
        environment: {
          batchSize: 2,
          binaryPath: 'whisper-cli',
          language: 'pt',
          maxDurationMilliseconds: 600_000,
          modelPath: '/models/ggml-small-q5_1.bin',
          recoveryWindowHours: WINDOW_HOURS,
          threads: 1,
          timeoutMilliseconds: 300_000,
        },
        logger: logs.logger,
        objectReader: createMapReader({ [audio.objectKey]: AUDIO_FIXTURE_BYTES }),
        speechToText: createInstantTranscriber('olá\u0000 mundo'),
      })
      const result = await runtime.routine.run({
        correlationId: 'c',
        executionId: 'e',
        isStopRequested: () => false,
        job: 'conversation.audio.transcribe',
        origin: 'schedule',
      })
      for (let attempt = 0; attempt < 500 && runtime.runner.isRunning(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(runtime.runner.isRunning()).toBe(false)
      expect(result.outcome).toBe('succeeded')
      // 6 do ciclo (marco 2 + varredura + descoberta + expurgo + contagem), 2 da linha (reivindica + grava)
      // e 1 reivindicação vazia que encerra o laço.
      expect(statements).toBe(6 + 2 + 1)
      expect(await rowOf(audio.attachmentId)).toMatchObject({
        attempts: 1,
        status: 'ready',
        text: 'olá mundo',
      })
      expect(JSON.stringify(logs.lines)).not.toContain('olá')
      const summary = runtime.runner.takeSummary()
      expect(summary).toMatchObject({ processed: expect.any(Number), runnerError: 0 })
    })
  })
})
