/* Cópia por valor de apps/frontend-transportada/test/driver-trip-smoke.helper.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ **Diferença da origem**: sem o mock de `**\/company-users/*\/picture` nem de `/auth/me` — o
 * cabeçalho desta app desenha as iniciais (`DriverShellHeader.component.tsx`, "a API não expõe foto
 * ao papel de campo hoje") e `GET /me/trips/current` faz sozinho o papel de autorização (RF3,
 * `driverAuthorization.service.ts`) que o painel tirava de `/auth/me`.
 */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
}

export const DRIVER_STOP_ID = '00000000-0000-4000-8000-000000000101'
export const DRIVER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000102'
/** Chave sintética de 44 dígitos — nenhuma nota real entra em fixture. */
export const DRIVER_ACCESS_KEY = '35260712345678000195550010009001231000000017'

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status,
  })
}

export type DriverTripProofScenario = Readonly<{
  /** Spec 189 T7.2: viagens além da de sempre, depois dela — a API ordena por `createdAt`. */
  additionalTrips?: readonly unknown[]
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
        ...(input.scenario?.additionalTrips ?? []),
      ],
    },
  }
}

export type DriverTripApiMock = Readonly<{
  /** Spec 189 T7.5: cada `PUT /me/location-consent`, na ordem, com o `accepted` enviado. */
  consentWrites: () => readonly boolean[]
  /** Spec 189 T7.5: cada `POST /me/trips/current/location`, com as coordenadas em texto. */
  locationPosts: () => readonly Readonly<{ latitude: string; longitude: string }>[]
  /** O que o aparelho enviou: o caminho e a chave de idempotência, que é o que importa aqui. */
  reports: () => readonly Readonly<{ idempotencyKey: string; path: string }>[]
  /** Liga e desliga o sinal no meio do teste — a fila offline é o que se quer fotografar. */
  setOffline: (isOffline: boolean) => void
  /**
   * **Booleano, não contador:** falha até o teste mandar parar, qualquer que seja o número de
   * leituras. No build de produção a tela lê os tipos uma vez; sob um `vite` de dev (StrictMode) lê
   * duas — e um contador de N falhas acertaria um e erraria o outro.
   */
  setOccurrenceTypesFailing: (isFailing: boolean) => void
}>

export async function mockDriverTripApi(
  input: Readonly<{
    isOffline?: boolean
    /** Começa respondendo 500 à lista de tipos, até `setOccurrenceTypesFailing(false)`. */
    occurrenceTypesFailing?: boolean
    page: Page
    scenario?: DriverTripProofScenario
  }>,
): Promise<DriverTripApiMock> {
  const reports: Array<{ idempotencyKey: string; path: string }> = []
  let arrived = false
  let isOffline = input.isOffline === true
  const provedDocumentIds = new Set<string>()
  let occurrenceTypesFailing = input.occurrenceTypesFailing === true

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

  /** A lista de tipos de rua do motorista — sem o dublê, o pedido escapa para a API real. */
  await input.page.route(/\/me\/trips\/current\/occurrence-types$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    if (occurrenceTypesFailing) {
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

  /**
   * Spec 189 T7.5: o consentimento nasce nulo (desligado), como na API, e o `PUT` grava. Sem o
   * dublê, o Perfil e o rastreamento falariam com a API real de `make dev`.
   */
  let consentAcceptedAt: string | null = null
  const consentWrites: boolean[] = []
  const locationPosts: Array<{ latitude: string; longitude: string }> = []

  await input.page.route(/\/me\/location-consent$/, async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    if (method === 'PUT') {
      const accepted = (route.request().postDataJSON() as { accepted: boolean }).accepted
      consentWrites.push(accepted)
      consentAcceptedAt = accepted ? new Date().toISOString() : null
    }
    await fulfillJson(route, { data: { acceptedAt: consentAcceptedAt } })
  })

  await input.page.route(/\/me\/trips\/current\/location$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    locationPosts.push(route.request().postDataJSON() as { latitude: string; longitude: string })
    await fulfillJson(route, { data: { outcome: 'recorded' } }, 201)
  })

  return {
    consentWrites: () => consentWrites,
    locationPosts: () => locationPosts,
    reports: () => reports,
    setOccurrenceTypesFailing: (next) => {
      occurrenceTypesFailing = next
    },
    setOffline: (next) => {
      isOffline = next
    },
  }
}
