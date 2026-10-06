/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: o que o repositório devolve (datas como `Date`) e o que a rota serializa (texto).
 */
import type {
  CargoArrivalDocumentState,
  CargoArrivalStatus,
} from '../../shared/cargo-arrival.constant.js'
import type {
  ArrivalDocumentGroup,
  ArrivalStateCounts,
} from '../domain/cargo-arrival-grouping.policy.js'

export type Page<TItem> = {
  readonly items: readonly TItem[]
  readonly nextCursor: string | null
}

export type CargoArrivalRecord = {
  readonly arrivedAt: Date
  readonly contractorId: string
  readonly contractorName: string
  readonly createdAt: Date
  readonly deliveryDeadlineBusinessDays: number | null
  readonly id: string
  readonly palletCount: number | null
  readonly reference: string | null
  readonly separationDueAt: Date | null
  readonly separationWindowHours: number | null
  readonly status: CargoArrivalStatus
}

export type CargoArrivalListRecord = CargoArrivalRecord & { readonly counts: ArrivalStateCounts }

export type CargoArrivalDocumentRecord = {
  readonly accessKey: string
  readonly cityIbgeCode: string | null
  readonly cityName: string | null
  /** A nota já está numa viagem viva — só leitura; o vínculo é do fluxo de viagem. */
  readonly isInLiveTrip: boolean
  readonly nfeDocumentId: string
  readonly number: string
  readonly receivedAt: Date | null
  readonly recipientName: string | null
  readonly routeName: string | null
  readonly separatedAt: Date | null
  readonly separationState: CargoArrivalDocumentState
  readonly series: string
}

export type CargoArrivalDetailRecord = {
  readonly arrival: CargoArrivalRecord
  readonly documents: readonly CargoArrivalDocumentRecord[]
}

export type CargoArrivalSummary = Omit<
  CargoArrivalRecord,
  'arrivedAt' | 'createdAt' | 'separationDueAt'
> & {
  readonly arrivedAt: string
  readonly counts: ArrivalStateCounts
  readonly createdAt: string
  readonly isSeparationOverdue: boolean
  readonly separationDueAt: string | null
}

export type CargoArrivalDocumentView = Omit<
  CargoArrivalDocumentRecord,
  'receivedAt' | 'separatedAt'
> & {
  readonly receivedAt: string | null
  readonly separatedAt: string | null
}

export type CargoArrivalDetail = CargoArrivalSummary & {
  readonly groups: readonly ArrivalDocumentGroup<CargoArrivalDocumentView>[]
}

export type AvailableArrivalDocument = {
  readonly accessKey: string
  readonly cityIbgeCode: string | null
  readonly cityName: string | null
  readonly id: string
  readonly issuedAt: string
  readonly number: string
  readonly recipientName: string | null
  readonly series: string
  readonly state: string | null
  readonly totalValue: string
}

export type { CargoArrivalDocumentOutcome } from '../domain/cargo-arrival-transition.policy.js'
