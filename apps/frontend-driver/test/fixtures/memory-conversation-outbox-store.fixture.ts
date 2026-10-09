/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ConversationOutboxStore,
  OutboxMessage,
} from '../../src/modules/conversation/shared/conversationOutbox.types'

export function createMemoryOutboxStore(): ConversationOutboxStore {
  const records = new Map<string, OutboxMessage>()
  return {
    put: (message) => {
      records.set(message.clientMessageId, message)
      return Promise.resolve()
    },
    readAll: () => Promise.resolve([...records.values()]),
    remove: (clientMessageId) => {
      records.delete(clientMessageId)
      return Promise.resolve()
    },
  }
}
