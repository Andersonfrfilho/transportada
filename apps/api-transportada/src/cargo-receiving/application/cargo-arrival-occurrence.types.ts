/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9): o que entra e sai da ocorrência de recebimento e da marcação
 * "devolver ao contratante". Empresa, ator e canal vêm do contexto e da composição, nunca do corpo.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  CargoArrivalReturnState,
  CargoArrivalStatus,
  CargoArrivalDocumentState,
} from '../../shared/cargo-arrival.constant.js'
import type {
  RedeliveryPolicy,
  TripFieldChannel,
  TripOccurrenceCaseStatus,
} from '../../database/trip.schema.js'
import type { DeliveryProofFieldMode } from '../../database/company-delivery-proof-settings.schema.js'
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceAttachmentView } from '../../trips/application/occurrence-attachment.service.js'
import type { OccurrenceItemView } from '../../trips/infrastructure/occurrence-items.support.js'
import type { CargoArrivalReturnAction } from '../domain/cargo-arrival-return.policy.js'

export type CargoArrivalOccurrenceAttachment = {
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
}

export type RegisterCargoArrivalOccurrenceParams = {
  readonly arrivalId: string
  readonly attachment: CargoArrivalOccurrenceAttachment
  readonly context: CompanyContext
  readonly correlationId: string
  /** O id da NF-e: a nota está numa chegada só (ADR-0094 §6). */
  readonly documentId: string
  readonly idempotencyKey: string
  readonly note: string
  readonly occurrenceTypeId: string
  readonly productCode: string
  readonly productCodes: readonly string[]
  readonly productQuantities: readonly string[]
  readonly productQuantityUnits: readonly string[]
}

export type ReceivingOccurrenceType = {
  readonly active: boolean
  readonly allowsMultipleItems: boolean
  readonly id: string
  readonly itemsMode: DeliveryProofFieldMode
  readonly name: string
  readonly redeliveryPolicy: RedeliveryPolicy
  readonly stage: TripOccurrenceStage
}

export type ReceivingOccurrenceTypeView = Pick<
  ReceivingOccurrenceType,
  'allowsMultipleItems' | 'id' | 'itemsMode' | 'name'
>

export type LockedOccurrenceArrival = {
  readonly contractorId: string
  readonly separationDueAt: Date | null
  readonly status: CargoArrivalStatus
}

export type LockedOccurrenceDocument = {
  readonly id: string
  readonly isInLiveTrip: boolean
  readonly nfeDocumentId: string
  readonly returnOccurrenceId: string | null
  readonly returnToContractor: CargoArrivalReturnState
  readonly separationState: CargoArrivalDocumentState
}

export type CargoArrivalOccurrenceCaseView = {
  readonly id: string
  readonly status: TripOccurrenceCaseStatus
}

export type CargoArrivalOccurrenceView = {
  readonly actorName: string | null
  readonly attachments: readonly OccurrenceAttachmentView[]
  readonly cancelledAt: string | null
  /** A tratativa (spec 164): as seis ações de `/trip-occurrences/:id/case/*` a conduzem. */
  readonly case: CargoArrivalOccurrenceCaseView | null
  readonly channel: TripFieldChannel
  readonly createdAt: string
  readonly id: string
  readonly items: readonly OccurrenceItemView[]
  readonly nfeDocumentId: string
  readonly note: string
  readonly occurrenceTypeId: string
  readonly typeName: string
}

export type CargoArrivalDocumentReturnView = {
  readonly nfeDocumentId: string
  readonly returnOccurrenceId: string | null
  readonly returnToContractor: CargoArrivalReturnState
}

/** A marcação por nota sai aqui, não na leitura da chegada (ADR-0094 §9.5, ajuste 6). */
export type CargoArrivalOccurrencesView = {
  readonly documents: readonly CargoArrivalDocumentReturnView[]
  readonly occurrences: readonly CargoArrivalOccurrenceView[]
  readonly returnCounts: { readonly marked: number; readonly returned: number }
}

export type RegisteredCargoArrivalOccurrence = {
  readonly isReplay: boolean
  readonly occurrence: CargoArrivalOccurrenceView
}

export type ChangeCargoArrivalReturnParams = {
  readonly action: CargoArrivalReturnAction
  readonly arrivalId: string
  readonly context: CompanyContext
  readonly correlationId: string
  readonly documentId: string
  readonly note: string
  /** Só para marcar: a ocorrência de recebimento desta nota que motiva a devolução. */
  readonly occurrenceId: string | null
}

export type CargoArrivalReturnResult = {
  readonly documentId: string
  readonly outcome: 'changed' | 'unchanged'
  readonly returnOccurrenceId: string | null
  readonly returnToContractor: CargoArrivalReturnState
}
