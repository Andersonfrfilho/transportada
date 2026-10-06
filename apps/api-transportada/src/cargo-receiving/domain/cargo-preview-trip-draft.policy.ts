/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1 (RF7): cada `RouteName` da planilha vira um RASCUNHO de viagem — só leitura, nada é
 * criado (ADR-0044 §5). Entram como nota do rascunho apenas as `matched`; `suggested` espera o operador.
 * A nota roteável é a que o roteirizador aceita: autorizada e fora de viagem viva (a mesma conta de
 * `findUnavailableDocumentIds`), e fora do que outra regra tirou (`excludedDocumentIds`).
 */
import { CARGO_PREVIEW_ITEM_STATE } from '../../shared/cargo-preview.constant.js'
import { buildTripDraftCities } from './cargo-preview-trip-draft-city.policy.js'
import { compareDocuments, sortRouteNames } from './cargo-preview-trip-draft-order.policy.js'
import {
  buildLinkedTotals,
  buildPlanilhaTotals,
  countStates,
} from './cargo-preview-trip-draft-totals.policy.js'
import {
  TRIP_DRAFT_CANNOT_PROPOSE,
  type CargoPreviewTripDraftDocument,
  type CargoPreviewTripDraftRoute,
  type CargoPreviewTripDrafts,
  type TripDraftCannotProposeReason,
  type TripDraftDocumentRow,
  type TripDraftInput,
  type TripDraftItemRow,
} from './cargo-preview-trip-draft.types.js'

const AUTHORIZED_STATUS = 'authorized'
const { awaitingXml, invalid, matched } = CARGO_PREVIEW_ITEM_STATE

export type IsDocumentRoutableParams = {
  readonly document: TripDraftDocumentRow
  readonly excludedDocumentIds: ReadonlySet<string>
}

/** O único portão: a nota marcada "devolver ao contratante" (RF8a) entra em `excludedDocumentIds`. */
export function isCargoPreviewDocumentRoutable(params: IsDocumentRoutableParams): boolean {
  if (params.excludedDocumentIds.has(params.document.id)) return false
  return params.document.status === AUTHORIZED_STATUS && !params.document.isInLiveTrip
}

function groupByRoute(items: readonly TripDraftItemRow[]): Map<string | null, TripDraftItemRow[]> {
  const groups = new Map<string | null, TripDraftItemRow[]>()
  for (const item of items)
    groups.set(item.routeName, [...(groups.get(item.routeName) ?? []), item])
  return groups
}

function reasonToNotPropose(input: {
  readonly linkedCount: number
  readonly routableCount: number
}): TripDraftCannotProposeReason | null {
  if (input.linkedCount === 0) return TRIP_DRAFT_CANNOT_PROPOSE.noLinkedDocuments
  return input.routableCount === 0 ? TRIP_DRAFT_CANNOT_PROPOSE.noneRoutable : null
}

function toDocumentView(
  params: IsDocumentRoutableParams & { readonly lineCount: number },
): CargoPreviewTripDraftDocument {
  const { document } = params
  return {
    cityIbgeCode: document.cityIbgeCode,
    cityName: document.cityName,
    documentId: document.id,
    isInLiveTrip: document.isInLiveTrip,
    isRoutable: isCargoPreviewDocumentRoutable(params),
    lineCount: params.lineCount,
    number: document.number,
    recipientName: document.recipientName,
    series: document.series,
    status: document.status,
    totalValue: document.totalValue,
    weightKg: document.grossWeightKg,
  }
}

/** As notas que as linhas `matched` do roteiro fecham, uma vez cada, na ordem estável. */
function linkedDocuments(input: {
  readonly documentsById: ReadonlyMap<string, TripDraftDocumentRow>
  readonly items: readonly TripDraftItemRow[]
}): readonly { readonly document: TripDraftDocumentRow; readonly lineCount: number }[] {
  const lines = new Map<string, number>()
  for (const item of input.items) {
    if (item.matchState !== matched || item.matchedDocumentId === null) continue
    lines.set(item.matchedDocumentId, (lines.get(item.matchedDocumentId) ?? 0) + 1)
  }
  return [...lines.entries()]
    .flatMap(([documentId, lineCount]) => {
      const document = input.documentsById.get(documentId)
      return document === undefined ? [] : [{ document, lineCount }]
    })
    .sort((left, right) => compareDocuments(left.document, right.document))
}

type RouteParams = {
  readonly documentsById: ReadonlyMap<string, TripDraftDocumentRow>
  readonly input: TripDraftInput
  readonly items: readonly TripDraftItemRow[]
  readonly routeName: string | null
}

function buildRoute(params: RouteParams): CargoPreviewTripDraftRoute {
  const { excludedDocumentIds, preview, routeLoads } = params.input
  const { items, routeName } = params
  const linked = linkedDocuments({ documentsById: params.documentsById, items })
  const documents = linked.map(({ document, lineCount }) =>
    toDocumentView({ document, excludedDocumentIds, lineCount }),
  )
  const routableIds = documents.filter((entry) => entry.isRoutable).map((entry) => entry.documentId)
  const load = routeLoads.find((entry) => routeName !== null && entry.routeName === routeName)
  const valid = items.filter((item) => item.matchState !== invalid)
  return {
    canPropose: routableIds.length > 0,
    cannotProposeReason: reasonToNotPropose({
      linkedCount: documents.length,
      routableCount: routableIds.length,
    }),
    cities: buildTripDraftCities({
      documents: linked.map((entry) => entry.document),
      pendingItems: valid.filter((item) => item.matchState !== matched),
    }),
    counts: countStates(items),
    documents,
    linkedTotals: buildLinkedTotals(documents),
    loadOrigin: load?.origin ?? null,
    loadReference: load?.loadReference ?? null,
    missingCount: items.filter((item) => item.matchState === awaitingXml).length,
    plannedDate: preview.plannedDate,
    routableDocumentIds: routableIds,
    routeName,
    totals: buildPlanilhaTotals(valid),
  }
}

function collectIds(
  routes: readonly CargoPreviewTripDraftRoute[],
  pick: (document: CargoPreviewTripDraftDocument) => boolean,
): string[] {
  return [
    ...new Set(
      routes.flatMap((route) =>
        route.documents.filter(pick).map((document) => document.documentId),
      ),
    ),
  ]
}

export function buildCargoPreviewTripDrafts(input: TripDraftInput): CargoPreviewTripDrafts {
  const documentsById = new Map(input.documents.map((document) => [document.id, document]))
  const groups = groupByRoute(input.items)
  const routes = sortRouteNames([...groups.keys()]).map((routeName) =>
    buildRoute({ documentsById, input, items: groups.get(routeName) ?? [], routeName }),
  )
  const routableDocumentIds = collectIds(routes, (document) => document.isRoutable)
  return {
    contractorId: input.preview.contractorId,
    plannedDate: input.preview.plannedDate,
    previewId: input.preview.id,
    routableDocumentIds,
    routes,
    status: input.preview.status,
    summary: {
      canPropose: routableDocumentIds.length > 0,
      counts: countStates(input.items),
      inLiveTripDocumentCount: collectIds(routes, (document) => document.isInLiveTrip).length,
      linkedDocumentCount: collectIds(routes, () => true).length,
      missingCount: input.items.filter((item) => item.matchState === awaitingXml).length,
      routableDocumentCount: routableDocumentIds.length,
      routeCount: routes.filter((route) => route.routeName !== null).length,
    },
  }
}
