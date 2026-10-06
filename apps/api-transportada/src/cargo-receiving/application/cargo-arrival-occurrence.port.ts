/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: as portas da ocorrência de recebimento e da marcação. Cada escrita é uma transação
 * só, que trava a chegada antes de tudo e a nota depois (a ordem da Fase 2); os métodos da transação
 * já vêm presos à empresa e à chegada do contexto.
 */
import type { CargoArrivalChannel } from '../../shared/cargo-arrival.constant.js'
import type { TripOccurrenceCaseStatus } from '../../database/trip.schema.js'
import type { TripDocumentProduct } from '../../trips/application/read-trip-document-products.use-case.js'
import type { OccurrenceItemQuantity } from '../../trips/domain/occurrence-item-quantity.policy.js'
import type { CargoArrivalReturnMark } from '../domain/cargo-arrival-return.policy.js'
import type { CargoArrivalReturnAction } from '../domain/cargo-arrival-return.policy.js'
import type {
  CargoArrivalOccurrenceView,
  CargoArrivalOccurrencesView,
  LockedOccurrenceArrival,
  LockedOccurrenceDocument,
  ReceivingOccurrenceType,
  ReceivingOccurrenceTypeView,
} from './cargo-arrival-occurrence.types.js'

export type ArrivalScope = { readonly arrivalId: string; readonly companyId: string }

export type DocumentProduct = {
  readonly code: string
  readonly commercialUnit?: string
  readonly description: string
}

export type SaveCargoArrivalOccurrenceInput = {
  readonly actorUserId: string
  readonly arrivalDocumentId: string
  readonly channel: CargoArrivalChannel
  readonly contractorId: string
  readonly correlationId: string
  readonly fingerprint: string
  readonly idempotencyKey: string
  readonly items: readonly OccurrenceItemQuantity[]
  readonly note: string
  readonly now: Date
  readonly occurrenceType: ReceivingOccurrenceType
  readonly productCode: string
}

export type StoreOccurrenceObjectInput = {
  readonly id: string
  readonly mimeType: string
  readonly objectKey: string
  readonly purpose: 'trip_occurrence_attachment' | 'trip_occurrence_thumbnail'
  readonly retentionUntil: Date
  readonly sha256: string
  readonly sizeBytes: number
}

export type CargoArrivalOccurrenceTransactionPort = {
  findOccurrenceType(occurrenceTypeId: string): Promise<ReceivingOccurrenceType | null>
  /** O reenvio: a mesma chave, procurada DEPOIS da trava da chegada (ajuste 4 da revisão). */
  findReplay(
    idempotencyKey: string,
  ): Promise<{ readonly fingerprint: string; readonly occurrenceId: string } | null>
  insertAttachment(input: {
    readonly occurrenceId: string
    readonly storedObjectId: string
    readonly thumbnailObjectId: string | null
  }): Promise<void>
  insertStoredObject(input: StoreOccurrenceObjectInput): Promise<void>
  listDocumentProducts(nfeDocumentId: string): Promise<readonly DocumentProduct[]>
  lockArrival(): Promise<LockedOccurrenceArrival | null>
  lockDocument(nfeDocumentId: string): Promise<LockedOccurrenceDocument | null>
  /** Ocorrência, itens, tratativa, trilha, auditoria e chave de idempotência, nesta transação. */
  saveOccurrence(input: SaveCargoArrivalOccurrenceInput): Promise<{ readonly id: string }>
}

export type CargoArrivalOccurrenceUnitOfWork = {
  execute<TResult>(input: {
    readonly operation: (transaction: CargoArrivalOccurrenceTransactionPort) => Promise<TResult>
    readonly scope: ArrivalScope
  }): Promise<TResult>
}

export type ApplyCargoArrivalReturnInput = {
  readonly action: CargoArrivalReturnAction
  readonly actorUserId: string
  readonly arrivalDocumentId: string
  readonly channel: CargoArrivalChannel
  readonly contractorId: string
  readonly correlationId: string
  readonly from: CargoArrivalReturnMark
  readonly next: CargoArrivalReturnMark
  readonly note: string
  readonly now: Date
}

export type CargoArrivalReturnTransactionPort = {
  applyReturn(input: ApplyCargoArrivalReturnInput): Promise<void>
  findCaseStatus(occurrenceId: string): Promise<TripOccurrenceCaseStatus | null>
  /** `null` quando a ocorrência não é de recebimento DESTA nota da chegada. */
  findDocumentOccurrence(input: {
    readonly arrivalDocumentId: string
    readonly occurrenceId: string
  }): Promise<{ readonly id: string; readonly isCancelled: boolean } | null>
  lockArrival(): Promise<LockedOccurrenceArrival | null>
  lockDocument(nfeDocumentId: string): Promise<LockedOccurrenceDocument | null>
}

export type CargoArrivalReturnUnitOfWork = {
  execute<TResult>(input: {
    readonly operation: (transaction: CargoArrivalReturnTransactionPort) => Promise<TResult>
    readonly scope: ArrivalScope
  }): Promise<TResult>
}

export type CargoArrivalOccurrenceReadPort = {
  findOccurrence(
    scope: ArrivalScope & { readonly occurrenceId: string },
  ): Promise<CargoArrivalOccurrenceView | null>
  /** `null` quando a chegada não é desta empresa. */
  listOccurrences(
    scope: ArrivalScope & { readonly nfeDocumentId: string | null },
  ): Promise<CargoArrivalOccurrencesView | null>
  listReceivingTypes(companyId: string): Promise<readonly ReceivingOccurrenceTypeView[]>
}

export type ArrivalDocumentProductsResult =
  | { readonly outcome: 'arrival-not-found' }
  | { readonly outcome: 'document-not-found' }
  | { readonly outcome: 'found'; readonly products: readonly TripDocumentProduct[] }

export type CargoArrivalDocumentProductsReadPort = {
  /** Os itens da nota DESTA chegada, da empresa do escopo; fora disso nunca devolve item. */
  listArrivalDocumentProducts(
    scope: ArrivalScope & { readonly nfeDocumentId: string },
  ): Promise<ArrivalDocumentProductsResult>
}
