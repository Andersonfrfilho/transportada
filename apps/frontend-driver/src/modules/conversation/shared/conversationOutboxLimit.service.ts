/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OutboxMessage } from './conversationOutbox.types'
import { CONVERSATION_OUTBOX_LIMIT, QUOTA_EXCEEDED_ERROR_NAME } from './driverConversation.constant'

export type OutboxRoomParams = Readonly<{
  incomingFiles: readonly File[]
  stored: readonly OutboxMessage[]
}>

function sumBytes(files: readonly Readonly<{ size: number }>[]): number {
  return files.reduce((total, file) => total + file.size, 0)
}

/** Itens valem para toda mensagem; bytes só para a que traz arquivo — o texto nunca é recusado por eles. */
export function hasOutboxRoom({ incomingFiles, stored }: OutboxRoomParams): boolean {
  if (stored.length >= CONVERSATION_OUTBOX_LIMIT.maxCount) return false
  if (incomingFiles.length === 0) return true
  const storedBytes = sumBytes(stored.flatMap((message) => message.files))
  return storedBytes + sumBytes(incomingFiles) <= CONVERSATION_OUTBOX_LIMIT.maxFileBytes
}

export function isQuotaExceeded(error: unknown): boolean {
  return error instanceof Error && error.name === QUOTA_EXCEEDED_ERROR_NAME
}
