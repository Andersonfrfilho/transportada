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
/** Spec 179: o caminho do dublê do bucket, na origem da API. */
const OBJECT_STORAGE_PATH = '/__object-storage/'
export const DRIVER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000102'
/** Spec 218: os tipos do catálogo que o smoke oferece, além do "Cliente ausente" de sempre. */
export const SMOKE_OCCURRENCE_TYPE_IDS = {
  dockClosed: '00000000-0000-4000-8000-0000000000e3',
  damagedCargo: '00000000-0000-4000-8000-0000000000e2',
  unexpectedCharge: '00000000-0000-4000-8000-0000000000e4',
} as const
/** Chave sintética de 44 dígitos — nenhuma nota real entra em fixture. */
export const DRIVER_ACCESS_KEY = '35260712345678000195550010009001231000000017'

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
  extraHeaders: Readonly<Record<string, string>> = {},
): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*', ...extraHeaders },
    status,
  })
}

/**
 * Spec 234 D1: o `Date` do servidor, adiantado em `offsetMs` em relação ao relógio desta máquina.
 * ⚠️ O navegador só deixa o JavaScript ler o `Date` de outra origem se a resposta o expõe — o dublê
 * o expõe aqui, e **a API real precisa fazer o mesmo** (`access-control-expose-headers: Date`).
 */
function buildServerClockHeaders(offsetMs: number | undefined): Record<string, string> {
  if (offsetMs === undefined) return {}
  return {
    'access-control-expose-headers': 'Date',
    date: new Date(Date.now() + offsetMs).toUTCString(),
  }
}

/** Os campos de texto de um multipart — a foto fica de fora (parte com `filename`). */
function readMultipartTextFields(rawBody: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const match of rawBody.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)\r\n/gu)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) fields[name] = value
  }
  return fields
}

export type DriverTripProofScenario = Readonly<{
  /** Spec 189 T7.2: viagens além da de sempre, depois dela — a API ordena por `createdAt`. */
  additionalTrips?: readonly unknown[]
  pendingProofs?: readonly unknown[]
  /** Spec 234 D1: o servidor responde com `Date` adiantado desta quantidade de ms; sem ele, sem `Date`. */
  serverClockOffsetMs?: number
  /** O veredito que o `/proof` devolve por documento; sem entrada, `not_required`. */
  punctualityByDocumentId?: Readonly<Record<string, string>>
  score?: number | null
  /**
   * Com `true`, o "Entreguei" vira `delivered` na leitura seguinte, como na API — é o que abre o
   * comprovante no cartão da parada. Sem ele, a nota fica `loaded` (o que os outros cenários esperam).
   */
  settlesDeliveries?: boolean
  /** Spec 230: o servidor recusa o despacho com este status (ex.: 409) e a viagem segue `route_planned`. */
  dispatchRefusedWith?: number
  /** Spec 230: a viagem nasce `route_planned` e só vira `dispatched` depois do `POST /dispatch`. */
  startsPlanned?: boolean
  stopDeliveryProof?: Readonly<Record<string, string>>
}>

function isProofDelivered(item: unknown, provedDocumentIds: ReadonlySet<string>): boolean {
  const documentId = (item as Readonly<{ documentId?: unknown }>).documentId
  return typeof documentId === 'string' && provedDocumentIds.has(documentId)
}

