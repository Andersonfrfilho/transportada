/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CAPACITY_UNKNOWN_REASONS } from './trip.constant'
import { isOneOf, isRecord, isUnsignedInteger } from './tripGuards.validation'
import type {
  TripListVolumeOccupancy,
  TripListWeightOccupancy,
  TripOccupancySummary,
} from './trip.types'

const VOLUME_SOURCES = ['declared', 'estimated', 'measured', 'partial'] as const
const WEIGHT_SOURCES = ['declared', 'estimated'] as const

function readRatio(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  if (typeof value !== 'string') return undefined

  return Number.isFinite(Number.parseFloat(value)) ? value : undefined
}

function readVolume(value: unknown): TripListVolumeOccupancy | null | undefined {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const occupancyRatio = readRatio(value.occupancyRatio)
  if (occupancyRatio === undefined) return undefined
  if (!isOneOf(value.source, VOLUME_SOURCES)) return undefined
  if (!isUnsignedInteger(value.documentsWithoutVolume)) return undefined

  return {
    documentsWithoutVolume: value.documentsWithoutVolume,
    occupancyRatio,
    source: value.source,
  }
}

function readWeight(value: unknown): TripListWeightOccupancy | null | undefined {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const payloadRatio = value.payloadRatio === null ? null : readRatio(value.payloadRatio)
  if (payloadRatio === undefined) return undefined
  if (!isOneOf(value.source, WEIGHT_SOURCES)) return undefined
  if (!isUnsignedInteger(value.documentsWithoutWeight)) return undefined

  return {
    documentsWithoutWeight: value.documentsWithoutWeight,
    payloadRatio,
    source: value.source,
  }
}

/**
 * Spec 259: o `occupancy` do item de `GET /trips`. ⚠️ **Tolerante ao lixo, não só à ausência**: uma
 * ocupação malformada vira "sem ocupação" e a linha segue — recusar aqui derrubaria a listagem
 * inteira por causa de um número secundário. `undefined` é ausente ou malformado; `null` é viagem
 * sem veículo, dito pela API.
 */
export function readTripListOccupancy(value: unknown): TripOccupancySummary | null | undefined {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const volume = readVolume(value.volume)
  const weight = readWeight(value.weight)
  if (volume === undefined || weight === undefined) return undefined
  const reason = value.capacityUnknownReason
  if (reason !== undefined && reason !== null && !isOneOf(reason, CAPACITY_UNKNOWN_REASONS)) {
    return undefined
  }

  return { capacityUnknownReason: reason ?? null, volume, weight }
}
