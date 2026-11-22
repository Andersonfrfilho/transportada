/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPendingItemPageAdapter } from './pendingItemsResponse.validation'

export type PendingItemKind =
  | 'addressSuggestedByDriver'
  | 'canhotoOtherDocument'
  | 'vehicleBodyTypeMissing'

export type GeoPoint = Readonly<{ latitude: number; longitude: number }>

export type AddressSuggestionDetails = Readonly<{
  addressKey: string
  /** O ponto gravado hoje para o endereço; `null` quando ele ainda não tinha coordenada. */
  current: GeoPoint | null
  distanceMeters: null | number
  suggested: GeoPoint
  tripStopId: null | string
}>

export type VehiclePendingItem = Readonly<{
  entityId: string
  entityType: 'vehicle'
  kind: 'vehicleBodyTypeMissing'
  label: string
}>

export type AddressSuggestionPendingItem = Readonly<{
  details: AddressSuggestionDetails
  entityId: string
  entityType: 'addressSuggestion'
  kind: 'addressSuggestedByDriver'
  label: string
}>

/**
 * Spec 344 T5d (D9): a foto de uma nota que parece ser de outra. `Aplicar` move a foto
 * (`proof/move`), `Descartar` mantém e some o alerta (`proof/mismatch/dismiss`); ambos pedem
 * `trip.manage` e agem na prova, nunca por texto. `movable` só vale quando a nota certa é desta
 * mesma viagem e ainda aceita a foto — senão só há "Descartar".
 */
export type CanhotoOtherDocumentDetails = Readonly<{
  /** A nota da prova: é o `:documentId` das duas rotas. */
  documentId: string
  kind: 'other_document' | 'other_series'
  movable: boolean
  readNumber: string
  readSeries: null | string
  targetCanhotoApproved: boolean | null
  targetDocumentId: null | string
  targetNumber: null | string
  targetSameTrip: boolean | null
  targetSeries: null | string
  tripId: string
}>

export type CanhotoOtherDocumentPendingItem = Readonly<{
  details: CanhotoOtherDocumentDetails
  entityId: string
  entityType: 'canhotoProof'
  kind: 'canhotoOtherDocument'
  /** O número da nota a que a prova está anexada. */
  label: string
}>

export type PendingItem =
  | AddressSuggestionPendingItem
  | CanhotoOtherDocumentPendingItem
  | VehiclePendingItem

export type CanhotoOtherDocumentDecision = 'apply' | 'dismiss'

export type AddressSuggestionDecision = 'apply' | 'dismiss'

export type PendingItemPage = Readonly<{
  items: readonly PendingItem[]
  nextCursor: null | string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type PendingItemsClient = Readonly<{
  listPendingItems: (
    input: Readonly<{ cursor?: null | string; limit?: number }>,
  ) => Promise<PendingItemPage>
  decideAddressSuggestion: (
    input: Readonly<{ decision: AddressSuggestionDecision; suggestionId: string }>,
  ) => Promise<void>
  /** Spec 344 T5d: Aplicar move a foto para a NF certa; Descartar mantém e some o alerta. */
  decideCanhotoOtherDocument: (
    input: Readonly<{
      decision: CanhotoOtherDocumentDecision
      item: CanhotoOtherDocumentPendingItem
    }>,
  ) => Promise<void>
}>

/** "Aplicar" da linha: a foto é de outra nota — o motivo da lista fechada que diz isso. */
const CANHOTO_OTHER_DOCUMENT_MOVE_REASON = 'wrong_document'

function requestError(code: string): Error {
  return new Error(code)
}

function createSearch(input: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  return search.toString()
}

async function authorizedRequest(
  input: Readonly<{
    dependencies: ClientDependencies
    body?: string
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: input.method,
      }),
    )
  } catch {
    throw requestError('PENDING_ITEMS_REQUEST_FAILED')
  }
  if (!response.ok) throw requestError('PENDING_ITEMS_REQUEST_FAILED')
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('PENDING_ITEMS_RESPONSE_INVALID')
  }
}

/**
 * T18 (revisão, MENOR 10): "carregar mais" acumula, nunca troca de página — extraída como função
 * pura para o contrato provar a soma sem montar `useInfiniteQuery` nem o DOM (este app não testa
 * tela, só serviço puro e texto de fonte).
 */
export function flattenPendingItemPages(pages: readonly PendingItemPage[]): readonly PendingItem[] {
  return pages.flatMap((page) => page.items)
}

/** Decisão otimista: a sugestão decidida sai da lista na hora, em todas as páginas já lidas. */
export function removePendingItemFromPages(
  input: Readonly<{ entityId: string; pages: readonly PendingItemPage[] }>,
): readonly PendingItemPage[] {
  return input.pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => item.entityId !== input.entityId),
  }))
}

/** O cursor de "carregar mais" é sempre o da **última** página lida, nunca o das anteriores. */
export function lastPendingItemsCursor(pages: readonly PendingItemPage[]): null | string {
  return pages.at(-1)?.nextCursor ?? null
}

export function createPendingItemsClient(dependencies: ClientDependencies): PendingItemsClient {
  const adapters = createPendingItemPageAdapter()
  return {
    async decideAddressSuggestion(input) {
      await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `/address-correction-suggestions/${encodeURIComponent(input.suggestionId)}/${input.decision}`,
      })
    },
    async decideCanhotoOtherDocument(input) {
      const { details } = input.item
      const documentPath = `/trips/${encodeURIComponent(details.tripId)}/documents/${encodeURIComponent(details.documentId)}`
      if (input.decision === 'dismiss') {
        await authorizedRequest({
          dependencies,
          method: 'POST',
          path: `${documentPath}/proof/mismatch/dismiss`,
        })
        return
      }
      if (details.targetDocumentId === null) throw requestError('PENDING_ITEMS_REQUEST_FAILED')
      await authorizedRequest({
        body: JSON.stringify({
          reason: CANHOTO_OTHER_DOCUMENT_MOVE_REASON,
          targetDocumentId: details.targetDocumentId,
        }),
        dependencies,
        method: 'POST',
        path: `${documentPath}/proof/move`,
      })
    },
    async listPendingItems(input) {
      return adapters.pageFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: `/pending-items?${createSearch({ cursor: input.cursor, limit: input.limit })}`,
        }),
      )
    },
  }
}
