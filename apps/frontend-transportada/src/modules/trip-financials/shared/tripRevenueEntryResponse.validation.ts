/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripCostEntryActor, TripRevenueEntry } from './tripFinancials.types'

/** Resposta de API é entrada não confiável — e aqui ela vira a receita que entra na conta da viagem. */
export class TripRevenueEntryResponseError extends Error {
  public constructor() {
    super('TRIP_REVENUE_ENTRY_RESPONSE_INVALID')
    this.name = 'TripRevenueEntryResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new TripRevenueEntryResponseError()
  return value
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toActor(value: unknown): TripCostEntryActor {
  if (!isRecord(value)) throw new TripRevenueEntryResponseError()

  return { name: readText(value.name), userId: readText(value.userId) }
}

function toEntryKind(value: unknown): TripRevenueEntry['entryKind'] {
  if (!isRecord(value)) throw new TripRevenueEntryResponseError()

  return { id: readString(value.id), name: readText(value.name) }
}

function toEntry(value: unknown): TripRevenueEntry {
  if (!isRecord(value)) throw new TripRevenueEntryResponseError()

  return {
    actor: toActor(value.actor),
    /** Valor é **texto**: convertê-lo aqui perderia centavo na hora de somar na tela. */
    amount: readString(value.amount),
    createdAt: readString(value.createdAt),
    description: readText(value.description),
    entryKind: toEntryKind(value.entryKind),
    id: readString(value.id),
  }
}

export function toTripRevenueEntries(payload: unknown): readonly TripRevenueEntry[] {
  if (!isRecord(payload)) throw new TripRevenueEntryResponseError()
  if (!Array.isArray(payload.data)) throw new TripRevenueEntryResponseError()

  return payload.data.map(toEntry)
}
