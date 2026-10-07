/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CARGO_OCCURRENCE_CASE_STATUSES,
  CARGO_OCCURRENCE_ITEMS_MODES,
  CARGO_RETURN_ACTIONS,
  CARGO_RETURN_STATES,
} from './cargoOccurrence.constant'

export type CargoReturnState = (typeof CARGO_RETURN_STATES)[number]
export type CargoReturnAction = (typeof CARGO_RETURN_ACTIONS)[number]
export type CargoOccurrenceCaseStatus = (typeof CARGO_OCCURRENCE_CASE_STATUSES)[number]
export type CargoOccurrenceItemsMode = (typeof CARGO_OCCURRENCE_ITEMS_MODES)[number]

/** `GET /cargo-arrivals/occurrence-types`: só os tipos de recebimento ativos. */
export type ReceivingOccurrenceType = Readonly<{
  allowsMultipleItems: boolean
  id: string
  itemsMode: CargoOccurrenceItemsMode
  name: string
}>

/** `GET /cargo-arrivals/:id/documents/:documentId/products`: decimais em texto, sem NCM nem CFOP. */
export type CargoDocumentProduct = Readonly<{
  code: string
  commercialUnit: string
  description: string
  ordinal: number
  quantity: string
  totalValue: string
  unitValue: string
}>

export type CargoOccurrenceAttachment = Readonly<{
  downloadUrl?: string
  expired: boolean
  expiresAt?: string
  id: string
  mimeType: string
  position: number
  thumbnailUrl?: string
}>

export type CargoOccurrenceItem = Readonly<{
  code: string
  description: string
  /** Decimal em texto; `null` é item sem contagem — nunca zero. */
  quantity: string | null
  unit: string | null
}>

export type CargoOccurrenceCase = Readonly<{ id: string; status: CargoOccurrenceCaseStatus }>

export type CargoOccurrenceView = Readonly<{
  actorName: string | null
  attachments: readonly CargoOccurrenceAttachment[]
  cancelledAt: string | null
  case: CargoOccurrenceCase | null
  channel: string
  createdAt: string
  id: string
  items: readonly CargoOccurrenceItem[]
  nfeDocumentId: string
  note: string
  occurrenceTypeId: string
  typeName: string
}>

export type CargoDocumentReturn = Readonly<{
  nfeDocumentId: string
  returnOccurrenceId: string | null
  returnToContractor: CargoReturnState
}>

/** A marcação por nota e as contagens saem só desta rota: a leitura da chegada não ganhou chave. */
export type CargoOccurrencesView = Readonly<{
  documents: readonly CargoDocumentReturn[]
  occurrences: readonly CargoOccurrenceView[]
  returnCounts: Readonly<{ marked: number; returned: number }>
}>

export type RegisterCargoOccurrenceResult = Readonly<{
  isReplay: boolean
  occurrence: CargoOccurrenceView
}>

export type CargoReturnResult = Readonly<{
  documentId: string
  outcome: 'changed' | 'unchanged'
  returnOccurrenceId: string | null
  returnToContractor: CargoReturnState
}>

export type ChangeCargoReturnInput = Readonly<{
  action: CargoReturnAction
  arrivalId: string
  documentId: string
  note: string
  /** Só para marcar: a avaria desta nota que motiva a devolução. */
  occurrenceId?: string | undefined
}>
