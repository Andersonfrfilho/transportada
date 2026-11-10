/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DELIVERY_CHARGE_STATUSES,
  DELIVERY_CHARGE_TYPES,
  type DeliveryChargeStatus,
  type DeliveryChargeType,
} from './extraCharges.types'
import type {
  Contractor,
  DeliveryCharge,
  ExtraChargeBatch,
  ExtraChargeBatchReport,
  OccurrenceChargeReportPage,
  OccurrenceChargeReportPhoto,
  OccurrenceChargeReportReceivingCharge,
  OccurrenceChargeReportRow,
} from './extraCharges.types'

/** Resposta de API é entrada não confiável — e aqui ela vira dinheiro cobrado de outra empresa. */
export class ExtraChargeResponseError extends Error {
  public constructor() {
    super('EXTRA_CHARGE_RESPONSE_INVALID')
    this.name = 'ExtraChargeResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new ExtraChargeResponseError()
  return value
}

/**
 * ⚠️ O `as DeliveryChargeType` que estava aqui deixava passar qualquer texto, e a tabela imprimia
 * a chave de tradução crua (`chargeType.returned_goods`) quando o vocabulário da API andava e o
 * daqui não. Vocabulário fechado se **confere**, nunca se afirma.
 */
function readChargeType(value: unknown): DeliveryChargeType {
  const chargeType = readString(value)
  if (!(DELIVERY_CHARGE_TYPES as readonly string[]).includes(chargeType)) {
    throw new ExtraChargeResponseError()
  }
  return chargeType as DeliveryChargeType
}

function readChargeStatus(value: unknown): DeliveryChargeStatus {
  const status = readString(value)
  if (!(DELIVERY_CHARGE_STATUSES as readonly string[]).includes(status)) {
    throw new ExtraChargeResponseError()
  }
  return status as DeliveryChargeStatus
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return readString(value)
}

function toCharge(value: unknown): DeliveryCharge {
  if (!isRecord(value)) throw new ExtraChargeResponseError()

  return {
    /** Valor é **texto** do começo ao fim: convertê-lo para número aqui perderia centavo adiante. */
    amount: readString(value.amount),
    batchId: readNullableString(value.batchId),
    chargeType: readChargeType(value.chargeType),
    chargedOn: readString(value.chargedOn),
    contractorId: readNullableString(value.contractorId),
    deliveryClientId: readString(value.deliveryClientId),
    id: readString(value.id),
    notes: readText(value.notes),
    origin: readText(value.origin),
    rejectionReason: readText(value.rejectionReason),
    status: readChargeStatus(value.status),
  }
}

export function toChargePage(payload: unknown): readonly DeliveryCharge[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new ExtraChargeResponseError()
  return payload.data.map(toCharge)
}

function toBatch(value: unknown): ExtraChargeBatch {
  if (!isRecord(value)) throw new ExtraChargeResponseError()

  return {
    closedAt: readString(value.closedAt),
    contractorId: readString(value.contractorId),
    id: readString(value.id),
    periodEnd: readString(value.periodEnd),
    periodStart: readString(value.periodStart),
    status: readString(value.status),
    totalAmount: readString(value.totalAmount),
  }
}

export function toBatchResponse(payload: unknown): ExtraChargeBatch {
  if (!isRecord(payload)) throw new ExtraChargeResponseError()
  return toBatch(payload.data)
}

export function toBatchReport(payload: unknown): ExtraChargeBatchReport {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new ExtraChargeResponseError()
  const data = payload.data
  if (!Array.isArray(data.items)) throw new ExtraChargeResponseError()

  return {
    batch: toBatch(data.batch),
    contractorName: readText(data.contractorName),
    items: data.items.map((item) => {
      if (!isRecord(item)) throw new ExtraChargeResponseError()
      return {
        amount: readString(item.amount),
        chargeType: readChargeType(item.chargeType),
        chargedOn: readString(item.chargedOn),
        clientName: readText(item.clientName),
        id: readString(item.id),
        notes: readText(item.notes),
        rejectionReason: readText(item.rejectionReason),
        status: readString(item.status),
      }
    }),
    itemsTotal: readString(data.itemsTotal),
  }
}

function toOccurrenceChargeReportRow(value: unknown): OccurrenceChargeReportRow {
  if (!isRecord(value)) throw new ExtraChargeResponseError()
  if (typeof value.hasSettlement !== 'boolean') throw new ExtraChargeResponseError()

  return {
    accessKey: readNullableString(value.accessKey),
    amount: readString(value.amount),
    chargeType: readChargeType(value.chargeType),
    chargedOn: readString(value.chargedOn),
    contractorId: readNullableString(value.contractorId),
    hasSettlement: value.hasSettlement,
    id: readString(value.id),
    noteNumber: readNullableString(value.noteNumber),
    noteSeries: readNullableString(value.noteSeries),
    occurrenceId: readNullableString(value.occurrenceId),
    photos: readReportPhotos(value.photos),
    receivingCharge: readReceivingCharge(value.receivingCharge),
    status: readChargeStatus(value.status),
    stopOccurrenceId: readNullableString(value.stopOccurrenceId),
    tripDocumentId: readNullableString(value.tripDocumentId),
    tripId: readNullableString(value.tripId),
  }
}

/**
 * Spec 317: leitura tolerante dos campos novos — a API pode ir a staging antes do painel, e resposta sem eles
 * (ou com foto malformada) mostra a linha sem foto em vez de derrubar a tela.
 */
function readReportPhotos(value: unknown): readonly OccurrenceChargeReportPhoto[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): OccurrenceChargeReportPhoto[] => {
    if (!isRecord(entry)) return []
    const { expiresAt, label, slotKey, url } = entry
    if (
      typeof expiresAt !== 'string' ||
      typeof label !== 'string' ||
      typeof slotKey !== 'string' ||
      typeof url !== 'string'
    ) {
      return []
    }
    return [{ expiresAt, label, slotKey, url }]
  })
}

