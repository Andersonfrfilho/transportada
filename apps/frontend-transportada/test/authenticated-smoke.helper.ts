/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, type Page } from '@playwright/test'

import { registerNotificationMocks } from './notification-smoke.helper'
import { getApiBaseUrl, isAuthMeResponseUrl } from './smoke-api-url.helper'

const FRONTEND_ORIGIN = 'http://localhost:53000'
const KEYCLOAK_ORIGIN = 'http://localhost:58080'
const KEYCLOAK_REALM = 'transportada-local'
const SENSITIVE_AUTH_VALUE = /authorization|bearer|access[_-]?token|refresh[_-]?token|id[_-]?token/i

type StorageAudit = {
  readonly cacheContainsSensitiveAuthData: boolean
  readonly indexedDbContainsSensitiveAuthData: boolean
  readonly localStorageContainsSensitiveAuthData: boolean
  readonly sessionStorageContainsSensitiveAuthData: boolean
}

function hasExpectedAuthorizationRequest(url: URL): boolean {
  return (
    url.origin === KEYCLOAK_ORIGIN &&
    url.pathname === `/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth` &&
    url.searchParams.get('client_id') === 'transportada-spa' &&
    url.searchParams.get('response_type') === 'code' &&
    url.searchParams.get('redirect_uri') === `${FRONTEND_ORIGIN}/auth/callback` &&
    url.searchParams.get('code_challenge_method') === 'S256' &&
    url.searchParams.get('code_challenge') !== null
  )
}

function getLocalUserPassword(): string {
  const password = process.env.KEYCLOAK_LOCAL_USER_PASSWORD
  if (password === undefined || password === '') {
    throw new Error('KEYCLOAK_LOCAL_USER_PASSWORD is required for authenticated smoke tests')
  }

  return password
}

export async function loginAsLocalUser(page: Page): Promise<void> {
  await registerNotificationMocks(page)

  if (process.env.VITE_SMOKE_AUTH_BYPASS === 'true') {
    await page.goto('/')
    await page.locator('main').waitFor()
    return
  }

  const loginRedirectRequest = expectKeycloakLoginRedirect(page)
  await page.goto('/')
  await loginRedirectRequest

  await page.locator('#username').fill('local-user')
  await page.locator('#password').fill(getLocalUserPassword())

  const apiBaseUrl = getApiBaseUrl()
  const authMeResponse = page.waitForResponse(
    (response) =>
      isAuthMeResponseUrl({ apiBaseUrl, url: response.url() }) && response.status() === 200,
  )
  await page.locator('#kc-login').click()
  await authMeResponse

  // O provider troca a URL do callback pelo caminho de origem assim que a sessão é estabelecida
  await expect(page).toHaveURL(`${FRONTEND_ORIGIN}/`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

export async function auditAuthenticationStorage(page: Page): Promise<void> {
  const audit = await page.evaluate(async (): Promise<StorageAudit> => {
    const sensitiveAuthValue =
      /authorization|bearer|access[_-]?token|refresh[_-]?token|id[_-]?token/i
    const hasSensitiveValue = (value: unknown): boolean => {
      if (typeof value === 'string') {
        return sensitiveAuthValue.test(value)
      }

      if (Array.isArray(value)) {
        return value.some(hasSensitiveValue)
      }

      if (typeof value === 'object' && value !== null) {
        return Object.entries(value).some(
          ([key, entry]) => sensitiveAuthValue.test(key) || hasSensitiveValue(entry),
        )
      }

      return false
    }
    const hasSensitiveWebStorage = (storage: Storage): boolean =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .some((key) => sensitiveAuthValue.test(key) || hasSensitiveValue(storage.getItem(key)))
    const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value)
    const readIndexedDbValues = async (databaseName: string): Promise<readonly unknown[]> =>
      new Promise((resolve) => {
        const request = indexedDB.open(databaseName)
        request.onerror = () => resolve([])
        request.onsuccess = () => {
          const database = request.result
          const stores = Array.from(database.objectStoreNames)
          if (stores.length === 0) {
            database.close()
            resolve([])
            return
          }

          const transaction = database.transaction(stores, 'readonly')
          const values: unknown[] = []
          transaction.oncomplete = () => {
            database.close()
            resolve(values)
          }
          transaction.onerror = () => {
            database.close()
            resolve([])
          }
          for (const storeName of stores) {
            const getAllRequest = transaction.objectStore(storeName).getAll()
            getAllRequest.onsuccess = () => {
              const result: unknown = getAllRequest.result
              if (isUnknownArray(result)) {
                values.push(...result)
              }
            }
          }
        }
      })
    const hasSensitiveIndexedDb = async (): Promise<boolean> => {
      if (indexedDB.databases === undefined) {
        return false
      }

      const databases = await indexedDB.databases()
      for (const database of databases) {
        if (sensitiveAuthValue.test(database.name ?? '')) {
          return true
        }

        if (
          database.name !== undefined &&
          (await readIndexedDbValues(database.name)).some(hasSensitiveValue)
        ) {
          return true
        }
      }

      return false
    }
    const hasSensitiveCacheData = async (): Promise<boolean> => {
      const cacheNames = await caches.keys()
      for (const cacheName of cacheNames) {
        if (sensitiveAuthValue.test(cacheName)) {
          return true
        }

        const requests = await caches.open(cacheName).then((cache) => cache.keys())
        if (
          requests.some(
            (request) =>
              request.url.includes('/auth/me') ||
              sensitiveAuthValue.test(request.url) ||
              request.headers.has('authorization') ||
              Array.from(request.headers.entries()).some(
                ([name, value]) => sensitiveAuthValue.test(name) || sensitiveAuthValue.test(value),
              ),
          )
        ) {
          return true
        }
      }

      return false
    }

    return {
      cacheContainsSensitiveAuthData: await hasSensitiveCacheData(),
      indexedDbContainsSensitiveAuthData: await hasSensitiveIndexedDb(),
      localStorageContainsSensitiveAuthData: hasSensitiveWebStorage(localStorage),
      sessionStorageContainsSensitiveAuthData: hasSensitiveWebStorage(sessionStorage),
    }
  })

  expect(audit).toEqual({
    cacheContainsSensitiveAuthData: false,
    indexedDbContainsSensitiveAuthData: false,
    localStorageContainsSensitiveAuthData: false,
    sessionStorageContainsSensitiveAuthData: false,
  })
}

export async function expectKeycloakLoginRedirect(page: Page): Promise<void> {
  const request = await page.waitForRequest(
    (candidate) =>
      candidate.isNavigationRequest() && hasExpectedAuthorizationRequest(new URL(candidate.url())),
    { timeout: 15_000 },
  )

  expect(SENSITIVE_AUTH_VALUE.test(request.url())).toBe(false)
}
