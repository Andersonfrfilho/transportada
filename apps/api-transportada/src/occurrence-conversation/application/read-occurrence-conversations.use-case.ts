/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF6/RF15: ler as conversas de uma ocorrência e marcar uma como lida. Marcar como lida é
 * registro **do usuário**: nada volta à contratante nem ao motorista (a confirmação de leitura que
 * eles veem é a do canal, RF14).
 */
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { OccurrenceConversationNotFoundError } from '../domain/occurrence-conversation.error.js'
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
}): ListOccurrenceConversationsUseCase {
  return {
    async list(input) {
      const view = await dependencies.reader.findConversations(input)
      if (view === null) throw new TripOccurrenceNotFoundError()
      return view
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
