/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  AudioTranscriptionCycleQueuePort,
  DiscoverAudioTranscriptionsParams,
} from './audio-transcription-queue.port.js'
import { AUDIO_TRANSCRIPTION_MAX_ATTEMPTS } from './audio-transcription-runtime.constant.js'

export type AudioTranscriptionDatabase = ReturnType<typeof createDrizzleProvider>['db']

type CountRow = Readonly<{ total: number | string }>

async function materializeMilestone(database: AudioTranscriptionDatabase): Promise<void> {
  await database.execute(sql`
    insert into company_audio_transcription_settings (company_id, enabled, enabled_since, routine_started_at)
    select c.id, true, now(), now() from companies c
    on conflict (company_id) do nothing
  `)
  await database.execute(sql`
    update company_audio_transcription_settings set routine_started_at = now()
    where routine_started_at is null
  `)
}

async function closeExhausted(database: AudioTranscriptionDatabase): Promise<number> {
  const rows = (await database.execute(sql`
    update occurrence_conversation_audio_transcriptions
    set status = 'failed', failure_code = 'attempts_exhausted', lease_token = null,
        lease_expires_at = null, updated_at = now()
    where status = 'pending' and attempts >= ${AUDIO_TRANSCRIPTION_MAX_ATTEMPTS}::int
      and (lease_expires_at is null or lease_expires_at < now())
    returning id
  `)) as unknown as readonly unknown[]
  return rows.length
}

/**
 * ⚠️ O predicado `content_type like 'audio/%'` é literal, idêntico ao do índice parcial
 * `occurrence_conversation_attachments_audio_created_idx`; com parâmetro o Postgres não prova a
 * implicação e varre a tabela inteira a cada ciclo.
 */
async function discoverPending(
  database: AudioTranscriptionDatabase,
  params: DiscoverAudioTranscriptionsParams,
): Promise<number> {
  const rows = (await database.execute(sql`
    insert into occurrence_conversation_audio_transcriptions (company_id, attachment_id, conversation_id, status)
    select a.company_id, a.id, m.conversation_id, 'pending'
    from occurrence_conversation_attachments a
    join occurrence_conversation_messages m on m.id = a.message_id and m.company_id = a.company_id
    join company_audio_transcription_settings s on s.company_id = a.company_id
    where a.content_type like 'audio/%'
      and s.enabled and s.routine_started_at is not null
      and a.created_at >= greatest(s.enabled_since, s.routine_started_at)
      and a.created_at >= now() - (${params.recoveryWindowHours}::int * interval '1 hour')
    on conflict (company_id, attachment_id) do nothing
    returning id
  `)) as unknown as readonly unknown[]
  return rows.length
}

/** Parte das linhas `ready` com texto (índice parcial `..._purge_idx`) e junta pela chave primária. */
async function purgeDeletedText(database: AudioTranscriptionDatabase): Promise<number> {
  const rows = (await database.execute(sql`
    update occurrence_conversation_audio_transcriptions t
    set text = null, updated_at = now()
    from occurrence_conversation_attachments a, stored_objects o
    where t.status = 'ready' and t.text is not null
      and a.company_id = t.company_id and a.id = t.attachment_id
      and o.id = a.stored_object_id and o.company_id = a.company_id and o.status = 'deleted'
    returning t.id
  `)) as unknown as readonly unknown[]
  return rows.length
}

async function countClaimable(database: AudioTranscriptionDatabase): Promise<number> {
  const rows = (await database.execute(sql`
    select count(*)::int as total from occurrence_conversation_audio_transcriptions
    where status = 'pending' and attempts < ${AUDIO_TRANSCRIPTION_MAX_ATTEMPTS}::int
      and next_attempt_at <= now() and (lease_expires_at is null or lease_expires_at < now())
  `)) as unknown as readonly CountRow[]
  return Number(rows[0]?.total ?? 0)
}

export function createDrizzleAudioTranscriptionCycleQueue(
  database: AudioTranscriptionDatabase,
): AudioTranscriptionCycleQueuePort {
  return {
    closeExhausted: () => closeExhausted(database),
    countClaimable: () => countClaimable(database),
    discoverPending: (params) => discoverPending(database, params),
    materializeMilestone: () => materializeMilestone(database),
    purgeDeletedText: () => purgeDeletedText(database),
  }
}
