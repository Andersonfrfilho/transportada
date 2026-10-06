/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: parâmetros e resultados entre caso de uso e repositório. Empresa, ator e canal
 * chegam sempre do contexto e da composição, nunca do corpo.
 */
import type { Paging } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  CargoArrivalChannel,
  CargoArrivalStatus,
} from '../../shared/cargo-arrival.constant.js'
import type { ArrivalCandidateRefusal } from '../domain/cargo-arrival-candidate.policy.js'
import type {
  CargoArrivalListCursor,
  CargoArrivalListOrder,
} from '../domain/cargo-arrival-list-order.policy.js'
import type { CargoArrivalTransitionTarget } from '../domain/cargo-arrival-transition.policy.js'
import type { CargoArrivalDocumentOutcome } from './cargo-arrival.types.js'

type Authorship = {
  readonly actorUserId: string
  readonly channel: CargoArrivalChannel
  readonly companyId: string
}

export type RegisterCargoArrivalInput = {
  readonly arrivedAt: Date
  readonly contractorId: string
  readonly documentIds: readonly string[]
  readonly palletCount: number | null
  readonly reference: string | null
}

export type RegisterCargoArrivalRecordParams = Authorship &
  RegisterCargoArrivalInput & {
    readonly correlationId: string
    readonly idempotencyKey: string
    readonly requestFingerprint: string
  }

export type RegisterCargoArrivalRecordResult =
  | { readonly kind: 'contractor_not_found' | 'key_reused' | 'not_enabled' }
  | { readonly kind: 'refused'; readonly refusals: readonly ArrivalCandidateRefusal[] }
  | { readonly arrivalId: string; readonly kind: 'created' | 'replayed' }

export type TransitionCargoArrivalRecordParams = Authorship & {
  readonly arrivalId: string
  readonly documentIds: readonly string[]
  readonly now: Date
  readonly to: CargoArrivalTransitionTarget
}

export type CargoArrivalBatchRecordResult =
  | { readonly kind: 'arrival_not_found' }
  | { readonly kind: 'done'; readonly results: readonly CargoArrivalDocumentOutcome[] }

export type AssignCargoArrivalRouteRecordParams = Authorship & {
  readonly arrivalId: string
  readonly documentIds: readonly string[]
  readonly now: Date
  readonly routeName: string | null
}

export type AssignCargoArrivalRouteRecordResult =
  | CargoArrivalBatchRecordResult
  | { readonly kind: 'closed' }
  | { readonly kind: 'missing'; readonly documentIds: readonly string[] }

export type CloseCargoArrivalRecordParams = Authorship & {
  readonly arrivalId: string
  readonly correlationId: string
  readonly now: Date
}

export type CloseCargoArrivalRecordResult =
  | { readonly kind: 'already_closed' | 'arrival_not_found' | 'closed' }
  | { readonly documentIds: readonly string[]; readonly kind: 'pending' }

export type ListAvailableArrivalDocumentsRecordParams = {
  readonly companyId: string
  readonly contractorId: string
  readonly paging: Paging
}

/** Lista vazia é "sem filtro"; vários valores são OU entre si (spec 237, M3). */
export type ListCargoArrivalsFilters = {
  readonly contractorIds: readonly string[]
  readonly statuses: readonly CargoArrivalStatus[]
}

export type CargoArrivalListPaging = {
  readonly cursor: CargoArrivalListCursor | null
  readonly limit: number
}

export type ListCargoArrivalsRecordParams = {
  readonly companyId: string
  readonly filters: ListCargoArrivalsFilters
  readonly order: CargoArrivalListOrder
  readonly paging: CargoArrivalListPaging
}

export type FindCargoArrivalRecordParams = {
  readonly arrivalId: string
  readonly companyId: string
}

type ContextParams = { readonly context: CompanyContext }

export type RegisterCargoArrivalParams = ContextParams & {
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly input: RegisterCargoArrivalInput
}

export type GetCargoArrivalParams = ContextParams & { readonly arrivalId: string }

export type ListCargoArrivalsParams = ContextParams & {
  readonly filters: ListCargoArrivalsFilters
  readonly order: CargoArrivalListOrder
  readonly paging: CargoArrivalListPaging
}

export type ListAvailableArrivalDocumentsParams = ContextParams & {
  readonly contractorId: string
  readonly paging: Paging
}

export type ChangeCargoArrivalDocumentStateParams = GetCargoArrivalParams & {
  readonly documentId: string
  readonly to: CargoArrivalTransitionTarget
}

export type BatchCargoArrivalStatusParams = GetCargoArrivalParams & {
  readonly documentIds: readonly string[]
  readonly to: CargoArrivalTransitionTarget
}

export type AssignCargoArrivalRouteParams = GetCargoArrivalParams & {
  readonly documentIds: readonly string[]
  readonly routeName: string | null
}

export type CloseCargoArrivalParams = GetCargoArrivalParams & { readonly correlationId: string }
