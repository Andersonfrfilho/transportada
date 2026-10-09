/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantPendingMessage } from '@adatechnology/conversations-ui/participant'

import { isRetryDue } from '@/modules/driver-trip/shared/retryBackoff.service'

import { groupBySubject, toPendingMessage } from './conversationOutboxView.service'
import { classifyDeliveryFailure } from './conversationOutboxFailure.service'
import type {
  ConversationOutboxStore,
  EnqueueMessageInput,
  FlushOutboxParams,
  OutboxEvent,
  OutboxMessage,
} from './conversationOutbox.types'
import {
  CONVERSATION_OUTBOX_LOCK_NAME,
  DRIVER_CONVERSATION_ERROR,
} from './driverConversation.constant'
import { DriverConversationRequestError } from './driverConversationsHttp.service'

export type ConversationOutboxDependencies = Readonly<{
  /** `undefined` = sem sessão: nada é lido nem gravado, para não vazar mensagem de outra conta. */
  getOwnerKey: () => string | undefined
  now?: () => Date
  random?: () => number
  /** Uma aba por vez (`navigator.locks`); a outra desiste em vez de enfileirar atrás. */
  runExclusive?: <TResult>(run: () => Promise<TResult>) => Promise<TResult | undefined>
  store: ConversationOutboxStore
}>

export type ConversationOutbox = Readonly<{
  enqueue: (input: EnqueueMessageInput) => Promise<void>
  flush: (params: FlushOutboxParams) => Promise<void>
  listPending: () => Promise<readonly ParticipantPendingMessage[]>
  remove: (clientMessageId: string) => Promise<void>
  requeue: (clientMessageId: string) => Promise<void>
  rememberAttachments: (
    input: Readonly<Pick<OutboxMessage, 'attachments' | 'clientMessageId'>>,
  ) => Promise<void>
  subscribe: (listener: (event: OutboxEvent) => void) => () => void
}>

function runWithTabLock<TResult>(run: () => Promise<TResult>): Promise<TResult | undefined> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return run()
  const granted: Promise<unknown> = navigator.locks.request(
    CONVERSATION_OUTBOX_LOCK_NAME,
    { ifAvailable: true },
    async (lock) => (lock === null ? undefined : run()),
  )
  return granted as Promise<TResult | undefined>
}

export function createConversationOutbox(
  dependencies: ConversationOutboxDependencies,
): ConversationOutbox {
  const { getOwnerKey, store } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const runExclusive = dependencies.runExclusive ?? runWithTabLock
  const listeners = new Set<(event: OutboxEvent) => void>()
  let isFlushing = false

  function emit(event: OutboxEvent): void {
    for (const listener of listeners) listener(event)
  }

  async function readOwned(): Promise<readonly OutboxMessage[]> {
    const ownerKey = getOwnerKey()
    if (ownerKey === undefined) return []
    const all = await store.readAll()
    return all
      .filter((message) => message.ownerKey === ownerKey)
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  /** Relê antes de gravar: quem foi descartado no meio do envio não pode ressuscitar. */
  async function patch(clientMessageId: string, changes: Partial<OutboxMessage>): Promise<void> {
    const current = (await readOwned()).find((item) => item.clientMessageId === clientMessageId)
    if (current === undefined) return
    await store.put({ ...current, ...changes })
    emit({ type: 'pending-changed' })
  }

  async function settle(message: OutboxMessage): Promise<void> {
    await store.remove(message.clientMessageId)
    emit({ type: 'pending-changed' })
    emit({ subject: message.subject, type: 'message-settled' })
  }

  async function attempt(message: OutboxMessage, params: FlushOutboxParams): Promise<boolean> {
    try {
      await params.deliver(message)
    } catch (error) {
      const isRetry = classifyDeliveryFailure(error) === 'retry'
      await patch(message.clientMessageId, {
        attempts: message.attempts + 1,
        lastAttemptAt: now().toISOString(),
        state: isRetry ? 'queued' : 'failed',
      })
      return !isRetry
    }
    await settle(message)
    return true
  }

  /** Em ordem dentro do assunto: rede caída ou backoff pendente seguram as que vêm atrás. */
  async function deliverInOrder(
    messages: readonly OutboxMessage[],
    params: FlushOutboxParams,
  ): Promise<void> {
    const [next, ...rest] = messages
    if (next === undefined) return
    const isDue =
      params.origin === 'immediate' ||
      isRetryDue({ item: next, now: now(), random: dependencies.random })
    if (!isDue) return
    if (await attempt(next, params)) await deliverInOrder(rest, params)
  }

  async function flushOwned(params: FlushOutboxParams): Promise<void> {
    const queued = (await readOwned()).filter((message) => message.state === 'queued')
    await Promise.all(groupBySubject(queued).map((group) => deliverInOrder(group, params)))
  }

  return {
    async enqueue(input) {
      const ownerKey = getOwnerKey()
      if (ownerKey === undefined) {
        throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.OUTBOX_OWNER_MISSING)
      }
      await store.put({
        attachments: input.attachments,
        attempts: 0,
        clientMessageId: input.clientMessageId,
        createdAt: now().toISOString(),
        files: input.files.map((file) => ({
          blob: file,
          name: file.name,
          size: file.size,
          type: file.type,
        })),
        ownerKey,
        state: 'queued',
        subject: input.subject,
        text: input.text,
      })
      emit({ type: 'pending-changed' })
    },
    async flush(params) {
      if (isFlushing) return
      isFlushing = true
      try {
        await runExclusive(() => flushOwned(params))
      } finally {
        isFlushing = false
      }
    },
    async listPending() {
      return (await readOwned()).map(toPendingMessage)
    },
    async remove(clientMessageId) {
      const message = (await readOwned()).find((item) => item.clientMessageId === clientMessageId)
      if (message !== undefined) await settle(message)
    },
    rememberAttachments: (input) =>
      patch(input.clientMessageId, { attachments: input.attachments }),
    requeue: (clientMessageId) =>
      patch(clientMessageId, { attempts: 0, lastAttemptAt: undefined, state: 'queued' }),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
