/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'

import type {
  AudioTranscriptionLineQueuePort,
  ClaimedAudioTranscription,
} from './audio-transcription-queue.port.js'
import { AUDIO_TRANSCRIPTION_MAX_ATTEMPTS } from './audio-transcription-runtime.constant.js'
import type { AudioTranscriptionDatabase } from './drizzle-audio-transcription-cycle.repository.js'

type ClaimedRow = Readonly<{
  attachment_id: string
  attempts: number | string
  bucket: string
  company_id: string
  content_type: string
  id: string
  is_company_enabled: boolean
  lease_token: string
  object_key: string
  object_status: string
  sha256: string
}>

function toClaimed(row: ClaimedRow): ClaimedAudioTranscription {
  return {
    attachmentId: row.attachment_id,
    attempts: Number(row.attempts),
    bucket: row.bucket,
    companyId: row.company_id,
    id: row.id,
    isCompanyEnabled: row.is_company_enabled,
    leaseToken: row.lease_token,
    mimeType: row.content_type,
    objectKey: row.object_key,
    objectStatus: row.object_status,
    sha256: row.sha256,
  }
}

/**
 * Uma linha por vez, com `FOR UPDATE SKIP LOCKED`: a reivindicação e a posse (`lease_token`) saem na
 * mesma instrução, e `attempts` sobe aqui — processo morto também gasta tentativa. Toda escrita abaixo
 * exige o `lease_token`: quem perdeu a posse não grava.
 */
export function createDrizzleAudioTranscriptionLineQueue(
  database: AudioTranscriptionDatabase,
): AudioTranscriptionLineQueuePort {
  async function updatedRows(statement: ReturnType<typeof sql>): Promise<boolean> {
    const rows = (await database.execute(statement)) as unknown as readonly unknown[]
    return rows.length > 0
  }

  return {
    async claimNext(params) {
      const rows = (await database.execute(sql`
        with picked as (
          select id from occurrence_conversation_audio_transcriptions
          where status = 'pending' and attempts < ${AUDIO_TRANSCRIPTION_MAX_ATTEMPTS}::int
            and next_attempt_at <= now() and (lease_expires_at is null or lease_expires_at < now())
          order by next_attempt_at limit 1 for update skip locked
        ), claimed as (
          update occurrence_conversation_audio_transcriptions t
          set lease_token = gen_random_uuid(),
              lease_expires_at = now() + (${params.leaseMilliseconds}::int * interval '1 millisecond'),
              attempts = t.attempts + 1
          from picked where t.id = picked.id
          returning t.id, t.company_id, t.attachment_id, t.attempts, t.lease_token
        )
        select c.id, c.company_id, c.attachment_id, c.attempts, c.lease_token,
               a.sha256, a.content_type, o.bucket, o.object_key, o.status as object_status,
               coalesce(s.enabled, true) as is_company_enabled
        from claimed c
        join occurrence_conversation_attachments a on a.company_id = c.company_id and a.id = c.attachment_id
        join stored_objects o on o.id = a.stored_object_id and o.company_id = a.company_id
        left join company_audio_transcription_settings s on s.company_id = c.company_id
      `)) as unknown as readonly ClaimedRow[]
      const row = rows[0]
      return row === undefined ? undefined : toClaimed(row)
    },

    markReady: (params) =>
      updatedRows(sql`
        update occurrence_conversation_audio_transcriptions
        set status = 'ready', text = ${params.text}::text, language = ${params.language}::text,
            engine = ${params.engine}::text, model = ${params.model}::text,
            audio_duration_ms = ${params.audioDurationMs}::int, processing_ms = ${params.processingMs}::int,
            generated_at = now(), failure_code = null, max_duration_ms = null,
            lease_token = null, lease_expires_at = null, updated_at = now()
        where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
        returning id
      `),

    markFailed: (params) =>
      updatedRows(sql`
        update occurrence_conversation_audio_transcriptions
        set status = 'failed', failure_code = ${params.code}::text, text = null,
            audio_duration_ms = coalesce(${params.audioDurationMs}::int, audio_duration_ms),
            max_duration_ms = ${params.maxDurationMs}::int,
            lease_token = null, lease_expires_at = null, updated_at = now()
        where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
        returning id
      `),

    scheduleRetry: (params) =>
      updatedRows(sql`
        update occurrence_conversation_audio_transcriptions
        set next_attempt_at = now() + (${params.delayMilliseconds}::int * interval '1 millisecond'),
            lease_token = null, lease_expires_at = null
        where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
        returning id
      `),

    release: (params) =>
      updatedRows(sql`
        update occurrence_conversation_audio_transcriptions
        set attempts = greatest(attempts - 1, 0), lease_token = null, lease_expires_at = null
        where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
        returning id
      `),
  }
}
