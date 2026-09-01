/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FreightCalculationStatus } from '../../database/freight.schema.js'
import type { NfeDocumentStatus } from '../../database/nfe.schema.js'
import type { tripDocuments, tripDrivers, tripStops, trips } from '../../database/trip.schema.js'
import type {
  Trip,
  TripDocument,
  TripDocumentDetail,
  TripStopDetail,
} from '../application/trip.port.js'
import type { TripDriverLine } from '../domain/trip.policy.js'

type TripDocumentRecord = typeof tripDocuments.$inferSelect
type TripDriverRecord = typeof tripDrivers.$inferSelect
type TripRecord = typeof trips.$inferSelect
type TripStopRecord = typeof tripStops.$inferSelect

export function mapTrip(record: TripRecord): Trip {
  return {
    companyId: record.companyId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    requiresMdfe: record.requiresMdfe,
    requiresMdfeReason: record.requiresMdfeReason,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    vehicleId: record.vehicleId,
  }
}

export function mapTripDocument(record: TripDocumentRecord): TripDocument {
  return {
    createdAt: record.createdAt.toISOString(),
    deliveredAt: record.deliveredAt === null ? null : record.deliveredAt.toISOString(),
    freightCalculationId: record.freightCalculationId,
    id: record.id,
    loadedAt: record.loadedAt === null ? null : record.loadedAt.toISOString(),
    nfeDocumentId: record.nfeDocumentId,
    releasedAt: record.releasedAt === null ? null : record.releasedAt.toISOString(),
    returnedAt: record.returnedAt === null ? null : record.returnedAt.toISOString(),
    returnReason: record.returnReason,
    separatedAt: record.separatedAt === null ? null : record.separatedAt.toISOString(),
    separationStatus: record.separationStatus,
    stopId: record.stopId,
    tripId: record.tripId,
    updatedAt: record.updatedAt.toISOString(),
  }
}

export function mapTripStop(record: TripStopRecord): Omit<TripStopDetail, 'documents'> {
  return {
    addressKey: record.addressKey,
    arrivedAt: record.arrivedAt === null ? null : record.arrivedAt.toISOString(),
    completedAt: record.completedAt === null ? null : record.completedAt.toISOString(),
    deliveryWindowEnd:
      record.deliveryWindowEnd === null ? null : record.deliveryWindowEnd.toISOString(),
    deliveryWindowStart:
      record.deliveryWindowStart === null ? null : record.deliveryWindowStart.toISOString(),
    id: record.id,
    label: record.label,
    sequence: Number(record.sequence),
  }
}

/**
 * `fiscalStatus` vem do join com `nfe_documents`/`freight_calculations` (XOR garantido pelo check
 * `trip_documents_entity_xor_check` no banco) — nunca ambos preenchidos, nunca ambos nulos.
 * `cteAuthorized` é um dado de leitura separado (T011): reflete se já existe `cte_fiscal_documents`
 * autorizado para a nota, não o status da própria NF-e/frete. O gate de bloqueio na ação "emitir
 * MDF-e" continua no frontend (ADR-0023 §3) — este campo só alimenta essa decisão.
 */
export function mapTripDocumentDetail(input: {
  readonly cteAuthorized: boolean
  readonly document: TripDocumentRecord
  readonly freightCalculationStatus: FreightCalculationStatus | null
  readonly nfeDocumentStatus: NfeDocumentStatus | null
}): TripDocumentDetail {
  const fiscalStatus = input.nfeDocumentStatus ?? input.freightCalculationStatus
  if (fiscalStatus === null) throw new Error('TRIP_DOCUMENT_FISCAL_STATUS_MISSING')
  return { ...mapTripDocument(input.document), cteAuthorized: input.cteAuthorized, fiscalStatus }
}

export function mapTripDriver(record: TripDriverRecord): TripDriverLine {
  return {
    driverId: record.driverId,
    driverName: record.driverName,
    driverTaxId: record.driverTaxId,
    position: Number(record.position),
  }
}
