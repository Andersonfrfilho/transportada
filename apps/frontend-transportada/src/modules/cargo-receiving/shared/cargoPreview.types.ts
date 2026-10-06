/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CARGO_PREVIEW_DECIDERS,
  CARGO_PREVIEW_ITEM_STATES,
  CARGO_PREVIEW_LOAD_ORIGINS,
  CARGO_PREVIEW_SOURCES,
  CARGO_PREVIEW_STATUSES,
} from './cargoPreview.constant'

export type CargoPreviewStatus = (typeof CARGO_PREVIEW_STATUSES)[number]
export type CargoPreviewItemState = (typeof CARGO_PREVIEW_ITEM_STATES)[number]
export type CargoPreviewDecider = (typeof CARGO_PREVIEW_DECIDERS)[number]
export type CargoPreviewLoadOrigin = (typeof CARGO_PREVIEW_LOAD_ORIGINS)[number]
export type CargoPreviewSource = (typeof CARGO_PREVIEW_SOURCES)[number]

export type CargoPreviewStateCounts = Readonly<Record<CargoPreviewItemState | 'total', number>>

export type CargoPreviewSummary = Readonly<{
  arrivalId: string | null
  contractorId: string
  contractorName: string | null
  createdAt: string
  errorCode: string | null
  fileName: string
  fileSha256: string
  fileSizeBytes: number
  id: string
  plannedDate: string | null
  receivedAt: string
  rowCount: number | null
  sheetName: string | null
  source: CargoPreviewSource
  status: CargoPreviewStatus
  updatedAt: string
}>

export type CargoPreviewRouteGroup = Readonly<{
  counts: CargoPreviewStateCounts
  loadOrigin: CargoPreviewLoadOrigin | null
  loadReference: string | null
  routeName: string
}>

export type CargoPreviewLinkedDocument = Readonly<{
  id: string
  importedAt: string
  issuedAt: string
  number: string
  recipientName: string | null
  series: string
  totalValue: string
}>

/** `column` e `message` vêm do leitor da planilha: o painel traduz o que conhece e mostra o resto cru. */
export type CargoPreviewRowError = Readonly<{ column: string; field: string; message: string }>

export type CargoPreviewItem = Readonly<{
  address: string | null
  candidateDocumentIds: readonly string[]
  city: string | null
  contractorReference: string | null
  document: CargoPreviewLinkedDocument | null
  evidence: readonly string[]
  id: string
  matchGroupKey: string | null
  matchState: CargoPreviewItemState
  matchedAt: string | null
  matchedBy: CargoPreviewDecider | null
  neighborhood: string | null
  postalCode: string | null
  recipientCode: string | null
  recipientName: string | null
  routeName: string | null
  routingDate: string | null
  rowErrors: readonly CargoPreviewRowError[]
  rowNumber: number
  state: string | null
  value: string | null
  volumeM3: string | null
  weightKg: string | null
}>

export type CargoPreviewItemPage = Readonly<{
  items: readonly CargoPreviewItem[]
  /** O número da última linha devolvida, quando há mais. */
  nextCursor: string | null
}>

export type CargoPreviewDetail = CargoPreviewSummary &
  Readonly<{
    counts: CargoPreviewStateCounts
    items: CargoPreviewItemPage
    routes: readonly CargoPreviewRouteGroup[]
  }>

export type CargoPreviewArrivalProposal = Readonly<{
  contractorId: string
  documentIds: readonly string[]
  plannedDate: string | null
  previewId: string
  refused: readonly Readonly<{ documentId: string; reason: string }>[]
}>

export type CargoPreviewItemAction = 'confirm' | 'link' | 'unlink'

export type CargoPreviewItemOutcome = Readonly<{
  itemIds: readonly string[]
  outcome: 'changed' | 'unchanged'
}>

export type CargoPreviewPage<TItem> = Readonly<{
  items: readonly TItem[]
  nextCursor: string | null
}>

export type CargoPreviewListFilters = Readonly<{
  contractorId?: string
  status?: CargoPreviewStatus
}>

/** O filtro de itens que o servidor aceita: um estado e um roteiro por vez, cursor por linha. */
export type CargoPreviewItemFilters = Readonly<{
  afterRow: string | null
  routeName?: string
  state?: CargoPreviewItemState
}>

export type UploadCargoPreviewInput = Readonly<{ contractorId: string; file: File }>

export type UploadCargoPreviewResult = Readonly<{
  isReplay: boolean
  preview: CargoPreviewSummary
}>

/** A chegada que a prévia propõe, levada à tela de registro; a hora, o operador confirma. */
export type CargoArrivalPrefill = Readonly<{
  contractorId: string
  documentIds: readonly string[]
  /** O dia planejado da prévia: só referência para o operador, nunca o dia da chegada. */
  plannedDate: string | null
  previewId: string
}>
