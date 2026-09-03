/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripValuation, ValuationSource } from './tripValuation.service'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSource(value: unknown): value is ValuationSource {
  return value === 'estimated' || value === 'measured'
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readGap(value: unknown): null | string {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Corpo malformado vira **ausência**, não exceção: a conta prevista é informação de apoio, e
 * derrubar a tela da viagem por causa dela seria trocar o problema de lugar.
 */
export function toTripValuation(payload: unknown): TripValuation | null {
  if (!isRecord(payload)) return null
  const source = payload.revenueSource
  if (!isSource(source)) return null

  const costParcels = Array.isArray(payload.costParcels) ? payload.costParcels : []
  const revenueLines = Array.isArray(payload.revenueLines) ? payload.revenueLines : []

  return {
    costParcels: costParcels.filter(isRecord).map((parcel) => ({
      amount: readText(parcel.amount),
      gap: readGap(parcel.gap),
      kind: readText(parcel.kind),
      source: isSource(parcel.source) ? parcel.source : 'estimated',
    })),
    hasGaps: payload.hasGaps === true,
    marginPercentage:
      typeof payload.marginPercentage === 'string' ? payload.marginPercentage : null,
    revenueLines: revenueLines.filter(isRecord).map((line) => ({
      amount: readText(line.amount),
      gap: readGap(line.gap),
      nfeDocumentId: typeof line.nfeDocumentId === 'string' ? line.nfeDocumentId : null,
      source: isSource(line.source) ? line.source : 'estimated',
      tripDocumentId: readText(line.tripDocumentId),
    })),
    revenueSource: source,
    totalCost: readText(payload.totalCost),
    totalMargin: readText(payload.totalMargin),
    totalRevenue: readText(payload.totalRevenue),
  }
}
