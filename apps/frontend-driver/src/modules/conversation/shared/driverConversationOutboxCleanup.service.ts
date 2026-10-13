/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  countOwnedPendingMessages,
  discardConversationOutbox,
  discardOrphanedConversationOutbox,
} from './conversationOutboxDiscard.service'
import { createIndexedDbOutboxStore } from './conversationOutboxStore.service'
import { getDriverConversationOwner } from './driverConversationsApiInstance.service'

/** Mensagens do chat do dono atual que ainda não saíram — o aviso do "Sair" conta com elas. */
export function countCurrentOwnerPendingMessages(): Promise<number> {
  return countOwnedPendingMessages({
    ownerKey: getDriverConversationOwner(),
    store: createIndexedDbOutboxStore(),
  })
}

/** Nunca lança e é idempotente: sem dono conhecido não há o que descartar. */
export async function discardCurrentConversationOutbox(): Promise<void> {
  const ownerKey = getDriverConversationOwner()
  if (ownerKey === undefined) return
  await discardConversationOutbox({ ownerKey, store: createIndexedDbOutboxStore() })
}

/** Boot/login: o que ficou de outra conta neste aparelho sai assim que o dono atual é conhecido. */
export async function discardOrphanedConversationOutboxFor(currentOwnerKey: string): Promise<void> {
  await discardOrphanedConversationOutbox({ currentOwnerKey, store: createIndexedDbOutboxStore() })
}
