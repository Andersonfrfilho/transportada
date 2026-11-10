/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EventClockFields, RecordedEventClock } from '../domain/occurred-at.policy.js'
import type {
  DriverFieldReportTransactionPort,
  DriverStopReference,
  ReportedLocation,
} from './driver-field-report.port.js'
import type { FieldAuthorship, FieldTripLocator } from './field-trip-target.types.js'
import type { OfficeAuditRequest } from './trip-field-office-audit.port.js'

export type StopDepartureStepInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  /** Spec 294 RF27: a tripulação confirmou gravar fora da ordem da parada; o escritório nunca manda. */
  readonly confirmOutOfOrder?: boolean
  readonly location: ReportedLocation | null
  readonly now: Date
  readonly stopId: string
  readonly tappedAt: Date
}

export type StopArrivalStepInput = FieldTripLocator &
  EventClockFields & {
    readonly actorUserId: string
    readonly companyId: string
    /** Spec 294 RF27: a tripulação confirmou gravar fora da ordem da parada; o escritório nunca manda. */
    readonly confirmOutOfOrder?: boolean
    /**
     * Spec 315 (D5): a hora em que o motorista disse ter chegado, informada na ocorrência de parada. Grava `arrived_at` e
     * `occurred_at` nessa hora e `recorded_at` em `now`; como a chegada do escritório, é retroativa e não desloca a
     * previsão das paradas pendentes. O escritório não usa: ele já informa a hora em `now`.
     */
    readonly informedAt?: Date
    readonly location: ReportedLocation | null
    readonly now: Date
    readonly officeAudit?: OfficeAuditRequest
    readonly recordedAt?: Date
    readonly stopId: string
  }

export type StopDepartureStepResult = { readonly changed: boolean; readonly id: string | null }

export type PerformStopDepartureParams = {
  readonly authorship: FieldAuthorship
  readonly input: StopDepartureStepInput
  readonly transaction: DriverFieldReportTransactionPort
}

export type ApplyStopDepartureParams = PerformStopDepartureParams & {
  readonly resolvedTappedAt: Date | null
  readonly tripId: string
}

export type PerformStopArrivalParams = {
  readonly authorship: FieldAuthorship
  readonly input: StopArrivalStepInput
  readonly transaction: DriverFieldReportTransactionPort
}

export type ApplyStopArrivalParams = PerformStopArrivalParams & {
  readonly isOffice: boolean
  /** Spec 294: a chegada marcada junto leva a hora do evento pedido e não desloca a previsão. */
  readonly recordedTogether?: { readonly clock: RecordedEventClock }
  readonly stop: DriverStopReference
}
