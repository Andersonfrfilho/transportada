/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.2–5.3): a leitura da transcrição de áudio no Postgres, sempre pela empresa do
 * contexto e sempre em lote. Uma consulta por assunto da página: a configuração da empresa, as linhas dos
 * anexos (com a duração do anexo, sem junção com mensagens) e o `max(updated_at)` por conversa.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, max } from 'drizzle-orm'

import {
  companyAudioTranscriptionSettings,
  occurrenceConversationAttachments,
  occurrenceConversationAudioTranscriptions,
} from '../../database/database.schema.js'
import type {
  AudioAttachmentTranscriptionFacts,
  AudioTranscriptionReaderPort,
} from '../application/conversation-audio-transcription.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Queryable = Pick<Database, 'select'>

const transcriptions = occurrenceConversationAudioTranscriptions
const attachments = occurrenceConversationAttachments

async function findTranscriptionsByAttachmentIds(
  queryable: Queryable,
  input: Parameters<AudioTranscriptionReaderPort['findTranscriptionsByAttachmentIds']>[0],
): Promise<ReadonlyMap<string, AudioAttachmentTranscriptionFacts>> {
  const facts = new Map<string, AudioAttachmentTranscriptionFacts>()
  if (input.attachmentIds.length === 0) return facts
  const rows = await queryable
    .select({
      attachmentDurationMs: attachments.durationMs,
      attachmentId: attachments.id,
      audioDurationMs: transcriptions.audioDurationMs,
      engine: transcriptions.engine,
      failureCode: transcriptions.failureCode,
      generatedAt: transcriptions.generatedAt,
      language: transcriptions.language,
      maxDurationMs: transcriptions.maxDurationMs,
      status: transcriptions.status,
      text: transcriptions.text,
    })
    .from(attachments)
    .leftJoin(
      transcriptions,
      and(
        eq(transcriptions.companyId, attachments.companyId),
        eq(transcriptions.attachmentId, attachments.id),
      ),
    )
    .where(
      and(
        eq(attachments.companyId, input.companyId),
        inArray(attachments.id, [...input.attachmentIds]),
      ),
    )
  for (const row of rows) {
    facts.set(row.attachmentId, {
      attachmentDurationMs: row.attachmentDurationMs,
      transcription:
        row.status === null
          ? undefined
          : {
              audioDurationMs: row.audioDurationMs,
              engine: row.engine,
              failureCode: row.failureCode,
              generatedAt: row.generatedAt,
              language: row.language,
              maxDurationMs: row.maxDurationMs,
              status: row.status,
              text: row.text,
            },
    })
  }
  return facts
}

async function readEnabled(
  queryable: Queryable,
  input: Parameters<AudioTranscriptionReaderPort['readEnabled']>[0],
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
  input: Parameters<AudioTranscriptionReaderPort['readTranscriptionUpdatedAtByConversation']>[0],
): Promise<ReadonlyMap<string, Date>> {
  const updatedAt = new Map<string, Date>()
  if (input.conversationIds.length === 0) return updatedAt
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
  for (const row of rows) {
    if (row.updatedAt !== null) updatedAt.set(row.conversationId, row.updatedAt)
  }
  return updatedAt
}

export function createDrizzleAudioTranscriptionReader(
  queryable: Queryable,
): AudioTranscriptionReaderPort {
  return {
    findTranscriptionsByAttachmentIds: (input) =>
      findTranscriptionsByAttachmentIds(queryable, input),
    readEnabled: (input) => readEnabled(queryable, input),
    readTranscriptionUpdatedAtByConversation: (input) =>
      readTranscriptionUpdatedAtByConversation(queryable, input),
  }
}
