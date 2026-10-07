/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * API de demonstração para o preview da app do motorista (spec 206 T4.5). **Só para preview** —
 * nunca sobe em imagem de deploy, nunca é chamada em produção, e não faz parte do build (`vite
 * build`/`Dockerfile`). Existe para o motorista da tela ter dados sintéticos estáveis sem depender
 * do banco, e para o link do preview sobreviver ao fim de uma sessão específica.
 *
 * Responde as rotas `/me/...` da viagem com dados sintéticos, no molde do cenário dos smokes, só
 * que mais cheio: duas viagens, três paradas, várias notas e janela de entrega. Todo o resto
 * (`/public/landing-*`, notificações e o que mais a tela pedir) é repassado para a API local
 * verdadeira, então marca, sino e autenticação continuam reais.
 *
 * Uso: `bun run apps/frontend-driver/scripts/driver-preview-api.ts` (ou pelo alvo
 * `motorista-api-demo` do `.claude/launch.json`).
 */

/**
 * Portas e origens por variável de ambiente, com o default de sempre (`.claude/launch.json`).
 * Sobrescrever só é preciso quando duas sessões precisam da mesma demonstração ao mesmo tempo sem
 * derrubar a porta uma da outra — sem a variável, o comportamento de sempre continua idêntico.
 */
const PORT = Number(process.env.DRIVER_PREVIEW_API_PORT ?? 53901)
const REAL_API = process.env.DRIVER_PREVIEW_REAL_API ?? 'http://localhost:53001'
const PREVIEW_ORIGIN = process.env.DRIVER_PREVIEW_ORIGIN ?? 'http://localhost:53200'

const CORS_HEADERS = {
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': PREVIEW_ORIGIN,
}

function accessKey(seed: number): string {
  return `3526071234567800019555001000${String(900000 + seed).padStart(7, '0')}100000001`.slice(
    0,
    44,
  )
}

/** Spec 247 (T5.3): o produto da nota como o snapshot do motorista o traz — texto, nunca número. */
type PreviewProduct = {
  code: string
  description: string
  hasVaryingUnitValue: boolean
  quantity: string
  unit: string
  unitValue: string
}

const PREVIEW_PRODUCTS: readonly PreviewProduct[] = [
  {
    code: '2073170',
    description: 'MAC ADRIA OVOS 500G',
    hasVaryingUnitValue: false,
    quantity: '3.0000',
    unit: 'FD',
    unitValue: '19.9950',
  },
  {
    code: '2073171',
    description: 'BISCOITO MAISENA 400G',
    hasVaryingUnitValue: false,
    quantity: '1.0000',
    unit: 'UN',
    unitValue: '57.2000',
  },
  {
    code: '2073172',
    description: 'FARDO DE AGUA MINERAL 1,5L (preço varia na nota)',
    hasVaryingUnitValue: true,
    quantity: '2.0000',
    unit: 'FD',
    unitValue: '10.0000',
  },
]

/** Quatro tipos efetivos para a nota com produtos: obrigatório por linha, opcional, da ocorrência e sem valor. */
const PREVIEW_OCCURRENCE_TYPES = [
  {
    attachmentMode: 'optional',
    declaredAmountLabel: 'Valor pago pela loja',
    declaredAmountMode: 'required',
    declaredAmountScope: 'item',
    flow: 'document',
    id: '00000000-0000-4000-8000-000000000911',
    itemsMinimumCount: 1,
    itemsMode: 'required',
    name: 'Devolução parcial',
    noteMode: 'optional',
    photoMode: 'optional',
    referenceNumberLabel: 'Número da NFD',
    referenceNumberMode: 'required',
    signatureMode: 'off',
    stopKind: null,
  },
  {
    attachmentMode: 'off',
    declaredAmountLabel: 'Valor pago',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'occurrence',
    flow: 'document',
    id: '00000000-0000-4000-8000-000000000912',
    itemsMinimumCount: null,
    itemsMode: 'optional',
    name: 'Avaria na descarga',
    noteMode: 'required',
    photoMode: 'off',
    referenceNumberLabel: 'Número do documento do cliente',
    referenceNumberMode: 'optional',
    signatureMode: 'off',
    stopKind: null,
  },
  {
    attachmentMode: 'off',
    declaredAmountLabel: 'Valor pago',
    declaredAmountMode: 'off',
    declaredAmountScope: 'item',
    flow: 'document',
    id: '00000000-0000-4000-8000-000000000913',
    itemsMinimumCount: null,
    itemsMode: 'off',
    name: 'Cliente ausente',
    noteMode: 'optional',
    photoMode: 'off',
    referenceNumberLabel: 'Número do documento do cliente',
    referenceNumberMode: 'off',
    signatureMode: 'off',
    stopKind: null,
  },
]

