/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  Contractor,
  DeliveryCharge,
  ExtraChargeBatch,
  ExtraChargeBatchReport,
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
    chargeType: readString(value.chargeType) as DeliveryCharge['chargeType'],
    chargedOn: readString(value.chargedOn),
    contractorId: readNullableString(value.contractorId),
    deliveryClientId: readString(value.deliveryClientId),
    id: readString(value.id),
    notes: readText(value.notes),
    origin: readText(value.origin),
    rejectionReason: readText(value.rejectionReason),
    status: readString(value.status) as DeliveryCharge['status'],
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
        chargeType: readString(item.chargeType) as DeliveryCharge['chargeType'],
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
