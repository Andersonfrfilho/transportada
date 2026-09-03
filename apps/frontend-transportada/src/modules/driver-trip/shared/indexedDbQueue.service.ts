/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AttachmentStore, QueuedAttachment } from './offlineAttachments.service'
import type { OfflineQueueStore, QueuedReport } from './offlineQueue.service'

/**
 * A fila sobrevive à tela fechando e à bateria acabando — é o requisito da spec, e é por isso que
 * ela não mora em memória nem em `sessionStorage`.
 *
 * Um registro só, com a fila inteira dentro: a ordem é o que importa aqui (chegada antes de
 * entrega), e ler tudo de uma vez é o que a preserva sem cursor nenhum.
 *
 * Spec 082 D6: os blobs de comprovante moram numa store própria, chaveada pela chave de idempotência
 * do evento — o IndexedDB guarda `Blob` por clonagem estruturada, e separar as stores deixa a fila
 * leve de ler sem carregar megabytes de foto junto.
 */
const DATABASE_NAME = 'transportada.driver-trip'
const STORE_NAME = 'field-reports'
const ATTACHMENT_STORE_NAME = 'event-attachments'
const QUEUE_KEY = 'queue'
const DATABASE_VERSION = 2

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      for (const name of [STORE_NAME, ATTACHMENT_STORE_NAME]) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name)
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('DRIVER_QUEUE_OPEN_FAILED'))
  })
}

function runTransaction<TResult>(input: {
  readonly mode: IDBTransactionMode
  readonly operation: (store: IDBObjectStore) => IDBRequest<TResult>
  readonly storeName: string
}): Promise<TResult> {
  return openDatabase().then(
    (database) =>
      new Promise<TResult>((resolve, reject) => {
        const request = input.operation(
          database.transaction(input.storeName, input.mode).objectStore(input.storeName),
        )
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
      const stored = await runTransaction<unknown>({
        mode: 'readonly',
        operation: (store) => store.get(QUEUE_KEY),
        storeName: STORE_NAME,
      })
      return Array.isArray(stored) ? (stored as readonly QueuedReport[]) : []
    },
    async write(items) {
      await runTransaction({
        mode: 'readwrite',
        operation: (store) => store.put([...items], QUEUE_KEY),
        storeName: STORE_NAME,
      })
    },
  }
}

async function readAllAttachments(): Promise<
  readonly (readonly [string, readonly QueuedAttachment[]])[]
> {
  const keys = await runTransaction<IDBValidKey[]>({
    mode: 'readonly',
    operation: (store) => store.getAllKeys(),
    storeName: ATTACHMENT_STORE_NAME,
  })
  const values = await runTransaction<unknown[]>({
    mode: 'readonly',
    operation: (store) => store.getAll(),
    storeName: ATTACHMENT_STORE_NAME,
  })
  return keys.map((key, index) => {
    const stored = values[index]
    return [String(key), Array.isArray(stored) ? (stored as readonly QueuedAttachment[]) : []]
  })
}

export function createIndexedDbAttachmentStore(): AttachmentStore {
  return {
    async read(eventKey) {
      const stored = await runTransaction<unknown>({
        mode: 'readonly',
        operation: (store) => store.get(eventKey),
        storeName: ATTACHMENT_STORE_NAME,
      })
      return Array.isArray(stored) ? (stored as readonly QueuedAttachment[]) : []
    },
    async readCounts() {
      const entries = await readAllAttachments()
      return Object.fromEntries(entries.map(([key, items]) => [key, items.length]))
    },
    async readTotals() {
      const entries = await readAllAttachments()
      const items = entries.flatMap(([, stored]) => stored)
      return {
        count: items.length,
        totalBytes: items.reduce((total, item) => total + item.blob.size, 0),
      }
    },
    async remove(eventKey) {
      await runTransaction({
        mode: 'readwrite',
        operation: (store) => store.delete(eventKey),
        storeName: ATTACHMENT_STORE_NAME,
      })
    },
    async write(eventKey, items) {
      await runTransaction({
        mode: 'readwrite',
        operation: (store) => store.put([...items], eventKey),
        storeName: ATTACHMENT_STORE_NAME,
      })
    },
  }
}
