/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ParticipantAttachment,
  ParticipantSubjectRef,
} from '@adatechnology/conversation-contracts'

import type { DrainOrigin } from '@/modules/driver-trip/shared/retryBackoff.service'

export type OutboxFile = Readonly<{ blob: Blob; name: string; size: number; type: string }>

export type OutboxMessageState = 'failed' | 'queued'

/** A mensagem que espera rede: o `clientMessageId` é a `Idempotency-Key` de toda tentativa. */
export type OutboxMessage = Readonly<{
  attempts: number
  /** Anexos já subidos: a próxima tentativa repete os mesmos ids, senão o servidor devolve 409. */
  attachments?: readonly ParticipantAttachment[] | undefined
  clientMessageId: string
  createdAt: string
  files: readonly OutboxFile[]
  lastAttemptAt?: string | undefined
  ownerKey: string
  state: OutboxMessageState
  subject: ParticipantSubjectRef
  text: string
}>

export type ConversationOutboxStore = Readonly<{
  put: (message: OutboxMessage) => Promise<void>
  readAll: () => Promise<readonly OutboxMessage[]>
  remove: (clientMessageId: string) => Promise<void>
}>

export type OutboxEvent =
  | Readonly<{ type: 'pending-changed' }>
  /** A mensagem saiu (entregue) ou foi descartada: a conversa e a lista podem ter mudado. */
  | Readonly<{ subject: ParticipantSubjectRef; type: 'message-settled' }>

export type EnqueueMessageInput = Readonly<{
  attachments?: readonly ParticipantAttachment[] | undefined
  clientMessageId: string
  files: readonly File[]
  subject: ParticipantSubjectRef
  text: string
}>

export type FlushOutboxParams = Readonly<{
  deliver: (message: OutboxMessage) => Promise<void>
  /** `timer` respeita o espaçamento do backoff; `immediate` (rede voltou, abertura, "Reenviar") o ignora. */
  origin: DrainOrigin
}>
