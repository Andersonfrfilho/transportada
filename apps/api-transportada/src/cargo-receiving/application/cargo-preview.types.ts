/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: o que a prévia mostra ao painel. Decimais em texto, datas em ISO; a nota vinculada
 * vem com número, destinatário e valor da NF, para o operador conferir sem abrir outra tela.
 */
import type {
  CargoPreviewDecidedBy,
  CargoPreviewFailureCode,
  CargoPreviewItemState,
  CargoPreviewRouteLoadOrigin,
  CargoPreviewSource,
  CargoPreviewStatus,
} from '../../shared/cargo-preview.constant.js'

export type CargoPreviewSummary = {
  readonly arrivalId: string | null
  readonly contractorId: string
  readonly contractorName: string | null
  readonly createdAt: string
  readonly errorCode: CargoPreviewFailureCode | null
  readonly fileName: string
  readonly fileSha256: string
  readonly fileSizeBytes: number
  readonly id: string
  readonly plannedDate: string | null
  readonly receivedAt: string
  readonly rowCount: number | null
  readonly sheetName: string | null
  readonly source: CargoPreviewSource
  readonly status: CargoPreviewStatus
  readonly updatedAt: string
}

export type CargoPreviewStateCounts = Readonly<Record<CargoPreviewItemState, number>> & {
  readonly total: number
}

export type CargoPreviewRouteGroup = {
  readonly counts: CargoPreviewStateCounts
  readonly loadOrigin: CargoPreviewRouteLoadOrigin | null
  readonly loadReference: string | null
  readonly routeName: string
}

export type CargoPreviewLinkedDocument = {
  readonly id: string
  readonly importedAt: string
  readonly issuedAt: string
  readonly number: string
  readonly recipientName: string | null
  readonly series: string
  readonly totalValue: string
}

export type CargoPreviewItemView = {
  readonly address: string | null
  readonly candidateDocumentIds: readonly string[]
  readonly city: string | null
  readonly contractorReference: string | null
  readonly document: CargoPreviewLinkedDocument | null
  readonly evidence: readonly string[]
  readonly id: string
  readonly matchGroupKey: string | null
  readonly matchState: CargoPreviewItemState
  readonly matchedAt: string | null
  readonly matchedBy: CargoPreviewDecidedBy | null
  readonly neighborhood: string | null
  readonly postalCode: string | null
  readonly recipientCode: string | null
  readonly recipientName: string | null
  readonly routeName: string | null
  readonly routingDate: string | null
  readonly rowErrors: readonly Readonly<Record<string, unknown>>[]
  readonly rowNumber: number
  readonly state: string | null
  readonly value: string | null
  readonly volumeM3: string | null
  readonly weightKg: string | null
}

export type CargoPreviewItemPage = {
  readonly items: readonly CargoPreviewItemView[]
  /** O número da última linha devolvida, quando há mais. */
  readonly nextCursor: string | null
}

export type CargoPreviewDetail = CargoPreviewSummary & {
  readonly counts: CargoPreviewStateCounts
  readonly items: CargoPreviewItemPage
  readonly routes: readonly CargoPreviewRouteGroup[]
}

export type CargoPreviewArrivalProposal = {
  readonly contractorId: string
  readonly documentIds: readonly string[]
  readonly plannedDate: string | null
  readonly previewId: string
  readonly refused: readonly {
    readonly documentId: string
    readonly reason: string
  }[]
}
