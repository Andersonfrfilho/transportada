/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrenceType, DriverOccurrenceTypesResult } from './driverTrip.types'
import { isDriverOccurrenceType } from './driverTripClient.service'

/**
 * Spec 179 P3: sem sinal, "Não entreguei" continua pedindo o tipo e a foto — e a app aberta sem
 * rede não tem como perguntar os tipos à API. A última lista boa fica guardada, por dono
 * (`SHA-256(sub)`, o mesmo de snapshot e fila). É o cadastro da empresa — nome e id de tipo, sem dado
 * de pessoa —, o mesmo nível da marca da instalação que já mora no `localStorage`.
 */
const OCCURRENCE_TYPES_STORAGE_PREFIX = 'transportada.driver.occurrence-types.v1:'

export type OccurrenceTypesStorage = Pick<Storage, 'getItem' | 'setItem'>

export function resolveOccurrenceTypesStorage(): OccurrenceTypesStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readCachedOccurrenceTypes(input: {
  readonly storage: OccurrenceTypesStorage | null
  readonly subHash: string
}): readonly DriverOccurrenceType[] | undefined {
  try {
    const raw = input.storage?.getItem(`${OCCURRENCE_TYPES_STORAGE_PREFIX}${input.subHash}`)
    if (raw == null) return undefined
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every(isDriverOccurrenceType) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Falhar ao guardar (cota, modo privado) não muda nada na tela: só a próxima abertura sem rede. */
export function saveCachedOccurrenceTypes(input: {
  readonly storage: OccurrenceTypesStorage | null
  readonly subHash: string
  readonly types: readonly DriverOccurrenceType[]
}): void {
  try {
    input.storage?.setItem(
      `${OCCURRENCE_TYPES_STORAGE_PREFIX}${input.subHash}`,
      JSON.stringify(input.types),
    )
  } catch {
    // A lista em memória continua valendo nesta abertura.
  }
}

/**
 * A resposta da API manda; a falha cai na última lista guardada do mesmo dono. Sem cópia, a falha
 * continua falha — e a tela diz isso (spec 157 RF5).
 */
export function resolveOccurrenceTypesWithCache(input: {
  readonly cached: readonly DriverOccurrenceType[] | undefined
  readonly result: DriverOccurrenceTypesResult
}): DriverOccurrenceTypesResult {
  if (input.result.status === 'loaded' || input.cached === undefined) return input.result
  return { status: 'loaded', types: input.cached }
}
