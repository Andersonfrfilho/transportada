/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql, type SQL } from 'drizzle-orm'

import type {
  AudioTranscriptionLineKey,
  MarkAudioTranscriptionFailedParams,
  MarkAudioTranscriptionReadyParams,
  ScheduleAudioTranscriptionRetryParams,
} from './audio-transcription-queue.port.js'
import type { AudioTranscriptionDatabase } from './drizzle-audio-transcription-cycle.repository.js'

async function updatedAny(database: AudioTranscriptionDatabase, statement: SQL): Promise<boolean> {
  const rows = (await database.execute(statement)) as unknown as readonly unknown[]
  return rows.length > 0
}

/** `not exists ... not enabled`: empresa sem linha de configuração conta como ligada (padrão do produto). */
export function markAudioTranscriptionReady(
  database: AudioTranscriptionDatabase,
  params: MarkAudioTranscriptionReadyParams,
): Promise<boolean> {
  return updatedAny(
    database,
    sql`
      update occurrence_conversation_audio_transcriptions t
      set status = 'ready', text = ${params.text}::text, language = ${params.language}::text,
          engine = ${params.engine}::text, model = ${params.model}::text,
          audio_duration_ms = ${params.audioDurationMs}::int, processing_ms = ${params.processingMs}::int,
          generated_at = now(), failure_code = null, max_duration_ms = null,
          lease_token = null, lease_expires_at = null, updated_at = now()
      where t.id = ${params.id}::uuid and t.lease_token = ${params.leaseToken}::uuid
        and not exists (
          select 1 from company_audio_transcription_settings s
          where s.company_id = t.company_id and not s.enabled
        )
      returning t.id
    `,
  )
}

export function markAudioTranscriptionFailed(
  database: AudioTranscriptionDatabase,
  params: MarkAudioTranscriptionFailedParams,
): Promise<boolean> {
  return updatedAny(
    database,
    sql`
      update occurrence_conversation_audio_transcriptions
      set status = 'failed', failure_code = ${params.code}::text, text = null,
          audio_duration_ms = coalesce(${params.audioDurationMs}::int, audio_duration_ms),
          max_duration_ms = ${params.maxDurationMs}::int,
          lease_token = null, lease_expires_at = null, updated_at = now()
      where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
      returning id
    `,
  )
}

export function scheduleAudioTranscriptionRetry(
  database: AudioTranscriptionDatabase,
  params: ScheduleAudioTranscriptionRetryParams,
): Promise<boolean> {
  return updatedAny(
    database,
    sql`
      update occurrence_conversation_audio_transcriptions
      set next_attempt_at = now() + (${params.delayMilliseconds}::int * interval '1 millisecond'),
          attempts = case when ${params.shouldGiveBackAttempt}::boolean then greatest(attempts - 1, 0) else attempts end,
          audio_duration_ms = coalesce(${params.audioDurationMs}::int, audio_duration_ms),
          lease_token = null, lease_expires_at = null
      where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
      returning id
    `,
  )
}

export function releaseAudioTranscription(
  database: AudioTranscriptionDatabase,
  params: AudioTranscriptionLineKey,
): Promise<boolean> {
  return updatedAny(
    database,
    sql`
      update occurrence_conversation_audio_transcriptions
      set attempts = greatest(attempts - 1, 0), lease_token = null, lease_expires_at = null
      where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
      returning id
    `,
  )
}