type PreviewDocument = {
  accessKey: string
  deliveredAt: string | null
  grossWeight: string
  id: string
  number: string
  occurrenceTypes?: readonly unknown[]
  proofPending: boolean
  products?: readonly PreviewProduct[]
  /** Spec 193 D14: nome que "O próprio cliente recebeu" preenche — trade name, senão razão social. */
  recipientDisplayName: string
  /** Spec 193 D14: PF ou PJ — decide se o nome preenchido pelo botão rápido fica selecionado. */
  recipientIsCompany: boolean
  recipientName: string
  returnReason: string | null
  separationStatus: string
  series: string
  totalAmount: string
  volumeCount: string
}

function previewDocument(input: {
  hasProducts?: boolean
  recipientDisplayName?: string
  recipientIsCompany?: boolean
  recipientName: string
  seed: number
  volumes: number
  weight: string
}): PreviewDocument {
  return {
    accessKey: accessKey(input.seed),
    deliveredAt: null,
    grossWeight: input.weight,
    id: `00000000-0000-4000-8000-0000000002${String(input.seed).padStart(2, '0')}`,
    number: String(900100 + input.seed),
    ...(input.hasProducts === true
      ? { occurrenceTypes: PREVIEW_OCCURRENCE_TYPES, products: PREVIEW_PRODUCTS }
      : {}),
    proofPending: false,
    recipientDisplayName: input.recipientDisplayName ?? input.recipientName,
    recipientIsCompany: input.recipientIsCompany ?? true,
    recipientName: input.recipientName,
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: (Number(input.weight) * 120).toFixed(2),
    volumeCount: String(input.volumes),
  }
}

const arrivedStops = new Set<string>()
const deliveredDocuments = new Set<string>()
/** Spec 179: "Não entreguei" — a nota devolvida, com o motivo, e as fotos que subiram ao "bucket". */
const returnedDocuments = new Map<string, string>()
const storedPhotos = new Map<string, number>()
let consentAcceptedAt: string | null = null
/** A primeira viagem começa despachada (carga fechada): o motorista vê "Iniciar rota". */
let firstTripStatus = 'dispatched'
/**
 * Spec 206 D9: só uma parada por vez fica "a caminho" — a demonstração guarda a ÚNICA parada e as
 * duas horas (D1: `created_at` do servidor, `tapped_at` do aparelho), no molde do que a API real
 * grava em `trip_stops.en_route_since`/`en_route_tapped_at`.
 */
let enRouteStopId: string | undefined
let enRouteSince: string | null = null
let enRouteTappedAt: string | null = null
/** Spec 206 D3: chave de idempotência já vista, para o replay de `depart`/`cancel-departure` liquidar. */
const seenIdempotencyKeys = new Set<string>()

function stop(input: {
  deliveryProof?: {
    photo: string
    receivedBy: string
    receiverDocument: string
    receiverName: string
    signature: string
  }
  documents: readonly PreviewDocument[]
  id: string
  label: string
  latitude: number
  longitude: number
  sequence: number
  windowEnd: string | null
  windowStart: string | null
}) {
  return {
    arrivedAt: arrivedStops.has(input.id) ? new Date().toISOString() : null,
    completedAt: null,
    deliveryProof: input.deliveryProof ?? null,
    deliveryWindowEnd: input.windowEnd,
    deliveryWindowStart: input.windowStart,
    documents: input.documents.map((item) =>
      deliveredDocuments.has(item.id)
        ? { ...item, deliveredAt: new Date().toISOString(), separationStatus: 'delivered' }
        : returnedDocuments.has(item.id)
          ? {
              ...item,
              returnReason: returnedDocuments.get(item.id) ?? null,
              separationStatus: 'returned',
            }
          : item,
    ),
    /** Spec 206 D9: aditivo — só a parada a caminho carrega os dois; as outras vêm `null`. */
    enRouteSince: input.id === enRouteStopId ? enRouteSince : null,
    enRouteTappedAt: input.id === enRouteStopId ? enRouteTappedAt : null,
    id: input.id,
    label: input.label,
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    sequence: input.sequence,
  }
}

