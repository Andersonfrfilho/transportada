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

/**
 * O cabeçalho busca a foto da pessoa em toda página — o claim `picture` do token aponta para esta
 * mesma rota autenticada, e `<img src>` não manda o `Authorization`. Sem este mock a requisição
 * escapa para a API real, que não sobe no smoke, e o `requestfailed` entra em `failures()`.
 *
 * 404 é a resposta certa para quem não tem foto: o cliente a trata como ausência, e a tela desenha
 * as iniciais.
 */
async function registerUserPictureMock(page: Page): Promise<void> {
  await page.route('**/company-users/*/picture', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await route.fulfill({ headers: CORS_HEADERS, status: 404 })
  })
}

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

/**
 * Spec 157 (T12): o que o print da foto obrigatória precisa por cima do snapshot padrão — a
 * configuração da parada, as fotos pendentes da raiz e a nota. Ausente, o snapshot é o de sempre.
 */
export type DriverTripProofScenario = Readonly<{
  pendingProofs?: readonly unknown[]
  /** O veredito que o `/proof` devolve por documento; sem entrada, `not_required`. */
  punctualityByDocumentId?: Readonly<Record<string, string>>
  score?: number | null
  stopDeliveryProof?: Readonly<Record<string, string>>
}>

function isProofDelivered(item: unknown, provedDocumentIds: ReadonlySet<string>): boolean {
  const documentId = (item as Readonly<{ documentId?: unknown }>).documentId
  return typeof documentId === 'string' && provedDocumentIds.has(documentId)
}

function buildSnapshot(input: {
  readonly arrived: boolean
  readonly provedDocumentIds: ReadonlySet<string>
  readonly scenario: DriverTripProofScenario | undefined
}) {
  return {
    data: {
      isRegisteredDriver: true,
      /** Como a API: a nota que recebeu a foto sai da lista na próxima leitura. */
      pendingProofs: (input.scenario?.pendingProofs ?? []).filter(
        (item) => !isProofDelivered(item, input.provedDocumentIds),
      ),
      score: input.scenario?.score ?? null,
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
              deliveryProof: input.scenario?.stopDeliveryProof ?? null,
              documents: [
                {
                  accessKey: DRIVER_ACCESS_KEY,
                  deliveredAt: null,
                  grossWeight: '12.50',
                  id: DRIVER_DOCUMENT_ID,
                  number: '900123',
                  proofPending: false,
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
  /** Liga e desliga o sinal no meio do teste — a fila offline é o que se quer fotografar. */
  setOffline: (isOffline: boolean) => void
}>

export async function mockDriverTripApi(
  input: Readonly<{
    isOffline?: boolean
    /** Spec 157 T4: as N primeiras chamadas à lista de tipos respondem 500 antes de acertar. */
    occurrenceTypesFailures?: number
    page: Page
    scenario?: DriverTripProofScenario
  }>,
): Promise<DriverTripApiMock> {
  const reports: Array<{ idempotencyKey: string; path: string }> = []
  let arrived = false
  let isOffline = input.isOffline === true
  const provedDocumentIds = new Set<string>()
  let occurrenceTypesCalls = 0
  const occurrenceTypesFailures = input.occurrenceTypesFailures ?? 0

  await input.page.addInitScript(
    ({ identity, storageKey }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ data: identity }))
    },
    {
      identity: buildIdentity([...FIELD_PERMISSIONS]),
      storageKey: SMOKE_AUTH_ME_STORAGE_KEY,
    },
  )
  await registerUserPictureMock(input.page)
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
    await fulfillJson(
      route,
      buildSnapshot({ arrived, provedDocumentIds, scenario: input.scenario }),
    )
  })

  /** Spec 157: a lista de tipos de rua do motorista — sem o dublê, o pedido escapa para a API real. */
  await input.page.route(/\/me\/trips\/current\/occurrence-types$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    occurrenceTypesCalls += 1
    if (occurrenceTypesCalls <= occurrenceTypesFailures) {
      await fulfillJson(route, { error: { code: 'INTERNAL' } }, 500)
      return
    }
    await fulfillJson(route, {
      data: [{ id: '00000000-0000-4000-8000-0000000000e1', name: 'Cliente ausente' }],
    })
  })

  await input.page.route(/\/me\/trips\/current\/(stops|documents)\//, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    // Sem sinal: a requisição morre no transporte, e é isso que a fila local tem de aguentar
    if (isOffline) {
      await route.abort('internetdisconnected')
      return
    }
    const path = new URL(route.request().url()).pathname
    reports.push({
      idempotencyKey: route.request().headers()['idempotency-key'] ?? '',
      path,
    })
    arrived = true
    const proofDocumentId = /\/documents\/([^/]+)\/proof$/u.exec(path)?.[1]
    if (proofDocumentId !== undefined) provedDocumentIds.add(proofDocumentId)
    const data =
      proofDocumentId === undefined
        ? { id: crypto.randomUUID() }
        : {
            id: crypto.randomUUID(),
            punctuality:
              input.scenario?.punctualityByDocumentId?.[proofDocumentId] ?? 'not_required',
          }
    await fulfillJson(route, { data }, 201)
  })

  return {
    reports: () => reports,
    setOffline: (next) => {
      isOffline = next
    },
  }
}
