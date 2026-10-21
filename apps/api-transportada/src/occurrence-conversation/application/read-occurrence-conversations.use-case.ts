/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF6/RF15: ler as conversas de uma ocorrência e marcar uma como lida. Marcar como lida é
 * registro **do usuário**: nada volta à contratante nem ao motorista (a confirmação de leitura que
 * eles veem é a do canal, RF14).
 *
 * O áudio sai com `durationMs` e `transcription` pela mesma etapa da 264 (`enrichAudioAttachments`): o chat da
 * ocorrência no painel é o `ConversationThread` do SDK, que mostra, copia e baixa o que foi dito. Só esta leitura do
 * escritório; o app antigo e o portal seguem com o anexo de cinco campos.
 */
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { OccurrenceConversationNotFoundError } from '../domain/occurrence-conversation.error.js'
import { enrichAudioAttachments } from './conversation-audio-enrichment.service.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import { signConversationAttachments } from './conversation-attachment.service.js'
import type { ConversationTranscriptionReadPort } from './conversation-transcription.port.js'
import type {
  OccurrenceConversationReaderPort,
  OccurrenceConversationReadWriterPort,
  OccurrenceConversationsView,
} from './occurrence-conversation.port.js'

type Scope = { readonly companyId: string; readonly userId: string }

export type ListOccurrenceConversationsUseCase = Readonly<{
  list: (input: Scope & { readonly occurrenceId: string }) => Promise<OccurrenceConversationsView>
}>

export type MarkOccurrenceConversationReadUseCase = Readonly<{
  markRead: (
    input: Scope & { readonly conversationId: string },
  ) => Promise<{ readonly unreadCount: number }>
}>

export function createListOccurrenceConversationsUseCase(dependencies: {
  readonly reader: OccurrenceConversationReaderPort
  readonly storage: Pick<ConversationAttachmentStoragePort, 'createSignedDownload'>
  readonly transcriptions: Pick<
    ConversationTranscriptionReadPort,
    'findTranscriptionsByAttachmentIds' | 'readAudioTranscriptionEnabled'
  >
}): ListOccurrenceConversationsUseCase {
  return {
    async list(input) {
      const view = await dependencies.reader.findConversations(input)
      if (view === null) throw new TripOccurrenceNotFoundError()
      /** Spec 183 T702a: os anexos numa leitura só, assinados por mensagem. */
      const records = await dependencies.reader.findAttachments({
        companyId: input.companyId,
        messageIds: view.conversations.flatMap((conversation) =>
          conversation.messages.map((message) => message.id),
        ),
      })
      const signed = await enrichAudioAttachments({
        companyId: input.companyId,
        reader: dependencies.transcriptions,
        records,
        views: await signConversationAttachments(dependencies.storage, records),
      })
      return {
        ...view,
        conversations: view.conversations.map((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => ({
            ...message,
            attachments: signed.get(message.id) ?? [],
          })),
        })),
      }
    },
  }
}

export function createMarkOccurrenceConversationReadUseCase(dependencies: {
  readonly writer: OccurrenceConversationReadWriterPort
}): MarkOccurrenceConversationReadUseCase {
  return {
    async markRead(input) {
      const found = await dependencies.writer.markRead(input)
      if (!found) throw new OccurrenceConversationNotFoundError()
      return { unreadCount: 0 }
    },
  }
}
