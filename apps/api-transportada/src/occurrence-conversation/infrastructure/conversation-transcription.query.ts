/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.2–5.3): as leituras em lote da transcrição, cada uma UMA consulta por página,
 * sem junção — a `transcriptionUpdatedAt` usa o `conversation_id` desnormalizado e o índice
 * `(company_id, conversation_id, updated_at)`. Tudo pela empresa do contexto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, max } from 'drizzle-orm'

import {
  companyAudioTranscriptionSettings,
  occurrenceConversationAudioTranscriptions,
} from '../../database/database.schema.js'
import type {
  AudioTranscriptionRecord,
  ConversationTranscriptionReadPort,
} from '../application/conversation-transcription.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Queryable = Pick<Database, 'select'>

async function findTranscriptionsByAttachmentIds(
  queryable: Queryable,
  input: Parameters<ConversationTranscriptionReadPort['findTranscriptionsByAttachmentIds']>[0],
): Promise<ReadonlyMap<string, AudioTranscriptionRecord>> {
  if (input.attachmentIds.length === 0) return new Map()
  const transcriptions = occurrenceConversationAudioTranscriptions
  const rows = await queryable
    .select({
      attachmentId: transcriptions.attachmentId,
      audioDurationMs: transcriptions.audioDurationMs,
      engine: transcriptions.engine,
      failureCode: transcriptions.failureCode,
      generatedAt: transcriptions.generatedAt,
      language: transcriptions.language,
      maxDurationMs: transcriptions.maxDurationMs,
      status: transcriptions.status,
      text: transcriptions.text,
    })
    .from(transcriptions)
    .where(
      and(
        eq(transcriptions.companyId, input.companyId),
        inArray(transcriptions.attachmentId, [...input.attachmentIds]),
      ),
    )
  return new Map(rows.map(({ attachmentId, ...record }) => [attachmentId, record]))
}

/** Sem linha de configuração a empresa vale como ligada (D9); a consulta é própria, sem junção com as linhas. */
async function readAudioTranscriptionEnabled(
  queryable: Queryable,
  input: Parameters<ConversationTranscriptionReadPort['readAudioTranscriptionEnabled']>[0],
): Promise<boolean> {
  const [row] = await queryable
    .select({ enabled: companyAudioTranscriptionSettings.enabled })
    .from(companyAudioTranscriptionSettings)
    .where(eq(companyAudioTranscriptionSettings.companyId, input.companyId))
    .limit(1)
  return row?.enabled ?? true
}

async function readTranscriptionUpdatedAtByConversation(
  queryable: Queryable,
  input: Parameters<
    ConversationTranscriptionReadPort['readTranscriptionUpdatedAtByConversation']
  >[0],
): Promise<ReadonlyMap<string, Date>> {
  if (input.conversationIds.length === 0) return new Map()
  const transcriptions = occurrenceConversationAudioTranscriptions
  const rows = await queryable
    .select({
      conversationId: transcriptions.conversationId,
      updatedAt: max(transcriptions.updatedAt),
    })
    .from(transcriptions)
    .where(
      and(
        eq(transcriptions.companyId, input.companyId),
        inArray(transcriptions.conversationId, [...input.conversationIds]),
      ),
    )
    .groupBy(transcriptions.conversationId)
  const latest = new Map<string, Date>()
  for (const row of rows) {
    if (row.updatedAt !== null) latest.set(row.conversationId, row.updatedAt)
  }
  return latest
}

export function createConversationTranscriptionReadPort(
  queryable: Queryable,
): ConversationTranscriptionReadPort {
  return {
    findTranscriptionsByAttachmentIds: (input) =>
      findTranscriptionsByAttachmentIds(queryable, input),
    readAudioTranscriptionEnabled: (input) => readAudioTranscriptionEnabled(queryable, input),
    readTranscriptionUpdatedAtByConversation: (input) =>
      readTranscriptionUpdatedAtByConversation(queryable, input),
  }
}
