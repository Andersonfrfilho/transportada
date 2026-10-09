/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessage } from '@adatechnology/conversation-contracts'

import {
  CLIENT_MESSAGE_ECHO_MAX_ENTRIES,
  CLIENT_MESSAGE_ECHO_STORAGE_KEY,
} from './driverConversation.constant'

export type ClientMessageIdEchoStorage = Pick<Storage, 'getItem' | 'setItem'>

export type ClientMessageIdEcho = Readonly<{
  decorate: (messages: readonly ParticipantMessage[]) => readonly ParticipantMessage[]
  remember: (input: Readonly<{ clientMessageId: string; serverMessageId: string }>) => void
}>

function readStored(storage: ClientMessageIdEchoStorage | undefined): Map<string, string> {
  try {
    const raw = storage?.getItem(CLIENT_MESSAGE_ECHO_STORAGE_KEY)
    const entries: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw)
    return new Map(
      Array.isArray(entries)
        ? (entries as readonly unknown[]).filter(
            (entry): entry is [string, string] =>
              Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string',
          )
        : [],
    )
  } catch {
    return new Map()
  }
}

function writeStored(
  storage: ClientMessageIdEchoStorage | undefined,
  entries: Map<string, string>,
) {
  try {
    storage?.setItem(CLIENT_MESSAGE_ECHO_STORAGE_KEY, JSON.stringify([...entries]))
  } catch {
    // Sem armazenamento, o mapa vale só nesta aba — a bolha local pode duplicar após recarregar.
  }
}

/**
 * Mapa `idDaMensagemNoServidor → clientMessageId` devolvido pelo POST.
 * // temporário até a API ecoar o clientMessageId (spec 260 T2.4)
 */
export function createClientMessageIdEcho(
  storage?: ClientMessageIdEchoStorage,
): ClientMessageIdEcho {
  const entries = readStored(storage)

  return {
    decorate(messages) {
      return messages.map((message) => {
        const clientMessageId = entries.get(message.id)
        return clientMessageId === undefined ? message : { ...message, clientMessageId }
      })
    },
    remember({ clientMessageId, serverMessageId }) {
      entries.delete(serverMessageId)
      entries.set(serverMessageId, clientMessageId)
      while (entries.size > CLIENT_MESSAGE_ECHO_MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
      writeStored(storage, entries)
    },
  }
}
