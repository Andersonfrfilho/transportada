/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OfflineQueueStore, QueuedReport } from './offlineQueue.service'

/**
 * A fila sobrevive à tela fechando e à bateria acabando — é o requisito da spec, e é por isso que
 * ela não mora em memória nem em `sessionStorage`.
 *
 * Um registro só, com a fila inteira dentro: a ordem é o que importa aqui (chegada antes de
 * entrega), e ler tudo de uma vez é o que a preserva sem cursor nenhum.
 */
const DATABASE_NAME = 'transportada.driver-trip'
const STORE_NAME = 'field-reports'
const QUEUE_KEY = 'queue'
const DATABASE_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('DRIVER_QUEUE_OPEN_FAILED'))
  })
}

function runTransaction<TResult>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<TResult>,
): Promise<TResult> {
  return openDatabase().then(
    (database) =>
      new Promise<TResult>((resolve, reject) => {
        const request = operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
        request.onsuccess = () => {
          resolve(request.result)
          database.close()
        }
        request.onerror = () => {
          reject(request.error ?? new Error('DRIVER_QUEUE_TRANSACTION_FAILED'))
          database.close()
        }
      }),
  )
}

export function createIndexedDbQueueStore(): OfflineQueueStore {
  return {
    async read() {
      const stored = await runTransaction<unknown>('readonly', (store) => store.get(QUEUE_KEY))
      return Array.isArray(stored) ? (stored as readonly QueuedReport[]) : []
    },
    async write(items) {
      await runTransaction('readwrite', (store) => store.put([...items], QUEUE_KEY))
    },
  }
}
