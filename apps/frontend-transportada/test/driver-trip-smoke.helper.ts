/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'

export const DRIVER_STOP_ID = '00000000-0000-4000-8000-000000000101'
export const DRIVER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000102'
/** Chave sintética de 44 dígitos — nenhuma nota real entra em fixture. */
export const DRIVER_ACCESS_KEY = '35260712345678000195550010009001231000000017'

/** O par do campo, e só ele: é o que faz a tela de entrada ser a viagem em vez da de NF-e. */
export const FIELD_PERMISSIONS = ['trip.read', 'trip.report'] as const

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status,
  })
}

function buildIdentity(permissions: readonly string[]) {
  return {
    company: { id: COMPANY_ID },
    identity: { userId: USER_ID },
    permissions,
    roles: ['driver'],
  }
}

function buildSnapshot(input: { readonly arrived: boolean }) {
  return {
    data: {
      isRegisteredDriver: true,
      trips: [
        {
          id: '00000000-0000-4000-8000-000000000100',
          status: input.arrived ? 'in_transit' : 'dispatched',
          stops: [
            {
              arrivedAt: input.arrived ? '2026-08-26T13:00:00.000Z' : null,
              completedAt: null,
              deliveryWindowEnd: null,
              deliveryWindowStart: null,
              documents: [
                {
                  accessKey: DRIVER_ACCESS_KEY,
                  deliveredAt: null,
                  grossWeight: '12.50',
                  id: DRIVER_DOCUMENT_ID,
                  number: '900123',
                  recipientName: 'Mercearia do Centro',
                  returnReason: null,
                  separationStatus: 'loaded',
                  series: '1',
                  totalAmount: '1500.00',
                  volumeCount: '3',
                },
              ],
              id: DRIVER_STOP_ID,
              label: 'Praca da Se, 100',
              latitude: null,
              longitude: null,
              sequence: 1,
            },
          ],
          vehiclePlate: 'GCQ8E47',
        },
      ],
    },
  }
}

export type DriverTripApiMock = Readonly<{
  /** O que o aparelho enviou: o caminho e a chave de idempotência, que é o que importa aqui. */
  reports: () => readonly Readonly<{ idempotencyKey: string; path: string }>[]
}>

export async function mockDriverTripApi(
  input: Readonly<{ isOffline?: boolean; page: Page }>,
): Promise<DriverTripApiMock> {
  const reports: Array<{ idempotencyKey: string; path: string }> = []
  let arrived = false

  await input.page.addInitScript(
    ({ identity, storageKey }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ data: identity }))
    },
    {
      identity: buildIdentity([...FIELD_PERMISSIONS]),
      storageKey: SMOKE_AUTH_ME_STORAGE_KEY,
    },
  )
  await input.page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await fulfillJson(route, { data: buildIdentity([...FIELD_PERMISSIONS]) })
  })

  await input.page.route(/\/me\/trips\/current$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await fulfillJson(route, buildSnapshot({ arrived }))
  })

  await input.page.route(/\/me\/trips\/current\/(stops|documents)\//, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    // Sem sinal: a requisição morre no transporte, e é isso que a fila local tem de aguentar
    if (input.isOffline === true) {
      await route.abort('internetdisconnected')
      return
    }
    reports.push({
      idempotencyKey: route.request().headers()['idempotency-key'] ?? '',
      path: new URL(route.request().url()).pathname,
    })
    arrived = true
    await fulfillJson(route, { data: { id: crypto.randomUUID() } }, 201)
  })

  return { reports: () => reports }
}
