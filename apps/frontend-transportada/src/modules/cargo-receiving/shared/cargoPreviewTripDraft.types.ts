/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CargoPreviewLoadOrigin,
  CargoPreviewStateCounts,
  CargoPreviewStatus,
} from './cargoPreview.types'
import type { CARGO_TRIP_DRAFT_CANNOT_PROPOSE_REASONS } from './cargoPreviewTripDraft.constant'

export type CargoTripDraftCannotProposeReason =
  (typeof CARGO_TRIP_DRAFT_CANNOT_PROPOSE_REASONS)[number]

/** ⚠️ O formato real de `cargo-preview-trip-draft.types.ts` da API: a guarda confere as chaves EXATAS. */
export type CargoPreviewTripDraftCity = Readonly<{
  cityIbgeCode: string | null
  cityName: string | null
  documentCount: number
  pendingLineCount: number
}>

export type CargoPreviewTripDraftDocument = Readonly<{
  cityIbgeCode: string | null
  cityName: string | null
  documentId: string
  isInLiveTrip: boolean
  isRoutable: boolean
  lineCount: number
  number: string
  recipientName: string | null
  series: string
  status: string
  totalValue: string
  weightKg: string | null
}>

export type CargoPreviewTripDraftTotals = Readonly<{
  value: string
  volumeM3: string | null
  weightKg: string
}>

export type CargoPreviewTripDraftRoute = Readonly<{
  canPropose: boolean
  cannotProposeReason: CargoTripDraftCannotProposeReason | null
  cities: readonly CargoPreviewTripDraftCity[]
  counts: CargoPreviewStateCounts
  documents: readonly CargoPreviewTripDraftDocument[]
  linkedTotals: Readonly<{ value: string; weightKg: string }>
  loadOrigin: CargoPreviewLoadOrigin | null
  loadReference: string | null
  missingCount: number
  plannedDate: string | null
  routableDocumentIds: readonly string[]
  /** `null` é o grupo "sem roteiro". */
  routeName: string | null
  totals: CargoPreviewTripDraftTotals
}>

export type CargoPreviewTripDraftSummary = Readonly<{
  canPropose: boolean
  counts: CargoPreviewStateCounts
  inLiveTripDocumentCount: number
  linkedDocumentCount: number
  missingCount: number
  routableDocumentCount: number
  routeCount: number
}>

export type CargoPreviewTripDrafts = Readonly<{
  contractorId: string
  plannedDate: string | null
  previewId: string
  /** O que vai ao roteirizador: as notas vinculadas e roteáveis de todos os roteiros. */
  routableDocumentIds: readonly string[]
  routes: readonly CargoPreviewTripDraftRoute[]
  status: CargoPreviewStatus
  summary: CargoPreviewTripDraftSummary
}>

/** Quem está olhando a prévia: escrever é `trip.manage`; a empresa e as permissões alimentam a frota do roteirizador. */
export type CargoPreviewSession = Readonly<{
  canManage: boolean
  companyId: string | undefined
  permissions: readonly string[]
}>
