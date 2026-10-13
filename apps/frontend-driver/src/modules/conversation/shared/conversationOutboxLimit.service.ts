/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OutboxMessage } from './conversationOutbox.types'
import { CONVERSATION_OUTBOX_LIMIT } from './driverConversation.constant'

type OutboxAdmissionParams = Readonly<{
  incomingFileBytes: number
  queued: readonly OutboxMessage[]
}>

function sumFileBytes(messages: readonly OutboxMessage[]): number {
  return messages.reduce(
    (total, message) => total + message.files.reduce((sum, file) => sum + file.size, 0),
    0,
  )
}

/** Texto entra até `maxCount`; o teto de bytes só vale para quem traz arquivo. */
export function canEnterOutbox({ incomingFileBytes, queued }: OutboxAdmissionParams): boolean {
  if (queued.length >= CONVERSATION_OUTBOX_LIMIT.maxCount) return false
  if (incomingFileBytes === 0) return true
  return sumFileBytes(queued) + incomingFileBytes <= CONVERSATION_OUTBOX_LIMIT.maxFileBytes
}

export function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
}
