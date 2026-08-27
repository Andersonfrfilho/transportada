/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ChargeBatch,
  ChargeBatchItem,
  Delivery,
  DeliveryLocation,
  DeliverySchedule,
} from './portal.types'

/**
 * A resposta da API é **entrada não confiável** como qualquer outra fronteira (`security.md` §3), e
 * este app não usa zod — a validação é type guard escrito à mão, igual ao painel.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

export function toDeliveries(payload: unknown): readonly Delivery[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  return payload.data.filter(isRecord).map((row) => ({
    accessKey: readString(row, 'accessKey'),
    deliveredAt: readNullableString(row, 'deliveredAt'),
    estimatedArrivalAt: readNullableString(row, 'estimatedArrivalAt'),
    issuedAt: readString(row, 'issuedAt'),
    number: readString(row, 'number'),
    returnReason: readNullableString(row, 'returnReason'),
    separationStatus: readNullableString(row, 'separationStatus'),
    series: readString(row, 'series'),
    tripStatus: readNullableString(row, 'tripStatus'),
  }))
}

/** `data: null` é ausência de posição agora — e é o caso normal, não erro. */
export function toDeliveryLocation(payload: unknown): DeliveryLocation | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null
  const row = payload.data
  const latitude = readString(row, 'latitude')
  const longitude = readString(row, 'longitude')
  if (latitude === '' || longitude === '') return null

  return { latitude, longitude, recordedAt: readString(row, 'recordedAt') }
}

export function toDeliverySchedule(payload: unknown): DeliverySchedule | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null
  const row = payload.data

  return {
    divergedAt: readNullableString(row, 'divergedAt'),
    notes: readString(row, 'notes'),
    protocol: readString(row, 'protocol'),
    scheduledAt: readNullableString(row, 'scheduledAt'),
    status: readString(row, 'status'),
  }
}

function toChargeBatchItem(row: Record<string, unknown>): ChargeBatchItem {
  return {
    amount: readString(row, 'amount'),
    chargedOn: readString(row, 'chargedOn'),
    chargeType: readString(row, 'chargeType'),
    clientName: readString(row, 'clientName'),
    id: readString(row, 'id'),
    notes: readString(row, 'notes'),
    rejectionReason: readString(row, 'rejectionReason'),
    status: readString(row, 'status'),
  }
}

function toChargeBatch(row: Record<string, unknown>): ChargeBatch | null {
  if (!isRecord(row.batch)) return null
  const batch = row.batch

  return {
    batch: {
      closedAt: readString(batch, 'closedAt'),
      id: readString(batch, 'id'),
      periodEnd: readString(batch, 'periodEnd'),
      periodStart: readString(batch, 'periodStart'),
      status: readString(batch, 'status'),
      totalAmount: readString(batch, 'totalAmount'),
    },
    items: Array.isArray(row.items) ? row.items.filter(isRecord).map(toChargeBatchItem) : [],
    itemsTotal: readString(row, 'itemsTotal'),
  }
}

export function toChargeBatches(payload: unknown): readonly ChargeBatch[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  return payload.data
    .filter(isRecord)
    .map(toChargeBatch)
    .filter((batch): batch is ChargeBatch => batch !== null)
}

export function toSingleChargeBatch(payload: unknown): ChargeBatch | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null

  return toChargeBatch(payload.data)
}
