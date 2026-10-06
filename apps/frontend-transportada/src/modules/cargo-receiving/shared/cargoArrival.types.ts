/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CARGO_ARRIVAL_STATUSES, CARGO_DOCUMENT_STATES } from './cargoReceiving.constant'

export type CargoArrivalStatus = (typeof CARGO_ARRIVAL_STATUSES)[number]
export type CargoDocumentState = (typeof CARGO_DOCUMENT_STATES)[number]
/** O destino de um lote: a API só aceita `received` e `separated`, nunca voltar para `expected`. */
export type CargoTransitionTarget = Exclude<CargoDocumentState, 'expected'>

export type CargoStateCounts = Readonly<Record<CargoDocumentState | 'total', number>>

export type CargoArrivalSummary = Readonly<{
  arrivedAt: string
  contractorId: string
  contractorName: string
  counts: CargoStateCounts
  createdAt: string
  deliveryDeadlineBusinessDays: number | null
  id: string
  isSeparationOverdue: boolean
  palletCount: number | null
  reference: string | null
  separationDueAt: string | null
  separationWindowHours: number | null
  status: CargoArrivalStatus
}>

export type CargoArrivalDocument = Readonly<{
  accessKey: string
  cityIbgeCode: string | null
  cityName: string | null
  /** Só leitura: o vínculo com a viagem é do fluxo de viagem. */
  isInLiveTrip: boolean
  nfeDocumentId: string
  number: string
  receivedAt: string | null
  recipientName: string | null
  routeName: string | null
  separatedAt: string | null
  separationState: CargoDocumentState
  series: string
}>

export type CargoArrivalGroup = Readonly<{
  cityIbgeCode: string | null
  counts: CargoStateCounts
  documents: readonly CargoArrivalDocument[]
  routeName: string | null
}>

export type CargoArrivalDetail = CargoArrivalSummary &
  Readonly<{ groups: readonly CargoArrivalGroup[] }>

export type AvailableCargoDocument = Readonly<{
  accessKey: string
  cityIbgeCode: string | null
  cityName: string | null
  id: string
  issuedAt: string
  number: string
  recipientName: string | null
  series: string
  state: string | null
  totalValue: string
}>

export type CargoDocumentOutcome =
  | Readonly<{ documentId: string; outcome: 'changed' | 'unchanged' }>
  | Readonly<{ documentId: string; outcome: 'refused'; reason: string }>

export type CargoPage<TItem> = Readonly<{
  items: readonly TItem[]
  nextCursor: string | null
}>

/** A projeção mínima do contratante: a tela só precisa de quem é, nunca do restante da ficha. */
export type CargoContractor = Readonly<{
  displayName: string
  id: string
  taxId: string
}>

export type RegisterCargoArrivalInput = Readonly<{
  arrivedAt: string
  contractorId: string
  documentIds: readonly string[]
  palletCount?: number
  reference?: string
}>

export type RegisterCargoArrivalResult = Readonly<{
  arrival: CargoArrivalDetail
  isReplay: boolean
}>

export type CloseCargoArrivalResult = Readonly<{
  arrivalId: string
  outcome: 'changed' | 'unchanged'
}>

/** As colunas que o servidor ordena (`cargo-arrival-list-query.schema.ts`); cópia por valor. */
export type CargoArrivalOrder = Readonly<{
  direction: 'asc' | 'desc'
  sort: 'arrivedAt' | 'contractorName' | 'separationDueAt' | 'status'
}>

/** Tudo o que a lista pede ao servidor; sem `order` ele responde `arrivedAt desc`. */
export type CargoArrivalFilters = Readonly<{
  contractorIds: readonly string[]
  order: CargoArrivalOrder | undefined
  statuses: readonly CargoArrivalStatus[]
}>
