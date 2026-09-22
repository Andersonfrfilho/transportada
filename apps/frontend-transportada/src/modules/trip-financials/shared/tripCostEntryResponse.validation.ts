/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isTripCostEntryKind,
  type TripCostEntry,
  type TripCostEntryActor,
  type TripCostEntryKind,
} from './tripFinancials.types'

/** Resposta de API é entrada não confiável — e aqui ela vira o gasto que entra na conta da viagem. */
export class TripCostEntryResponseError extends Error {
  public constructor() {
    super('TRIP_COST_ENTRY_RESPONSE_INVALID')
    this.name = 'TripCostEntryResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new TripCostEntryResponseError()
  return value
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * O autor pode chegar sem nome — usuário removido da empresa. O vazio passa intacto: a palavra que
 * o operador lê é escolha do locale, não do validador.
 */
function toActor(value: unknown): TripCostEntryActor {
  if (!isRecord(value)) throw new TripCostEntryResponseError()

  return { name: readText(value.name), userId: readText(value.userId) }
}

/**
 * ⚠️ `as` não valida nada: espécie nova do servidor entraria na lista como conhecida e a linha
 * imprimiria a chave crua do locale. O catálogo da tela é quem diz o que a tela sabe nomear.
 */
function readKind(value: unknown): TripCostEntryKind {
  const kind = readString(value)
  if (!isTripCostEntryKind(kind)) throw new TripCostEntryResponseError()

  return kind
}

function toEntry(value: unknown): TripCostEntry {
  if (!isRecord(value)) throw new TripCostEntryResponseError()

  return {
    actor: toActor(value.actor),
    /** Valor é **texto**: convertê-lo aqui perderia centavo na hora de somar na tela. */
    amount: readString(value.amount),
    createdAt: readString(value.createdAt),
    description: readText(value.description),
    id: readString(value.id),
    kind: readKind(value.kind),
  }
}

export function toTripCostEntries(payload: unknown): readonly TripCostEntry[] {
  if (!isRecord(payload)) throw new TripCostEntryResponseError()
  if (!Array.isArray(payload.data)) throw new TripCostEntryResponseError()

  return payload.data.map(toEntry)
}