function readReceivingCharge(value: unknown): OccurrenceChargeReportReceivingCharge | null {
  if (!isRecord(value)) return null
  const paidBy = value.paidBy === 'driver' || value.paidBy === 'company' ? value.paidBy : null
  return {
    driverPayoutSentAt: readNullableString(value.driverPayoutSentAt),
    driverPixKey: readNullableString(value.driverPixKey),
    driverPixKeyType: readNullableString(value.driverPixKeyType),
    paidBy,
  }
}

/** RF28: `GET /occurrence-charges/report` — página de linhas ainda sem lote, mais o total conferido. */
export function toOccurrenceChargeReportPage(payload: unknown): OccurrenceChargeReportPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.page)) {
    throw new ExtraChargeResponseError()
  }
  const totals = payload.totals
  if (!isRecord(totals) || !Array.isArray(totals.byChargeType)) {
    throw new ExtraChargeResponseError()
  }
  const nextCursor = payload.page.nextCursor
  if (nextCursor !== null && typeof nextCursor !== 'string') throw new ExtraChargeResponseError()

  return {
    items: payload.data.map(toOccurrenceChargeReportRow),
    nextCursor,
    totals: {
      byChargeType: totals.byChargeType.map((entry) => {
        if (!isRecord(entry) || typeof entry.count !== 'number') {
          throw new ExtraChargeResponseError()
        }
        return {
          amount: readString(entry.amount),
          chargeType: readChargeType(entry.chargeType),
          count: entry.count,
        }
      }),
      totalAmount: readString(totals.totalAmount),
      totalCount: typeof totals.totalCount === 'number' ? totals.totalCount : 0,
    },
  }
}

export function toContractors(payload: unknown): readonly Contractor[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new ExtraChargeResponseError()

  return payload.data.map((value) => {
    if (!isRecord(value)) throw new ExtraChargeResponseError()
    return {
      closingPeriod: readText(value.closingPeriod),
      displayName: readText(value.displayName),
      id: readString(value.id),
      taxId: readString(value.taxId),
    }
  })
}
