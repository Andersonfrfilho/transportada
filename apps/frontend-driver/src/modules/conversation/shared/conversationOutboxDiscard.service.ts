/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ConversationOutboxStore, OutboxMessage } from './conversationOutbox.types'

export type OutboxDiscardResult =
  | Readonly<{ discardedCount: number; status: 'discarded' }>
  | Readonly<{ status: 'failed' }>

export type SignOutDecision =
  | Readonly<{ step: 'sign-out' }>
  | Readonly<{ chatMessageCount: number; step: 'confirm'; totalCount: number }>

/**
 * LGPD (spec 260 T1b.7): o texto e a foto de uma mensagem não enviada não podem ficar no aparelho
 * depois do "Sair". Falha do IndexedDB nunca lança — "Sair" e login seguem; o chamador só vê `failed`.
 */
async function discardWhere(input: {
  readonly isDiscardable: (message: OutboxMessage) => boolean
  readonly store: ConversationOutboxStore
}): Promise<OutboxDiscardResult> {
  try {
    const targets = (await input.store.readAll()).filter(input.isDiscardable)
    await Promise.all(targets.map((message) => input.store.remove(message.clientMessageId)))
    return { discardedCount: targets.length, status: 'discarded' }
  } catch {
    return { status: 'failed' }
  }
}

export function discardConversationOutbox(input: {
  readonly ownerKey: string
  readonly store: ConversationOutboxStore
}): Promise<OutboxDiscardResult> {
  return discardWhere({
    isDiscardable: (message) => message.ownerKey === input.ownerKey,
    store: input.store,
  })
}

export function discardOrphanedConversationOutbox(input: {
  readonly currentOwnerKey: string
  readonly store: ConversationOutboxStore
}): Promise<OutboxDiscardResult> {
  return discardWhere({
    isDiscardable: (message) => message.ownerKey !== input.currentOwnerKey,
    store: input.store,
  })
}

export async function countOwnedPendingMessages(input: {
  readonly ownerKey: string | undefined
  readonly store: ConversationOutboxStore
}): Promise<number> {
  if (input.ownerKey === undefined) return 0
  try {
    const all = await input.store.readAll()
    return all.filter((message) => message.ownerKey === input.ownerKey).length
  } catch {
    return 0
  }
}

/** Com pendência (eventos ou mensagens) o "Sair" pede confirmação; sem ela, sai direto. */
export async function requestSignOut(input: {
  readonly countChatMessages: () => Promise<number>
  readonly ownEventCount: number
}): Promise<SignOutDecision> {
  const chatMessageCount = await input.countChatMessages()
  const totalCount = input.ownEventCount + chatMessageCount
  if (totalCount === 0) return { step: 'sign-out' }
  return { chatMessageCount, step: 'confirm', totalCount }
}
