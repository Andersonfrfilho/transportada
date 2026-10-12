/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.3): a escrita mínima da transcrição, base da rotina da Fase 3. Toda escrita
 * que muda o que a API expõe (`status`, `text`, `audio_duration_ms`, `max_duration_ms`, expurgo) grava
 * `updated_at = now()` do BANCO — sem isso o `max(updated_at)` da conversa não muda e o app do motorista
 * não percebe `pending → ready`. A reivindicação (lease e tentativas) não precisa e não passa por aqui.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { occurrenceConversationAudioTranscriptions } from '../../database/database.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const transcriptions = occurrenceConversationAudioTranscriptions

export type InsertPendingTranscriptionParams = {
  readonly attachmentId: string
  readonly companyId: string
  readonly conversationId: string
}

export type ExposedTranscriptionChanges = {
  readonly audioDurationMs?: null | number
  readonly engine?: null | string
  readonly failureCode?: null | string
  readonly generatedAt?: Date | null
  readonly language?: null | string
  readonly maxDurationMs?: null | number
  readonly status?: 'failed' | 'pending' | 'ready'
  readonly text?: null | string
}

export type WriteExposedTranscriptionParams = {
  readonly attachmentId: string
  readonly changes: ExposedTranscriptionChanges
  readonly companyId: string
}

/** Idempotente: a segunda chamada para o mesmo anexo não faz nada. */
export async function insertPendingTranscription(
  database: Pick<Database, 'insert'>,
  params: InsertPendingTranscriptionParams,
): Promise<void> {
  await database
    .insert(transcriptions)
    .values({
      attachmentId: params.attachmentId,
      companyId: params.companyId,
      conversationId: params.conversationId,
      status: 'pending',
    })
    .onConflictDoNothing()
}

export async function writeExposedTranscription(
  database: Pick<Database, 'update'>,
  params: WriteExposedTranscriptionParams,
): Promise<void> {
  await database
    .update(transcriptions)
    .set({ ...params.changes, updatedAt: sql`now()` })
    .where(
      and(
        eq(transcriptions.companyId, params.companyId),
        eq(transcriptions.attachmentId, params.attachmentId),
      ),
    )
}
