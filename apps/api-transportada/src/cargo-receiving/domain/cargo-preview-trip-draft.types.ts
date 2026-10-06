/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1 (RF7): as linhas que o repositório traz e o que a política devolve. Decimais em texto
 * (nunca float); o painel guarda as chaves exatas, então chave nova é decisão, não acaso.
 */
import type {
  CargoPreviewItemState,
  CargoPreviewRouteLoadOrigin,
  CargoPreviewStatus,
} from '../../shared/cargo-preview.constant.js'

export type TripDraftPreviewRow = {
  readonly contractorId: string
  readonly id: string
  readonly plannedDate: string | null
  readonly status: CargoPreviewStatus
}

export type TripDraftItemRow = {
  readonly city: string | null
  readonly matchState: CargoPreviewItemState
  readonly matchedDocumentId: string | null
  readonly routeName: string | null
  readonly rowNumber: number
  readonly state: string | null
  readonly value: string | null
  readonly volumeM3: string | null
  readonly weightKg: string | null
}

export type TripDraftRouteLoadRow = {
  readonly loadReference: string
  readonly origin: CargoPreviewRouteLoadOrigin
  readonly routeName: string
}

export type TripDraftDocumentRow = {
  readonly cityIbgeCode: string | null
  readonly cityName: string | null
  readonly grossWeightKg: string | null
  readonly id: string
  readonly isInLiveTrip: boolean
  readonly number: string
  readonly recipientName: string | null
  readonly series: string
  readonly state: string | null
  readonly status: string
  readonly totalValue: string
}

export type TripDraftInput = {
  readonly documents: readonly TripDraftDocumentRow[]
  /** RF8a (Fase 3): as notas que outra regra tirou da recomendação. Hoje nenhuma. */
  readonly excludedDocumentIds: ReadonlySet<string>
  readonly items: readonly TripDraftItemRow[]
  readonly preview: TripDraftPreviewRow
  readonly routeLoads: readonly TripDraftRouteLoadRow[]
}

export type CargoPreviewTripDraftCounts = Readonly<Record<CargoPreviewItemState, number>> & {
  readonly total: number
}

export type CargoPreviewTripDraftCity = {
  readonly cityIbgeCode: string | null
  readonly cityName: string | null
  /** Notas vinculadas, uma vez cada. */
  readonly documentCount: number
  /** Linhas da planilha ainda sem nota (esperando o XML, sugeridas ou ambíguas). */
  readonly pendingLineCount: number
}

export type CargoPreviewTripDraftDocument = {
  readonly cityIbgeCode: string | null
  readonly cityName: string | null
  readonly documentId: string
  readonly isInLiveTrip: boolean
  readonly isRoutable: boolean
  /** Quantas linhas da planilha fecham esta nota (n linhas ↔ 1 nota). */
  readonly lineCount: number
  readonly number: string
  readonly recipientName: string | null
  readonly series: string
  readonly status: string
  readonly totalValue: string
  readonly weightKg: string | null
}

export type CargoPreviewTripDraftTotals = {
  readonly value: string
  readonly volumeM3: string | null
  readonly weightKg: string
}

export const TRIP_DRAFT_CANNOT_PROPOSE = {
  noLinkedDocuments: 'no_linked_documents',
  noneRoutable: 'none_routable',
} as const
export type TripDraftCannotProposeReason =
  (typeof TRIP_DRAFT_CANNOT_PROPOSE)[keyof typeof TRIP_DRAFT_CANNOT_PROPOSE]

export type CargoPreviewTripDraftRoute = {
  readonly canPropose: boolean
  readonly cannotProposeReason: TripDraftCannotProposeReason | null
  readonly cities: readonly CargoPreviewTripDraftCity[]
  readonly counts: CargoPreviewTripDraftCounts
  readonly documents: readonly CargoPreviewTripDraftDocument[]
  /** Valor e peso das notas vinculadas (da NF-e), cada uma uma vez. */
  readonly linkedTotals: { readonly value: string; readonly weightKg: string }
  readonly loadOrigin: CargoPreviewRouteLoadOrigin | null
  readonly loadReference: string | null
  /** As linhas ainda esperando o XML: o estado normal logo depois do envio, nunca um erro. */
  readonly missingCount: number
  readonly plannedDate: string | null
  readonly routableDocumentIds: readonly string[]
  /** `null` é o grupo "sem roteiro". */
  readonly routeName: string | null
  /** O que a planilha traz do roteiro inteiro, vinculado ou não. */
  readonly totals: CargoPreviewTripDraftTotals
}

export type CargoPreviewTripDraftSummary = {
  readonly canPropose: boolean
  readonly counts: CargoPreviewTripDraftCounts
  readonly inLiveTripDocumentCount: number
  readonly linkedDocumentCount: number
  readonly missingCount: number
  readonly routableDocumentCount: number
  readonly routeCount: number
}

export type CargoPreviewTripDrafts = {
  readonly contractorId: string
  readonly plannedDate: string | null
  readonly previewId: string
  /** Todas as notas vinculadas e roteáveis, na ordem dos roteiros: o que vai ao roteirizador. */
  readonly routableDocumentIds: readonly string[]
  readonly routes: readonly CargoPreviewTripDraftRoute[]
  readonly status: CargoPreviewStatus
  readonly summary: CargoPreviewTripDraftSummary
}
