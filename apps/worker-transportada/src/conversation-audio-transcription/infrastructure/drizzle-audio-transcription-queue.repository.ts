/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * SQL à mão e parametrizado de propósito: `FOR UPDATE SKIP LOCKED` com `UPDATE … RETURNING` e o
 * predicado literal do índice parcial de áudio não têm forma no construtor do Drizzle. Toda escrita
 * por linha exige o `lease_token`: quem perdeu a posse grava zero linhas e descarta o resultado.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  AudioTranscriptionQueuePort,
  ClaimedTranscription,
} from '../application/audio-transcription-queue.port.js'
import { TRANSCRIPTION_MAX_ATTEMPTS } from '../domain/conversation-audio-transcription.constant.js'

export type AudioTranscriptionDatabase = ReturnType<typeof createDrizzleProvider>['db']

const TRANSCRIPTIONS = sql.raw('occurrence_conversation_audio_transcriptions')

type ClaimedRow = Readonly<{
  attachment_id: string
  attempts: number | string
  bucket: string
  company_id: string
  content_type: string
  conversation_id: string
  duration_ms: null | number | string
  id: string
  lease_token: string
  object_deleted: boolean
  object_key: string
  sha256: string
}>

export function createDrizzleAudioTranscriptionQueue(
  database: AudioTranscriptionDatabase,
): AudioTranscriptionQueuePort {
  async function rows<TRow>(statement: ReturnType<typeof sql>): Promise<readonly TRow[]> {
    return (await database.execute(statement)) as unknown as readonly TRow[]
  }

  return {
    async materializeMarker() {
      await database.execute(sql`
        insert into company_audio_transcription_settings
          (company_id, enabled, enabled_since, routine_started_at, updated_at)
        select c."id", true, now(), now(), now() from companies c
        on conflict (company_id) do nothing
      `)
      await database.execute(sql`
        update company_audio_transcription_settings
        set routine_started_at = now()
        where routine_started_at is null
      `)
    },

    async sweepExhausted() {
      const swept = await rows<{ id: string }>(sql`
        update ${TRANSCRIPTIONS}
        set status = 'failed', failure_code = 'attempts_exhausted', lease_token = null,
            lease_expires_at = null, updated_at = now()
        where status = 'pending'
          and attempts >= ${TRANSCRIPTION_MAX_ATTEMPTS}::int
          and (lease_expires_at is null or lease_expires_at < now())
        returning id
      `)
      return swept.length
    },

    async discoverPending({ recoveryWindowHours }) {
      const created = await rows<{ id: string }>(sql`
        insert into ${TRANSCRIPTIONS} (company_id, attachment_id, conversation_id, status)
        select a."company_id", a."id", m."conversation_id", 'pending'
        from occurrence_conversation_attachments a
        join occurrence_conversation_messages m
          on m."company_id" = a."company_id" and m."id" = a."message_id"
        join company_audio_transcription_settings s on s."company_id" = a."company_id"
        join companies c on c."id" = a."company_id"
        join stored_objects o
          on o."company_id" = a."company_id" and o."id" = a."stored_object_id"
        where a."content_type" like 'audio/%'
          and c."status" = 'active'
          and s."enabled"
          and s."routine_started_at" is not null
          and a."created_at" >= greatest(s."enabled_since", s."routine_started_at")
          and a."created_at" >= now() - make_interval(hours => ${recoveryWindowHours}::int)
          and o."status" <> 'deleted'
          and not exists (
            select 1 from ${TRANSCRIPTIONS} t
            where t."company_id" = a."company_id" and t."attachment_id" = a."id"
          )
        on conflict (company_id, attachment_id) do nothing
        returning id
      `)
      return { created: created.length }
    },

    async countClaimable() {
      const [row] = await rows<{ total: number | string }>(sql`
        select count(*) as total from ${TRANSCRIPTIONS}
        where status = 'pending'
          and attempts < ${TRANSCRIPTION_MAX_ATTEMPTS}::int
          and next_attempt_at <= now()
          and (lease_expires_at is null or lease_expires_at < now())
      `)
      return Number(row?.total ?? 0)
    },

    async claimNext({ leaseMs }) {
      const [row] = await rows<ClaimedRow>(sql`
        with claimed as (
          update ${TRANSCRIPTIONS} t
          set lease_token = gen_random_uuid(),
              lease_expires_at = now() + make_interval(secs => ${Math.ceil(leaseMs / 1000)}::int),
              attempts = t.attempts + 1
          where t."id" = (
            select c."id" from ${TRANSCRIPTIONS} c
            where c."status" = 'pending'
              and c."attempts" < ${TRANSCRIPTION_MAX_ATTEMPTS}::int
              and c."next_attempt_at" <= now()
              and (c."lease_expires_at" is null or c."lease_expires_at" < now())
            order by c."next_attempt_at"
            limit 1
            for update skip locked
          )
          returning t."id", t."company_id", t."attachment_id", t."conversation_id", t."attempts",
                    t."lease_token"
        )
        select claimed."id", claimed."company_id", claimed."attachment_id",
               claimed."conversation_id", claimed."attempts", claimed."lease_token",
               a."sha256", a."content_type", a."duration_ms",
               o."bucket", o."object_key",
               (o."status" = 'deleted' or o."deleted_at" is not null) as object_deleted
        from claimed
        join occurrence_conversation_attachments a
          on a."company_id" = claimed."company_id" and a."id" = claimed."attachment_id"
        join stored_objects o
          on o."company_id" = a."company_id" and o."id" = a."stored_object_id"
      `)
      return row === undefined ? undefined : toClaimed(row)
    },

    async isCompanyEnabled(companyId) {
      const [row] = await rows<{ enabled: boolean }>(sql`
        select coalesce(
          (select s."enabled" from company_audio_transcription_settings s
           where s."company_id" = ${companyId}::uuid),
          true
        ) as enabled
      `)
      return row?.enabled ?? true
    },

    async writeReady(params) {
      return wasWritten(
        await rows<{ id: string }>(sql`
          update ${TRANSCRIPTIONS}
          set status = 'ready', text = ${params.text}, language = ${params.language},
              audio_duration_ms = ${params.durationMs}::int, engine = ${params.engine},
              model = ${params.model}, processing_ms = ${params.processingMs}::int,
              failure_code = null, max_duration_ms = null, generated_at = now(),
              lease_token = null, lease_expires_at = null, updated_at = now()
          where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
          returning id
        `),
      )
    },

    async writeFailed(params) {
      return wasWritten(
        await rows<{ id: string }>(sql`
          update ${TRANSCRIPTIONS}
          set status = 'failed', failure_code = ${params.failureCode}, text = null,
              audio_duration_ms = coalesce(${params.durationMs ?? null}::int, audio_duration_ms),
              max_duration_ms = ${params.maxDurationMs ?? null}::int,
              lease_token = null, lease_expires_at = null, updated_at = now()
          where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
          returning id
        `),
      )
    },

    async scheduleRetry(params) {
      return wasWritten(
        await rows<{ id: string }>(sql`
          update ${TRANSCRIPTIONS}
          set next_attempt_at = now() + make_interval(mins => ${params.backoffMinutes}::int),
              lease_token = null, lease_expires_at = null
          where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
          returning id
        `),
      )
    },

    async writePurged(params) {
      return wasWritten(
        await rows<{ id: string }>(sql`
          update ${TRANSCRIPTIONS}
          set status = 'purged', text = null, lease_token = null, lease_expires_at = null,
              updated_at = now()
          where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
          returning id
        `),
      )
    },

    async release(params) {
      return wasWritten(
        await rows<{ id: string }>(sql`
          update ${TRANSCRIPTIONS}
          set attempts = greatest(attempts - 1, 0), lease_token = null, lease_expires_at = null
          where id = ${params.id}::uuid and lease_token = ${params.leaseToken}::uuid
            and status = 'pending'
          returning id
        `),
      )
    },

    async purgeDeletedObjects() {
      const purged = await rows<{ id: string }>(sql`
        update ${TRANSCRIPTIONS} t
        set status = 'purged', text = null, generated_at = null, updated_at = now()
        from occurrence_conversation_attachments a, stored_objects o
        where t."status" = 'ready'
          and a."company_id" = t."company_id" and a."id" = t."attachment_id"
          and o."company_id" = a."company_id" and o."id" = a."stored_object_id"
          and (o."status" = 'deleted' or o."deleted_at" is not null)
        returning t."id"
      `)
      return purged.length
    },
  }
}

function wasWritten(written: readonly unknown[]): boolean {
  return written.length > 0
}

function toClaimed(row: ClaimedRow): ClaimedTranscription {
  const declared = row.duration_ms === null ? null : Number(row.duration_ms)
  return {
    attachmentId: row.attachment_id,
    attempts: Number(row.attempts),
    bucket: row.bucket,
    companyId: row.company_id,
    contentType: row.content_type,
    conversationId: row.conversation_id,
    declaredDurationMs: declared !== null && declared > 0 ? declared : null,
    id: row.id,
    leaseToken: row.lease_token,
    objectDeleted: row.object_deleted,
    objectKey: row.object_key,
    sha256: row.sha256,
  }
}
