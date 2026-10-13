/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OutboxEvent } from './conversationOutbox.types'

export type OutboxNotice = 'outbox-full'

/** O aviso de fila cheia fica até algo sair da fila: só então há espaço de novo. */
export function reduceOutboxNotice(
  current: OutboxNotice | undefined,
  event: OutboxEvent,
): OutboxNotice | undefined {
  if (event.type === 'enqueue-refused') return 'outbox-full'
  if (event.type === 'message-settled') return undefined
  return current
}
