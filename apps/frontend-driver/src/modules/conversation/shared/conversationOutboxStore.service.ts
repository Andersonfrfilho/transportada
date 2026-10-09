/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ConversationOutboxStore, OutboxMessage } from './conversationOutbox.types'
import {
  CONVERSATION_OUTBOX_DATABASE_NAME,
  CONVERSATION_OUTBOX_STORE_NAME,
} from './driverConversation.constant'

/**
 * Banco próprio, não uma store a mais em `transportada.driver-trip`: subir a versão daquele banco
 * mexeria no esquema da fila de eventos. O `Blob` do anexo mora aqui por clonagem estruturada.
 */
const DATABASE_VERSION = 1
const OUTBOX_OPEN_FAILED = 'DRIVER_CONVERSATION_OUTBOX_OPEN_FAILED'
const OUTBOX_TRANSACTION_FAILED = 'DRIVER_CONVERSATION_OUTBOX_TRANSACTION_FAILED'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONVERSATION_OUTBOX_DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CONVERSATION_OUTBOX_STORE_NAME)) {
        request.result.createObjectStore(CONVERSATION_OUTBOX_STORE_NAME, {
          keyPath: 'clientMessageId',
        })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(OUTBOX_OPEN_FAILED))
  })
}

async function runTransaction<TResult>(input: {
  readonly mode: IDBTransactionMode
  readonly operate: (store: IDBObjectStore) => IDBRequest<TResult>
}): Promise<TResult> {
  const database = await openDatabase()
  return new Promise<TResult>((resolve, reject) => {
    const transaction = database.transaction(CONVERSATION_OUTBOX_STORE_NAME, input.mode)
    const request = input.operate(transaction.objectStore(CONVERSATION_OUTBOX_STORE_NAME))
    transaction.oncomplete = () => {
      resolve(request.result)
      database.close()
    }
    const fail = () => {
      reject(transaction.error ?? new Error(OUTBOX_TRANSACTION_FAILED))
      database.close()
    }
    transaction.onerror = fail
    transaction.onabort = fail
  })
}

export function createIndexedDbOutboxStore(): ConversationOutboxStore {
  return {
    async put(message) {
      await runTransaction({ mode: 'readwrite', operate: (store) => store.put(message) })
    },
    async readAll() {
      const records = await runTransaction({
        mode: 'readonly',
        operate: (store) => store.getAll(),
      })
      return records as readonly OutboxMessage[]
    },
    async remove(clientMessageId) {
      await runTransaction({ mode: 'readwrite', operate: (store) => store.delete(clientMessageId) })
    },
  }
}
