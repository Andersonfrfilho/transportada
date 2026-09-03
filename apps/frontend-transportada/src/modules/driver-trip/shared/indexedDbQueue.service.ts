/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AttachmentGroupEntries,
  AttachmentStore,
  QueuedAttachment,
} from './offlineAttachments.service'
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
 *
 * ⚠️ Toda mutação é **ler-e-escrever na mesma transação `readwrite`**: `get` e `put` separados
 * abriam a janela em que um toque enfileirado entre os dois era sobrescrito e sumia.
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

function readValue(input: {
  readonly key: IDBValidKey
  readonly storeName: string
}): Promise<unknown> {
  return openDatabase().then(
    (database) =>
      new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction(input.storeName, 'readonly')
          .objectStore(input.storeName)
          .get(input.key)
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

/**
 * Leitura, mutação síncrona e escrita na **mesma** transação `readwrite`. `mutate` devolvendo lista
 * vazia com `deleteWhenEmpty` apaga a chave em vez de gravar um registro oco.
 */
function readModifyWrite(input: {
  readonly deleteWhenEmpty: boolean
  readonly key: IDBValidKey
  readonly mutate: (stored: unknown) => readonly unknown[]
  readonly storeName: string
}): Promise<readonly unknown[]> {
  return openDatabase().then(
    (database) =>
      new Promise<readonly unknown[]>((resolve, reject) => {
        const transaction = database.transaction(input.storeName, 'readwrite')
        const store = transaction.objectStore(input.storeName)
        let next: readonly unknown[] = []

        const readRequest = store.get(input.key)
        readRequest.onsuccess = () => {
          next = input.mutate(readRequest.result)
          if (input.deleteWhenEmpty && next.length === 0) store.delete(input.key)
          else store.put([...next], input.key)
        }
        transaction.oncomplete = () => {
          resolve(next)
          database.close()
        }
        const fail = () => {
          reject(transaction.error ?? new Error('DRIVER_QUEUE_TRANSACTION_FAILED'))
          database.close()
        }
        transaction.onerror = fail
        transaction.onabort = fail
      }),
  )
}

function toReports(stored: unknown): readonly QueuedReport[] {
  return Array.isArray(stored) ? (stored as readonly QueuedReport[]) : []
}

function toAttachments(stored: unknown): readonly QueuedAttachment[] {
  return Array.isArray(stored) ? (stored as readonly QueuedAttachment[]) : []
}

export function createIndexedDbQueueStore(): OfflineQueueStore {
  return {
    async read() {
      return toReports(await readValue({ key: QUEUE_KEY, storeName: STORE_NAME }))
    },
    async update(mutate) {
      const next = await readModifyWrite({
        deleteWhenEmpty: false,
        key: QUEUE_KEY,
        mutate: (stored) => mutate(toReports(stored)),
        storeName: STORE_NAME,
      })
      return next as readonly QueuedReport[]
    },
  }
}

/** Chaves e valores saem da **mesma** transação — duas leituras separadas podiam discordar. */
function readAllAttachments(): Promise<AttachmentGroupEntries> {
  return openDatabase().then(
    (database) =>
      new Promise<AttachmentGroupEntries>((resolve, reject) => {
        const transaction = database.transaction(ATTACHMENT_STORE_NAME, 'readonly')
        const store = transaction.objectStore(ATTACHMENT_STORE_NAME)
        const keysRequest = store.getAllKeys()
        const valuesRequest = store.getAll()

        transaction.oncomplete = () => {
          const entries = keysRequest.result.map((key, index) => {
            const stored: unknown = valuesRequest.result[index]
            return [
              typeof key === 'string' ? key : JSON.stringify(key),
              toAttachments(stored),
            ] as const
          })
          resolve(entries)
          database.close()
        }
        const fail = () => {
          reject(transaction.error ?? new Error('DRIVER_QUEUE_TRANSACTION_FAILED'))
          database.close()
        }
        transaction.onerror = fail
        transaction.onabort = fail
      }),
  )
}

export function createIndexedDbAttachmentStore(): AttachmentStore {
  return {
    async read(eventKey) {
      return toAttachments(await readValue({ key: eventKey, storeName: ATTACHMENT_STORE_NAME }))
    },
    readAll: () => readAllAttachments(),
    async readTotals() {
      const entries = await readAllAttachments()
      const items = entries.flatMap(([, stored]) => stored)
      return {
        count: items.length,
        totalBytes: items.reduce((total, item) => total + item.blob.size, 0),
      }
    },
    async remove(eventKey) {
      await readModifyWrite({
        deleteWhenEmpty: true,
        key: eventKey,
        mutate: () => [],
        storeName: ATTACHMENT_STORE_NAME,
      })
    },
    async update(input) {
      const next = await readModifyWrite({
        deleteWhenEmpty: true,
        key: input.eventKey,
        mutate: (stored) => input.mutate(toAttachments(stored)),
        storeName: ATTACHMENT_STORE_NAME,
      })
      return next as readonly QueuedAttachment[]
    },
  }
}