function snapshot() {
  return {
    data: {
      isRegisteredDriver: true,
      pendingProofs: [],
      score: 92,
      trips: [
        {
          id: '00000000-0000-4000-8000-000000000100',
          status: firstTripStatus,
          stops: [
            stop({
              /** Spec 193 D6/R2: `receivedBy = 'required'` — pendência visível, nunca bloqueio. */
              deliveryProof: {
                photo: 'required',
                receivedBy: 'required',
                receiverDocument: 'off',
                receiverName: 'optional',
                signature: 'optional',
              },
              documents: [
                previewDocument({
                  hasProducts: true,
                  recipientName: 'Mercearia do Centro',
                  seed: 1,
                  volumes: 3,
                  weight: '12.50',
                }),
                previewDocument({
                  recipientName: 'Padaria Estrela',
                  seed: 2,
                  volumes: 2,
                  weight: '8.20',
                }),
              ],
              id: '00000000-0000-4000-8000-000000000101',
              label: 'Praça da Sé, 100 — Centro, São Paulo',
              latitude: -23.5505,
              longitude: -46.6333,
              sequence: 1,
              windowEnd: '2026-09-26T12:00:00.000Z',
              windowStart: '2026-09-26T11:00:00.000Z',
            }),
            stop({
              /** Spec 193 D14: destinatário PF — o botão rápido preenche sem selecionar o campo. */
              documents: [
                previewDocument({
                  recipientDisplayName: 'Fernanda Souza',
                  recipientIsCompany: false,
                  recipientName: 'Farmácia Bem Estar',
                  seed: 3,
                  volumes: 5,
                  weight: '20.00',
                }),
              ],
              id: '00000000-0000-4000-8000-000000000102',
              label: 'Av. Paulista, 1500 — Bela Vista, São Paulo',
              latitude: -23.5614,
              longitude: -46.6559,
              sequence: 2,
              windowEnd: null,
              windowStart: '2026-09-26T14:00:00.000Z',
            }),
            stop({
              documents: [
                previewDocument({
                  recipientName: 'Supermercado Bom Preço',
                  seed: 4,
                  volumes: 12,
                  weight: '145.80',
                }),
                previewDocument({
                  recipientName: 'Loja de Ferragens Silva',
                  seed: 5,
                  volumes: 4,
                  weight: '33.10',
                }),
                previewDocument({
                  recipientName: 'Restaurante Sabor da Casa',
                  seed: 6,
                  volumes: 1,
                  weight: '4.00',
                }),
              ],
              id: '00000000-0000-4000-8000-000000000103',
              label: 'Rua Vergueiro, 3000 — Vila Mariana, São Paulo',
              latitude: -23.5893,
              longitude: -46.6376,
              sequence: 3,
              windowEnd: null,
              windowStart: null,
            }),
          ],
          vehiclePlate: 'GCQ8E47',
        },
        {
          id: '00000000-0000-4000-8000-000000000300',
          status: 'route_planned',
          stops: [
            stop({
              documents: [
                previewDocument({
                  recipientName: 'Atacadão Zona Norte',
                  seed: 7,
                  volumes: 20,
                  weight: '310.00',
                }),
              ],
              id: '00000000-0000-4000-8000-000000000301',
              label: 'Av. Cruzeiro do Sul, 2000 — Santana, São Paulo',
              latitude: -23.5087,
              longitude: -46.6254,
              sequence: 1,
              windowEnd: null,
              windowStart: null,
            }),
          ],
          vehiclePlate: 'FXY2B31',
        },
      ],
    },
  }
}

/** Spec 206 RF8b: o `409 TRIP_HAS_STOP_EN_ROUTE` nomeia a parada bloqueante pela sequência. */
function findStopSequence(stopId: string): number | undefined {
  for (const trip of snapshot().data.trips) {
    const found = trip.stops.find((candidate) => candidate.id === stopId)
    if (found !== undefined) return found.sequence
  }
  return undefined
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    status,
  })
}

/**
 * Spec 206: o mesmo formato de erro da API real (`shared/api.error.ts`) — `error.details` como
 * lista de `{field, message}`, nunca um objeto solto. A tela nunca leu isto (lê só `error.code`),
 * mas divergir do formato real aqui confundiria quem checar esta demonstração contra a API depois.
 */
function apiError(input: {
  code: string
  details?: readonly { field: string; message: string }[]
  message: string
  status: number
}): Response {
  return json(
    {
      error: {
        code: input.code,
        ...(input.details === undefined ? {} : { details: input.details }),
        message: input.message,
      },
    },
    input.status,
  )
}

