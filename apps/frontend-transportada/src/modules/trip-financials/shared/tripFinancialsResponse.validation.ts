/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FinancialParcel, FinancialSummary, TripFinancialResult } from './tripFinancials.types'

/** Resposta de API é entrada não confiável — e aqui ela vira o número que decide preço de frete. */
export class TripFinancialResponseError extends Error {
  public constructor() {
    super('TRIP_FINANCIAL_RESPONSE_INVALID')
    this.name = 'TripFinancialResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new TripFinancialResponseError()
  return value
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown): number {
  if (typeof value !== 'number') throw new TripFinancialResponseError()
  return value
}

function toParcel(value: unknown): FinancialParcel {
  if (!isRecord(value)) throw new TripFinancialResponseError()

  return {
    /** Valor é **texto**: convertê-lo aqui perderia centavo na hora de somar na tela. */
    amount: readString(value.amount),
    kind: readString(value.kind) as FinancialParcel['kind'],
    nature: readString(value.nature) === 'tax' ? 'tax' : 'cost',
    note: readText(value.note),
    source: readString(value.source) as FinancialParcel['source'],
  }
}

/**
 * `null` é resposta legítima: a viagem ainda não fechou, e o resultado congelado não existe. A tela
 * diz isso em vez de mostrar zeros que pareceriam uma conta fechada.
 */
export function toTripFinancialResult(payload: unknown): TripFinancialResult | null {
  if (!isRecord(payload)) throw new TripFinancialResponseError()
  if (payload.data === null || payload.data === undefined) return null
  if (!isRecord(payload.data)) throw new TripFinancialResponseError()
  const data = payload.data
  if (!Array.isArray(data.parcels)) throw new TripFinancialResponseError()

  return {
    costTotal: readString(data.costTotal),
    frozenAt: readString(data.frozenAt),
    isComplete: data.isComplete === true,
    marginRate:
      data.marginRate === null || data.marginRate === undefined
        ? null
        : readString(data.marginRate),
    netAmount: readString(data.netAmount),
    parcels: data.parcels.map(toParcel),
    recalculationReason: readText(data.recalculationReason),
    revenueAmount: readString(data.revenueAmount),
    revenueDocumentCount: readNumber(data.revenueDocumentCount),
    revenueExpectedCount: readNumber(data.revenueExpectedCount),
    taxTotal: readString(data.taxTotal),
    version: readNumber(data.version),
  }
}

export function toFinancialSummary(payload: unknown): FinancialSummary {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new TripFinancialResponseError()
  const data = payload.data
  if (!Array.isArray(data.groups)) throw new TripFinancialResponseError()

  return {
    costTotal: readString(data.costTotal),
    groups: data.groups.map((group) => {
      if (!isRecord(group)) throw new TripFinancialResponseError()
      return {
        costTotal: readString(group.costTotal),
        groupId: readText(group.groupId),
        groupLabel: readText(group.groupLabel),
        isComplete: group.isComplete === true,
        netAmount: readString(group.netAmount),
        revenueAmount: readString(group.revenueAmount),
        taxTotal: readString(group.taxTotal),
        tripCount: readNumber(group.tripCount),
      }
    }),
    isComplete: data.isComplete === true,
    marginRate:
      data.marginRate === null || data.marginRate === undefined
        ? null
        : readString(data.marginRate),
    netAmount: readString(data.netAmount),
    /** Folha ausente é `null`, e o total se declara aproximado — nunca zero silencioso. */
    payrollAmount:
      data.payrollAmount === null || data.payrollAmount === undefined
        ? null
        : readString(data.payrollAmount),
    revenueAmount: readString(data.revenueAmount),
    taxTotal: readString(data.taxTotal),
    tripCount: readNumber(data.tripCount),
  }
}
