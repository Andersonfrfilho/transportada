/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Page } from '@playwright/test'

const DATABASE_NAME = 'transportada-synthetic-certificate-residue'
const STORE_NAME = 'certificate-residue'

export async function seedBinaryCertificateResidue(
  input: Readonly<{ bytes: string; page: Page }>,
): Promise<void> {
  await input.page.evaluate(
    ({ bytes, databaseName, storeName }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(databaseName, 1)
        open.onerror = () => reject(open.error ?? new Error('RESIDUE_DATABASE_OPEN_FAILED'))
        open.onupgradeneeded = () => open.result.createObjectStore(storeName)
        open.onsuccess = () => {
          const database = open.result
          const encoded = new TextEncoder().encode(bytes)
          const transaction = database.transaction(storeName, 'readwrite')
          transaction.objectStore(storeName).put(
            {
              arrayBuffer: encoded.buffer.slice(0),
              blob: new Blob([encoded]),
              view: encoded,
            },
            'synthetic-certificate',
          )
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () =>
            reject(transaction.error ?? new Error('RESIDUE_DATABASE_WRITE_FAILED'))
        }
      }),
    { bytes: input.bytes, databaseName: DATABASE_NAME, storeName: STORE_NAME },
  )
}

export async function deleteBinaryCertificateResidue(page: Page): Promise<void> {
  await page.evaluate(
    (databaseName) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName)
        request.onerror = () => reject(request.error ?? new Error('RESIDUE_DATABASE_DELETE_FAILED'))
        request.onsuccess = () => resolve()
      }),
    DATABASE_NAME,
  )
}
