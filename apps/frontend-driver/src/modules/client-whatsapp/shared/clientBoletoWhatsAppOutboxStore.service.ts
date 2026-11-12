/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ClientBoletoWhatsAppOutboxStore } from './clientBoletoWhatsApp.types'

/**
 * Banco próprio, como o da fila de mensagens: subir a versão de `transportada.driver-trip` mexeria no esquema
 * da fila de eventos. Só texto e ids — o endereço novo digitado fica no aparelho até a fila entregar.
 */
const DATABASE_NAME = 'transportada.driver-client-whatsapp-outbox'
const STORE_NAME = 'client-whatsapp-sends'
const DATABASE_VERSION = 1
const OPEN_FAILED = 'CLIENT_BOLETO_WHATSAPP_OUTBOX_OPEN_FAILED'
const TRANSACTION_FAILED = 'CLIENT_BOLETO_WHATSAPP_OUTBOX_TRANSACTION_FAILED'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'request.idempotencyKey' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(OPEN_FAILED))
  })
}

async function runTransaction<TResult>(input: {
  readonly mode: IDBTransactionMode
  readonly operate: (store: IDBObjectStore) => IDBRequest<TResult>
}): Promise<TResult> {
  const database = await openDatabase()
  return new Promise<TResult>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, input.mode)
    const request = input.operate(transaction.objectStore(STORE_NAME))
    transaction.oncomplete = () => {
      resolve(request.result)
      database.close()
    }
    const fail = () => {
      reject(transaction.error ?? new Error(TRANSACTION_FAILED))
      database.close()
    }
    transaction.onerror = fail
    transaction.onabort = fail
  })
}

export function createIndexedDbClientBoletoWhatsAppOutboxStore(): ClientBoletoWhatsAppOutboxStore {
  return {
    async put(item) {
      await runTransaction({ mode: 'readwrite', operate: (store) => store.put(item) })
    },
    async readAll() {
      const records = await runTransaction({ mode: 'readonly', operate: (store) => store.getAll() })
      return records as Awaited<ReturnType<ClientBoletoWhatsAppOutboxStore['readAll']>>
    },
    async remove(idempotencyKey) {
      await runTransaction({ mode: 'readwrite', operate: (store) => store.delete(idempotencyKey) })
    },
  }
}
