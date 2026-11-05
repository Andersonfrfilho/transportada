/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EventClockFields } from '../domain/occurred-at.policy.js'
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
  readonly location: ReportedLocation | null
  readonly now: Date
  readonly stopId: string
  readonly tappedAt: Date
}

export type StopArrivalStepInput = FieldTripLocator &
  EventClockFields & {
    readonly actorUserId: string
    readonly companyId: string
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
  readonly stop: DriverStopReference
}
