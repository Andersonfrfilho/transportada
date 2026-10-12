/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3: a leitura de transcrição das suítes que não tratam de áudio — nenhuma conversa tem
 * transcrição, a empresa vale como ligada (D9).
 */
import type { ConversationTranscriptionReadPort } from '../../src/occurrence-conversation/application/conversation-transcription.port.js'

export const NO_TRANSCRIPTIONS: ConversationTranscriptionReadPort = {
  findTranscriptionsByAttachmentIds: async () => new Map(),
  readAudioTranscriptionEnabled: async () => true,
  readTranscriptionUpdatedAtByConversation: async () => new Map(),
}
