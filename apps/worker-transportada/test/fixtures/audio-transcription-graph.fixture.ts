/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Grafo mínimo no Postgres real para a transcrição de áudio (spec 264 T3.3): empresa, conversa por
 * contratante, mensagem e anexo com o objeto no `stored_objects`. O tempo é sempre relativo ao `now()` do banco.
 */
import { createHash } from 'node:crypto'

import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export const AUDIO_FIXTURE_BYTES = new Uint8Array([9, 8, 7, 6, 5])
export const AUDIO_FIXTURE_SHA256 = createHash('sha256').update(AUDIO_FIXTURE_BYTES).digest('hex')

export type SeededCompany = {
  readonly companyId: string
  readonly conversationId: string
  readonly messageId: string
}

export type SeededAudio = {
  readonly attachmentId: string
  readonly objectKey: string
  readonly storedObjectId: string
}

export async function seedCompany(database: Database): Promise<SeededCompany> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const conversationId = crypto.randomUUID()
  const occurrenceId = crypto.randomUUID()
  await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
  await database.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
  await database.execute(
    sql`insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, '11222333000181')`,
  )
  await database.execute(sql`
    insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, contractor_id, public_ref)
    values (${conversationId}, ${companyId}, 'document', ${occurrenceId}, 'contractor', ${contractorId}, ${`ref${crypto.randomUUID().replaceAll('-', '')}`})
  `)
  const messages = (await database.execute(sql`
    insert into occurrence_conversation_messages (company_id, conversation_id, channel, direction, author_user_id, body_text, status, status_times)
    values (${companyId}, ${conversationId}, 'email', 'outbound', ${userId}, 'oi', 'queued', '{}'::jsonb)
    returning id
  `)) as unknown as readonly { id: string }[]
  const messageId = messages[0]?.id
  if (messageId === undefined) throw new Error('message was not seeded')
  return { companyId, conversationId, messageId }
}

type SeedAudioParams = {
  readonly company: SeededCompany
  /** Quanto o anexo é mais velho que o `now()` do banco. */
  readonly ageSeconds: number
  readonly contentType?: string
  readonly objectStatus?: 'deleted' | 'final'
}

export async function seedAudioAttachment(
  database: Database,
  params: SeedAudioParams,
): Promise<SeededAudio> {
  const { company } = params
  const storedObjectId = crypto.randomUUID()
  const objectKey = `tenants/${company.companyId}/audio/${storedObjectId}`
  const isDeleted = params.objectStatus === 'deleted'
  await database.execute(sql`
    insert into stored_objects (id, company_id, provider, bucket, object_key, purpose, mime_type, sha256, size_bytes, status, deleted_at)
    values (${storedObjectId}, ${company.companyId}, 's3', 'bucket', ${objectKey}, 'occurrence_conversation_attachment',
      'audio/webm', ${AUDIO_FIXTURE_SHA256}, ${AUDIO_FIXTURE_BYTES.length}, ${isDeleted ? 'deleted' : 'final'},
      ${isDeleted ? sql`now()` : null})
  `)
  const rows = (await database.execute(sql`
    insert into occurrence_conversation_attachments (company_id, message_id, stored_object_id, sha256, size_bytes, content_type, created_at)
    values (${company.companyId}, ${company.messageId}, ${storedObjectId}, ${AUDIO_FIXTURE_SHA256}, ${AUDIO_FIXTURE_BYTES.length},
      ${params.contentType ?? 'audio/webm'}, now() - (${params.ageSeconds}::int * interval '1 second'))
    returning id
  `)) as unknown as readonly { id: string }[]
  const attachmentId = rows[0]?.id
  if (attachmentId === undefined) throw new Error('attachment was not seeded')
  return { attachmentId, objectKey, storedObjectId }
}

/** A linha de configuração com os marcos escolhidos, relativos ao `now()` do banco (nulo = rotina ainda não viu). */
export async function seedSettings(
  database: Database,
  params: {
    readonly companyId: string
    readonly enabled: boolean
    readonly enabledSinceAgeSeconds: number
    readonly routineStartedAgeSeconds: number | null
  },
): Promise<void> {
  await database.execute(sql`
    insert into company_audio_transcription_settings (company_id, enabled, enabled_since, routine_started_at)
    values (${params.companyId}, ${params.enabled}, now() - (${params.enabledSinceAgeSeconds}::int * interval '1 second'),
      ${params.routineStartedAgeSeconds === null ? null : sql`now() - (${params.routineStartedAgeSeconds}::int * interval '1 second')`})
  `)
}