function buildSnapshot(input: {
  readonly arrived: boolean
  readonly isDispatched: boolean
  readonly deliveredDocumentIds: ReadonlySet<string>
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
          createdAt: '2026-08-26T12:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000100',
          status: !input.isDispatched
            ? 'route_planned'
            : input.arrived
              ? 'in_transit'
              : 'dispatched',
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
                  deliveredAt: input.deliveredDocumentIds.has(DRIVER_DOCUMENT_ID)
                    ? '2026-08-26T13:05:00.000Z'
                    : null,
                  grossWeight: '12.50',
                  id: DRIVER_DOCUMENT_ID,
                  number: '900123',
                  proofPending: false,
                  recipientName: 'Mercearia do Centro',
                  returnReason: null,
                  separationStatus: input.deliveredDocumentIds.has(DRIVER_DOCUMENT_ID)
                    ? 'delivered'
                    : 'loaded',
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
  /**
   * O que o aparelho enviou: o caminho, a chave de idempotência e o corpo JSON (quando houver) —
   * a ocorrência com foto confere ali o `attachmentObjectId`.
   */
  reports: () => readonly Readonly<{
    body: unknown
    /** Spec 234: os campos de texto do multipart (o comprovante); `null` quando o corpo é JSON. */
    formFields: Readonly<Record<string, string>> | null
    idempotencyKey: string
    path: string
  }>[]
  /** Spec 179: cada `PUT` direto ao storage pela URL assinada — os bytes que chegaram lá. */
  storageUploads: () => readonly Readonly<{ bytes: number; contentType: string }>[]
  /** Liga e desliga o sinal no meio do teste — a fila offline é o que se quer fotografar. */
  setOffline: (isOffline: boolean) => void
  /** Spec 234 D1: a partir de agora o servidor responde com `Date` adiantado em `offsetMs` (ou sem `Date`). */
  setServerClockOffset: (offsetMs: number | undefined) => void
  /** Spec 189 T9.2 (A2): a leitura da viagem passa a responder 500 — a releitura de 30 s falha. */
  setTripReadFailing: (isFailing: boolean) => void
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
  const reports: Array<{
    body: unknown
    formFields: Record<string, string> | null
    idempotencyKey: string
    path: string
  }> = []
  const storageUploads: Array<{ bytes: number; contentType: string }> = []
  let arrived = false
  let isDispatched = input.scenario?.startsPlanned !== true
  let isOffline = input.isOffline === true
  const provedDocumentIds = new Set<string>()
  const deliveredDocumentIds = new Set<string>()
  let occurrenceTypesFailing = input.occurrenceTypesFailing === true
  let tripReadFailing = false
  let serverClockOffsetMs = input.scenario?.serverClockOffsetMs

  await input.page.route(/\/me\/trips\/current$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    if (tripReadFailing) {
      await fulfillJson(route, { error: { code: 'INTERNAL' } }, 500)
      return
    }
    await fulfillJson(
      route,
      buildSnapshot({
        arrived,
        deliveredDocumentIds,
        isDispatched,
        provedDocumentIds,
        scenario: input.scenario,
      }),
      200,
      buildServerClockHeaders(serverClockOffsetMs),
    )
  })

  /** Spec 230: o despacho. Sem sinal a requisição morre no transporte, como as outras. */
  await input.page.route(/\/me\/trips\/current\/dispatch$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    if (isOffline) {
      await route.abort('internetdisconnected')
      return
    }
    reports.push({
      body: null,
      formFields: null,
      idempotencyKey: '',
      path: new URL(route.request().url()).pathname,
    })
    if (input.scenario?.dispatchRefusedWith !== undefined) {
      await fulfillJson(
        route,
        { error: { code: 'STATE_TRANSITION_NOT_ALLOWED' } },
        input.scenario.dispatchRefusedWith,
      )
      return
    }
    isDispatched = true
    await fulfillJson(
      route,
      { data: { status: 'dispatched' } },
      200,
      buildServerClockHeaders(serverClockOffsetMs),
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
    /**
     * Spec 218 (D1): a lista única — tipos de nota e de parada juntos, cada um com o que pede de
     * foto. "Cliente ausente" fica como sempre foi (sem flow, a cópia antiga), para o "Não
     * entreguei" continuar medindo o mesmo que antes.
     */
    await fulfillJson(
      route,
      {
        data: [
          { id: '00000000-0000-4000-8000-0000000000e1', name: 'Cliente ausente' },
          {
            attachmentMode: 'required',
            flow: 'document',
            id: SMOKE_OCCURRENCE_TYPE_IDS.damagedCargo,
            name: 'Avaria na carga',
            stopKind: null,
          },
          {
            attachmentMode: 'optional',
            flow: 'stop',
            id: SMOKE_OCCURRENCE_TYPE_IDS.dockClosed,
            name: 'Doca interditada',
            stopKind: 'dock_closed',
          },
          {
            attachmentMode: 'required',
            flow: 'stop',
            id: SMOKE_OCCURRENCE_TYPE_IDS.unexpectedCharge,
            name: 'Cobrança inesperada',
            stopKind: 'unexpected_charge',
          },
        ],
      },
      200,
      buildServerClockHeaders(serverClockOffsetMs),
    )
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
    const requestUrl = new URL(route.request().url())
    const path = requestUrl.pathname
    const rawBody = route.request().postData()
    const isJson = rawBody !== null && rawBody.startsWith('{')
    reports.push({
      body: isJson ? JSON.parse(rawBody) : null,
      formFields: rawBody === null || isJson ? null : readMultipartTextFields(rawBody),
      idempotencyKey: route.request().headers()['idempotency-key'] ?? '',
      path,
    })
    arrived = true
    /**
     * Spec 179: a URL assinada aponta para a própria origem da API — é a que a CSP do smoke já
     * libera no `connect-src` —, num caminho que só o dublê do storage abaixo atende.
     */
    if (path.endsWith('/occurrence-uploads')) {
      const id = crypto.randomUUID()
      await fulfillJson(
        route,
        { data: { id, uploadUrl: `${requestUrl.origin}${OBJECT_STORAGE_PATH}${id}` } },
        201,
        buildServerClockHeaders(serverClockOffsetMs),
      )
      return
    }
    const uploadId = /\/occurrence-uploads\/([^/]+)\/confirm$/u.exec(path)?.[1]
    if (uploadId !== undefined) {
      await fulfillJson(
        route,
        { data: { id: uploadId } },
        200,
        buildServerClockHeaders(serverClockOffsetMs),
      )
      return
    }
    const deliveredDocumentId = /\/documents\/([^/]+)\/deliver$/u.exec(path)?.[1]
    if (deliveredDocumentId !== undefined && input.scenario?.settlesDeliveries === true) {
      deliveredDocumentIds.add(deliveredDocumentId)
    }
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
    await fulfillJson(route, { data }, 201, buildServerClockHeaders(serverClockOffsetMs))
  })

  /** Spec 179: o bucket. Sem sinal ele também não responde — a foto fica na fila com a ocorrência. */
  await input.page.route(new RegExp(`${OBJECT_STORAGE_PATH}`, 'u'), async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
        status: 204,
      })
      return
    }
    if (isOffline) {
      await route.abort('internetdisconnected')
      return
    }
    storageUploads.push({
      bytes: route.request().postDataBuffer()?.length ?? 0,
      contentType: route.request().headers()['content-type'] ?? '',
    })
    await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 200 })
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
    await fulfillJson(
      route,
      { data: { acceptedAt: consentAcceptedAt } },
      200,
      buildServerClockHeaders(serverClockOffsetMs),
    )
  })

  await input.page.route(/\/me\/trips\/current\/location$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    locationPosts.push(route.request().postDataJSON() as { latitude: string; longitude: string })
    await fulfillJson(
      route,
      { data: { outcome: 'recorded' } },
      201,
      buildServerClockHeaders(serverClockOffsetMs),
    )
  })

  return {
    consentWrites: () => consentWrites,
    locationPosts: () => locationPosts,
    reports: () => reports,
    storageUploads: () => storageUploads,
    setOccurrenceTypesFailing: (next) => {
      occurrenceTypesFailing = next
    },
    setOffline: (next) => {
      isOffline = next
    },
    setServerClockOffset: (next) => {
      serverClockOffsetMs = next
    },
    setTripReadFailing: (next) => {
      tripReadFailing = next
    },
  }
}

/**
 * Envelhece todo item da fila: a data de criação passa a ser a de `ageMs` atrás. A fila é um registro
 * só (`field-reports/queue`), e é o próprio app que a escreve — o teste só muda a data.
 */
export async function ageQueuedItems(input: {
  readonly ageMs: number
  readonly page: Page
}): Promise<void> {
  await input.page.evaluate(
    (ageMs) =>
      new Promise<void>((resolveAge, rejectAge) => {
        const open = indexedDB.open('transportada.driver-trip')
        open.onerror = () => rejectAge(new Error('INDEXED_DB_OPEN_FAILED'))
        open.onsuccess = () => {
          const transaction = open.result.transaction('field-reports', 'readwrite')
          const store = transaction.objectStore('field-reports')
          const read = store.get('queue')
          read.onsuccess = () => {
            const aged = (read.result as { createdAt: string }[]).map((item) => ({
              ...item,
              createdAt: new Date(Date.now() - ageMs).toISOString(),
            }))
            store.put(aged, 'queue')
          }
          transaction.oncomplete = () => resolveAge()
          transaction.onerror = () => rejectAge(new Error('INDEXED_DB_WRITE_FAILED'))
        }
      }),
    input.ageMs,
  )
}
