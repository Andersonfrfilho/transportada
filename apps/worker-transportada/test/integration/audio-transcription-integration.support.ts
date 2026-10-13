/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Contexto comum das suítes de integração da transcrição de áudio (spec 264): banco, filas reais e
 * semeadores. A tabela é só destas suítes neste banco dedicado, e a reivindicação é global, então cada
 * teste parte dela vazia.
 */
import { beforeEach, describe } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import {
  createDrizzleAudioTranscriptionCycleQueue,
  type AudioTranscriptionDatabase,
} from '../../src/conversation-audio-transcription/drizzle-audio-transcription-cycle.repository.js'
import { createDrizzleAudioTranscriptionLineQueue } from '../../src/conversation-audio-transcription/drizzle-audio-transcription-line.repository.js'
import {
  seedCompany,
  seedSettings,
  type SeededCompany,
} from '../fixtures/audio-transcription-graph.fixture.js'

export const databaseUrl = process.env.DATABASE_URL
export const describeDatabase = databaseUrl ? describe : describe.skip

export const HOUR = 3_600
export const LEASE_MS = 495_000
export const WINDOW_HOURS = 72

export type TranscriptionRow = {
  readonly attempts: number
  readonly failure_code: string | null
  readonly generated_at: Date | null
  readonly lease_token: string | null
  readonly max_duration_ms: number | null
  readonly next_attempt_in_seconds: number
  readonly status: string
  readonly text: string | null
  readonly updated_at: Date
}

export type AudioIntegrationContext = {
  readonly database: AudioTranscriptionDatabase
  readonly cycleQueue: ReturnType<typeof createDrizzleAudioTranscriptionCycleQueue>
  readonly lineQueue: ReturnType<typeof createDrizzleAudioTranscriptionLineQueue>
  rowOf(attachmentId: string): Promise<TranscriptionRow | undefined>
  insertPending(
    company: SeededCompany,
    attachmentId: string,
    set?: ReturnType<typeof sql>,
  ): Promise<void>
  enabledCompany(overrides?: { routineStartedAgeSeconds?: number | null }): Promise<SeededCompany>
  /** `updated_at` volta um minuto: `now()` tem µs e o `Date` trunca em ms, então comparar estrito no mesmo ms oscila. */
  backdateUpdatedAt(attachmentId: string): Promise<void>
}

/** Chamar dentro do `describe`: registra o `beforeEach` que esvazia a tabela. */
export function useAudioIntegrationContext(): AudioIntegrationContext {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const database = provider.db as AudioTranscriptionDatabase

  beforeEach(async () => {
    await database.execute(sql`delete from occurrence_conversation_audio_transcriptions`)
  })

  async function rowOf(attachmentId: string): Promise<TranscriptionRow | undefined> {
    const rows = (await database.execute(sql`
      select attempts, failure_code, generated_at, lease_token, max_duration_ms, status, text, updated_at,
             extract(epoch from (next_attempt_at - now()))::int as next_attempt_in_seconds
      from occurrence_conversation_audio_transcriptions where attachment_id = ${attachmentId}::uuid
    `)) as unknown as readonly TranscriptionRow[]
    return rows[0]
  }

  async function insertPending(company: SeededCompany, attachmentId: string, set = sql``) {
    await database.execute(sql`
      insert into occurrence_conversation_audio_transcriptions (company_id, attachment_id, conversation_id, status)
      values (${company.companyId}, ${attachmentId}, ${company.conversationId}, 'pending')
    `)
    if (set.queryChunks.length > 0) {
      await database.execute(
        sql`update occurrence_conversation_audio_transcriptions set ${set} where attachment_id = ${attachmentId}::uuid`,
      )
    }
  }

  async function enabledCompany(overrides: { routineStartedAgeSeconds?: number | null } = {}) {
    const company = await seedCompany(database)
    await seedSettings(database, {
      companyId: company.companyId,
      enabled: true,
      enabledSinceAgeSeconds: 10 * HOUR,
      routineStartedAgeSeconds: overrides.routineStartedAgeSeconds ?? 10 * HOUR,
    })
    return company
  }

  async function backdateUpdatedAt(attachmentId: string) {
    await database.execute(sql`
      update occurrence_conversation_audio_transcriptions set updated_at = now() - interval '1 minute'
      where attachment_id = ${attachmentId}::uuid
    `)
  }

  return {
    backdateUpdatedAt,
    cycleQueue: createDrizzleAudioTranscriptionCycleQueue(database),
    database,
    enabledCompany,
    insertPending,
    lineQueue: createDrizzleAudioTranscriptionLineQueue(database),
    rowOf,
  }
}
