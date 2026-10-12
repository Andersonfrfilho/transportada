/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.2–5.3): a leitura da transcrição de áudio pela conversa por assunto. A API só lê;
 * quem grava é a rotina do worker. Cada método é uma consulta em lote, nunca uma por anexo.
 */
import type { AudioTranscriptionRow } from '../domain/participant-transcription.policy.js'

/** O que se sabe de um anexo de áudio: a duração dele e a linha da rotina, quando existe. */
export type AudioAttachmentTranscriptionFacts = {
  readonly attachmentDurationMs: number | null
  readonly transcription: AudioTranscriptionRow | undefined
}

export type AudioTranscriptionReaderPort = {
  /** Os anexos pedidos, na empresa do contexto; o que não existe lá não volta. */
  findTranscriptionsByAttachmentIds(input: {
    readonly attachmentIds: readonly string[]
    readonly companyId: string
  }): Promise<ReadonlyMap<string, AudioAttachmentTranscriptionFacts>>
  /** Sem linha de configuração, a empresa está ligada. */
  readEnabled(input: { readonly companyId: string }): Promise<boolean>
  /** O `max(updated_at)` das transcrições de cada conversa, numa agregação só; sem transcrição não entra no mapa. */
  readTranscriptionUpdatedAtByConversation(input: {
    readonly companyId: string
    readonly conversationIds: readonly string[]
  }): Promise<ReadonlyMap<string, Date>>
}
