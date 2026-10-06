/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  LOCATION_RETENTION_IMPACT_KINDS,
  LOCATION_RETENTION_ORIGINS,
} from './locationRetention.constant'

export type LocationRetentionOrigin = (typeof LOCATION_RETENTION_ORIGINS)[number]
export type LocationRetentionImpactKind = (typeof LOCATION_RETENTION_IMPACT_KINDS)[number]

/** Sem linha gravada é resposta válida (padrão do sistema: desligado, 90 dias, `origin: 'default'`). */
export type LocationRetentionSettings = Readonly<{
  origin: LocationRetentionOrigin
  purgeEffectiveAt: string | null
  purgeEnabled: boolean
  retentionDays: number
  updatedAt: string | null
}>

export type LocationRetentionImpactEntry = Readonly<{
  capped: boolean
  count: number
  kind: LocationRetentionImpactKind
}>

export type LocationRetentionImpact = Readonly<{ byTable: readonly LocationRetentionImpactEntry[] }>

export type LocationRetentionDraft = Readonly<{ purgeEnabled: boolean; retentionDays: number }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isLocationRetentionSettings(value: unknown): value is LocationRetentionSettings {
  return (
    isRecord(value) &&
    typeof value.purgeEnabled === 'boolean' &&
    typeof value.retentionDays === 'number' &&
    LOCATION_RETENTION_ORIGINS.some((origin) => origin === value.origin) &&
    isNullableString(value.purgeEffectiveAt) &&
    isNullableString(value.updatedAt)
  )
}

function isImpactEntry(value: unknown): value is LocationRetentionImpactEntry {
  return (
    isRecord(value) &&
    typeof value.capped === 'boolean' &&
    typeof value.count === 'number' &&
    LOCATION_RETENTION_IMPACT_KINDS.some((kind) => kind === value.kind)
  )
}

/**
 * Campo novo na resposta passa (a API pode crescer antes da tela); `kind` desconhecido, não: ignorá-lo
 * faria o número do botão destrutivo subestimar o que será apagado.
 */
export function isLocationRetentionImpact(value: unknown): value is LocationRetentionImpact {
  return isRecord(value) && Array.isArray(value.byTable) && value.byTable.every(isImpactEntry)
}