async function proxy(request: Request, url: URL): Promise<Response> {
  const target = `${REAL_API}${url.pathname}${url.search}`
  const headers = new Headers(request.headers)
  headers.delete('host')
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const response = await fetch(target, {
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    headers,
    method: request.method,
    redirect: 'manual',
  })
  const responseHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) responseHeaders.set(key, value)
  return new Response(response.body, { headers: responseHeaders, status: response.status })
}

/** Spec 247 (T5.3): o corpo do registro de ocorrência, em memória, para conferir o que a tela mandou. */
const recordedOccurrenceBodies: unknown[] = []

type RecordedLocation = { readonly location: unknown; readonly path: string }

/**
 * Spec 196 T5.4: o ponto de cada toque, guardado só em memória e **nunca impresso** — a coordenada
 * não vai a log. Quem confere o corpo que a app mandou lê `GET /__debug/locations` (e zera com `DELETE`).
 */
const recordedLocations: RecordedLocation[] = []

async function recordLocation(request: Request, path: string): Promise<void> {
  const body: unknown = await request.json().catch(() => undefined)
  if (typeof body !== 'object' || body === null || !('location' in body)) return
  recordedLocations.push({ location: body.location, path })
}

Bun.serve({
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS, status: 204 })
    }
    if (url.pathname === '/__debug/locations') {
      if (request.method === 'DELETE') recordedLocations.length = 0
      return json({ data: recordedLocations })
    }
    if (url.pathname === '/__debug/occurrences') return json({ data: recordedOccurrenceBodies })
    if (request.method === 'POST' && /\/documents\/[^/]+\/occurrences$/.test(url.pathname)) {
      recordedOccurrenceBodies.push(await request.clone().json())
    }
    if (request.method === 'POST' && url.pathname.startsWith('/me/trips/current/')) {
      await recordLocation(request.clone(), url.pathname)
    }

    if (url.pathname === '/me/trips/current' && request.method === 'GET') return json(snapshot())
    if (url.pathname === '/me/trips/current/occurrence-types') {
      return json({
        data: [
          {
            attachmentMode: 'optional',
            id: '00000000-0000-4000-8000-000000000901',
            name: 'Cliente ausente',
          },
          {
            attachmentMode: 'required',
            id: '00000000-0000-4000-8000-000000000904',
            name: 'Recusa total',
          },
          { id: '00000000-0000-4000-8000-000000000902', name: 'Avaria na carga' },
          { id: '00000000-0000-4000-8000-000000000903', name: 'Endereço não encontrado' },
        ],
      })
    }
    if (url.pathname === '/me/trips/current/start-route' && request.method === 'POST') {
      /** D10: fica, aceita e idempotente — para o PWA na versão antiga; a app nova não chama mais. */
      const changed = firstTripStatus !== 'on_delivery_route'
      firstTripStatus = 'on_delivery_route'
      return json({ data: { changed, status: firstTripStatus } })
    }
    /**
     * Spec 206 D1/D2/D4: "Iniciar rota" da PARADA — só uma por vez. `409 TRIP_HAS_STOP_EN_ROUTE`
     * quando outra já está a caminho, nomeando-a (RF8b); nada é gravado, e a chave não é liquidada.
     */
    const depart = /^\/me\/trips\/current\/stops\/([^/]+)\/depart$/.exec(url.pathname)
    if (depart !== null && request.method === 'POST') {
      const stopId = depart[1] ?? ''
      const idempotencyKey = request.headers.get('idempotency-key') ?? ''
      if (seenIdempotencyKeys.has(idempotencyKey))
        return json({ data: { changed: false, id: null } })
      if (enRouteStopId !== undefined && enRouteStopId !== stopId) {
        const sequence = findStopSequence(enRouteStopId)
        return apiError({
          code: 'TRIP_HAS_STOP_EN_ROUTE',
          details: [
            { field: 'enRouteStopId', message: enRouteStopId },
            { field: 'enRouteStopSequence', message: String(sequence ?? '') },
          ],
          message: 'Another stop of this trip is already en route.',
          status: 409,
        })
      }
      const body = (await request.json()) as { tappedAt?: string }
      seenIdempotencyKeys.add(idempotencyKey)
      enRouteStopId = stopId
      enRouteSince = new Date().toISOString()
      enRouteTappedAt = body.tappedAt ?? enRouteSince
      firstTripStatus = 'on_delivery_route'
      return json({ data: { changed: true, id: crypto.randomUUID() } }, 201)
    }
    /** Spec 206 D18: desfaz o "Iniciar rota" a qualquer momento antes do "Cheguei" — libera as outras. */
    const cancelDeparture = /^\/me\/trips\/current\/stops\/([^/]+)\/cancel-departure$/.exec(
      url.pathname,
    )
    if (cancelDeparture !== null && request.method === 'POST') {
      const stopId = cancelDeparture[1] ?? ''
      const idempotencyKey = request.headers.get('idempotency-key') ?? ''
      if (seenIdempotencyKeys.has(idempotencyKey))
        return json({ data: { changed: false, id: null } })
      if (arrivedStops.has(stopId)) {
        return apiError({
          code: 'TRIP_STOP_DEPARTURE_NOT_CANCELLABLE',
          details: [{ field: 'reason', message: 'arrived' }],
          message: 'The stop already arrived; its departure cannot be cancelled.',
          status: 409,
        })
      }
      seenIdempotencyKeys.add(idempotencyKey)
      if (enRouteStopId !== stopId) return json({ data: { changed: false, id: null } })
      enRouteStopId = undefined
      enRouteSince = null
      enRouteTappedAt = null
      return json({ data: { changed: true, id: crypto.randomUUID() } }, 201)
    }
    const arrive = /^\/me\/trips\/current\/stops\/([^/]+)\/arrive$/.exec(url.pathname)
    if (arrive !== null) {
      const stopId = arrive[1] ?? ''
      arrivedStops.add(stopId)
      /** Spec 206 D7: a chegada (canal `driver_app`) zera o "a caminho" de TODAS as paradas. */
      if (enRouteStopId === stopId) {
        enRouteStopId = undefined
        enRouteSince = null
        enRouteTappedAt = null
      }
      return json({ data: { changed: true } })
    }
    const deliver = /^\/me\/trips\/current\/documents\/([^/]+)\/deliver$/.exec(url.pathname)
    if (deliver !== null) {
      deliveredDocuments.add(deliver[1] ?? '')
      return json({ data: { changed: true } })
    }
    /** Spec 179: a URL assinada aponta para este mesmo processo, que faz o papel do bucket. */
    if (url.pathname.endsWith('/occurrence-uploads') && request.method === 'POST') {
      const id = crypto.randomUUID()
      return json(
        { data: { id, uploadUrl: `http://localhost:${PORT}/__object-storage/${id}` } },
        201,
      )
    }
    const storage = /^\/__object-storage\/([^/]+)$/.exec(url.pathname)
    if (storage !== null && request.method === 'PUT') {
      storedPhotos.set(storage[1] ?? '', (await request.arrayBuffer()).byteLength)
      return new Response(null, { headers: CORS_HEADERS, status: 200 })
    }
    const confirm = /\/occurrence-uploads\/([^/]+)\/confirm$/.exec(url.pathname)
    if (confirm !== null) {
      const id = confirm[1] ?? ''
      if (!storedPhotos.has(id)) {
        return apiError({
          code: 'TRIP_OCCURRENCE_UPLOAD_NOT_REACHABLE',
          message: 'Upload not found.',
          status: 404,
        })
      }
      return json({ data: { id } })
    }
    const returned = /^\/me\/trips\/current\/documents\/([^/]+)\/return$/.exec(url.pathname)
    if (returned !== null && request.method === 'POST') {
      const body = (await request.json()) as { reason?: string }
      returnedDocuments.set(returned[1] ?? '', body.reason ?? 'recipient_absent')
      return json({ data: { changed: true } }, 201)
    }
    /** Spec 193 D7: quem recebeu chegado depois do anexo — sempre "mudou", nunca 404 aqui. */
    const proofReceiver = /^\/me\/trips\/current\/documents\/([^/]+)\/proof\/receiver$/.exec(
      url.pathname,
    )
    if (proofReceiver !== null && request.method === 'PATCH') {
      return json({ data: { changed: true } })
    }
    if (url.pathname.startsWith('/me/trips/current/') && request.method === 'POST') {
      return json({ data: { changed: true, id: crypto.randomUUID(), punctuality: 'on_time' } }, 201)
    }
    if (url.pathname === '/me/location-consent') {
      if (request.method === 'PUT') {
        const body = (await request.json()) as { accepted?: boolean }
        consentAcceptedAt = body.accepted === true ? new Date().toISOString() : null
      }
      return json({ data: { acceptedAt: consentAcceptedAt } })
    }

    return proxy(request, url)
  },
  idleTimeout: 0,
  port: PORT,
})

console.log(
  `API de demonstração do motorista em http://localhost:${PORT} (repassa o resto para ${REAL_API})`,
)
