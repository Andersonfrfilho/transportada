/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.2–5.3): as leituras em lote da transcrição do áudio. Sempre pela empresa
 * do contexto e pelos ids da página JÁ autorizada — nunca por id vindo do cliente.
 */
import type {
  ParticipantTranscription,
  TranscriptionRowInput,
} from '../domain/participant-transcription.types.js'
import type { ConversationAttachmentView } from './conversation-attachment.port.js'

/** A linha de transcrição com a duração que a medida do worker gravou (reserva da duração do anexo). */
export type AudioTranscriptionRecord = TranscriptionRowInput & {
  readonly audioDurationMs: null | number
}

export type ConversationTranscriptionReadPort = {
  /** Uma consulta por página; o mapa só tem os anexos que já têm linha. */
  findTranscriptionsByAttachmentIds(input: {
    readonly attachmentIds: readonly string[]
    readonly companyId: string
  }): Promise<ReadonlyMap<string, AudioTranscriptionRecord>>
  /**
   * Consulta PRÓPRIA da configuração da empresa: desligada sem nenhuma linha de transcrição ainda é
   * `disabled`. Sem linha de configuração, a empresa vale como ligada (D9).
   */
  readAudioTranscriptionEnabled(input: { readonly companyId: string }): Promise<boolean>
  /** Em lote, o `max(updated_at)` das transcrições por conversa; conversa sem transcrição fica fora do mapa. */
  readTranscriptionUpdatedAtByConversation(input: {
    readonly companyId: string
    readonly conversationIds: readonly string[]
  }): Promise<ReadonlyMap<string, Date>>
}

/** O anexo do assunto: o de sempre e, só se for áudio, `durationMs` e `transcription`. */
export type SubjectAttachmentView = ConversationAttachmentView & {
  readonly durationMs?: number
  readonly transcription?: ParticipantTranscription
}
