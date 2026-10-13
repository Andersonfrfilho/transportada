/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantPendingMessage } from '@adatechnology/conversations-ui/participant'

import type { OutboxMessage } from './conversationOutbox.types'

export function toPendingMessage(message: OutboxMessage): ParticipantPendingMessage {
  return {
    ...(message.files.length === 0
      ? {}
      : {
          attachments: message.files.map((file) => ({
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          })),
        }),
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
    state: message.state,
    subject: message.subject,
    ...(message.text === '' ? {} : { text: message.text }),
  }
}

export function groupBySubject(
  messages: readonly OutboxMessage[],
): readonly (readonly OutboxMessage[])[] {
  const groups = new Map<string, OutboxMessage[]>()
  for (const message of messages) {
    const key = `${message.subject.subjectType}:${message.subject.subjectId}`
    groups.set(key, [...(groups.get(key) ?? []), message])
  }
  return [...groups.values()]
}
