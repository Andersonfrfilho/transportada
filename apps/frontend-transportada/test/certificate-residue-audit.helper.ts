/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, type Page } from '@playwright/test'

type ValueScanner = (value: unknown, seen?: WeakSet<object>) => Promise<readonly string[]>

type AuditGlobal = typeof globalThis & {
  __transportadaDatabaseReader?: (name: string) => Promise<readonly string[]>
  __transportadaValueScanner?: ValueScanner
}

async function readDomAndWebStorage(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const storageValues = [localStorage, sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? ''
        return [key, storage.getItem(key) ?? '']
      }).flat(),
    )
    return [document.documentElement.innerHTML, ...storageValues]
  })
}

async function readCacheStorage(page: Page): Promise<readonly string[]> {
  return page.evaluate(async () => {
    const values: string[] = []
    for (const name of await caches.keys()) {
      values.push(name)
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        values.push(request.url, response === undefined ? '' : await response.text())
      }
    }
    return values
  })
}

async function installValueScanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    const context = globalThis as AuditGlobal
    context.__transportadaValueScanner = async (value, seen = new WeakSet()) => {
      if (value === null || value === undefined) return []
      if (typeof value === 'string') return [value]
      if (typeof value === 'number') return [value.toString()]
      if (typeof value === 'bigint') return [value.toString()]
      if (typeof value === 'boolean') return [value ? 'true' : 'false']
      if (typeof value === 'symbol') return [value.description ?? '']
      if (typeof value === 'function') return [value.name]
      if (seen.has(value)) return []
      seen.add(value)
      if (value instanceof Blob) {
        return [value instanceof File ? value.name : '', value.type, await value.text()]
      }
      if (value instanceof ArrayBuffer) return [new TextDecoder().decode(value)]
      if (ArrayBuffer.isView(value)) {
        return [
          new TextDecoder().decode(
            new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
          ),
        ]
      }
      if (value instanceof Date) return [value.toISOString()]
      let entries: unknown[] = []
      if (value instanceof Map) entries = [...(value as Map<unknown, unknown>).entries()].flat()
      else if (value instanceof Set) entries = [...(value as Set<unknown>)]
      else
        for (const key of Reflect.ownKeys(value))
          entries.push(String(key), Reflect.get(value, key) as unknown)
      const scanner = context.__transportadaValueScanner
      if (scanner === undefined) throw new Error('INDEXED_DB_SCANNER_UNAVAILABLE')
      return (await Promise.all(entries.map((entry) => scanner(entry, seen)))).flat()
    }
  })
}

function configureDatabaseReader(): void {
  const context = globalThis as AuditGlobal
  const scanner = context.__transportadaValueScanner
  if (scanner === undefined) throw new Error('INDEXED_DB_SCANNER_UNAVAILABLE')
  context.__transportadaDatabaseReader = (name) =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onerror = () => reject(request.error ?? new Error('INDEXED_DB_OPEN_FAILED'))
      request.onsuccess = () => {
        const database = request.result
        const stores = Array.from(database.objectStoreNames)
        if (stores.length === 0) {
          database.close()
          resolve([])
          return
        }
        const transaction = database.transaction(stores, 'readonly')
        const records: unknown[] = []
        transaction.oncomplete = () => {
          database.close()
          const scans = records.map((value) => scanner(value))
          void Promise.all(scans).then((values) => resolve(values.flat()), reject)
        }
        transaction.onabort = transaction.onerror = () => {
          database.close()
          reject(transaction.error ?? new Error('INDEXED_DB_READ_FAILED'))
        }
        for (const store of stores) {
          const read = transaction.objectStore(store).getAll()
          read.onerror = () => reject(read.error ?? new Error('INDEXED_DB_RECORD_READ_FAILED'))
          read.onsuccess = () => {
            const result: unknown = read.result
            if (!Array.isArray(result)) return reject(new Error('INDEXED_DB_RECORDS_INVALID'))
            for (const value of result as unknown[]) records.push(value)
          }
        }
      }
    })
}

async function collectIndexedDbValues(): Promise<readonly string[]> {
  const context = globalThis as AuditGlobal
  const readDatabase = context.__transportadaDatabaseReader
  if (readDatabase === undefined || indexedDB.databases === undefined)
    throw new Error('INDEXED_DB_AUDIT_UNAVAILABLE')
  const names = (await indexedDB.databases()).flatMap((database) => database.name ?? '')
  const values = await Promise.all(names.map(readDatabase))
  return [...names, ...values.flat()]
}

async function readIndexedDb(page: Page): Promise<readonly string[]> {
  await installValueScanner(page)
  await page.evaluate(configureDatabaseReader)
  try {
    return await page.evaluate(collectIndexedDbValues)
  } finally {
    await page.evaluate(() => {
      const context = globalThis as AuditGlobal
      delete context.__transportadaDatabaseReader
      delete context.__transportadaValueScanner
    })
  }
}

export async function expectNoSensitiveResidue(
  input: Readonly<{ page: Page; sensitiveValues: readonly string[] }>,
): Promise<void> {
  await input.page.evaluate(() => navigator.serviceWorker.ready)
  const inspected = (
    await Promise.all([
      readDomAndWebStorage(input.page),
      readCacheStorage(input.page),
      readIndexedDb(input.page),
    ])
  ).flat()
  const containsSensitiveValue = input.sensitiveValues.some((value) =>
    inspected.some((entry) => entry.includes(value)),
  )
  expect(containsSensitiveValue).toBe(false)
}

export async function expectNoCertificateResidue(
  input: Readonly<{ page: Page; sensitiveValues: readonly string[] }>,
): Promise<void> {
  await expectNoSensitiveResidue(input)
  await expect(input.page.locator('input[type="file"]')).toHaveJSProperty('value', '')
  await expect(input.page.getByLabel('Senha do certificado')).toHaveValue('')
}
