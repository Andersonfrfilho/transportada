/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Ligar o expurgo da posição, ou encurtar o prazo com ele ligado, apaga mais do que apagaria antes —
 * e apagar é definitivo. Por isso essas duas escritas abrem uma carência de 24 h antes de o worker
 * enxergar a empresa (spec 239 D5). Desligar, alongar e repetir o valor não ampliam o que cai, então
 * não abrem carência nova. O relógio entra por parâmetro: a política não lê a hora.
 */
export const LOCATION_RETENTION_MIN_DAYS = 30
export const LOCATION_RETENTION_MAX_DAYS = 90
export const LOCATION_PURGE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

export type LocationRetentionChoice = {
  readonly purgeEnabled: boolean
  readonly retentionDays: number
}

export type ResolvePurgeEffectiveAtParams = {
  readonly next: LocationRetentionChoice
  readonly now: Date
  /** `null` é empresa sem linha de configuração: o padrão é desligado. */
  readonly previous: (LocationRetentionChoice & { readonly purgeEffectiveAt: Date }) | null
}

export function isValidRetentionDays(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LOCATION_RETENTION_MIN_DAYS &&
    value <= LOCATION_RETENTION_MAX_DAYS
  )
}

export type OpensPurgeGracePeriodParams = {
  readonly next: LocationRetentionChoice
  readonly previous: LocationRetentionChoice | null
}

/** A mesma pergunta de `resolvePurgeEffectiveAt`, sem relógio: esta escrita amplia o que será apagado? */
export function opensPurgeGracePeriod(params: OpensPurgeGracePeriodParams): boolean {
  const { next, previous } = params
  if (!next.purgeEnabled) return false
  if (previous === null || !previous.purgeEnabled) return true

  return next.retentionDays < previous.retentionDays
}

export function resolvePurgeEffectiveAt(params: ResolvePurgeEffectiveAtParams): Date {
  const { next, now, previous } = params
  if (!next.purgeEnabled) return now

  const gracePeriodEnd = new Date(now.getTime() + LOCATION_PURGE_GRACE_PERIOD_MS)
  if (previous === null || !previous.purgeEnabled) return gracePeriodEnd
  if (next.retentionDays < previous.retentionDays) return gracePeriodEnd

  // Alongar ou repetir não reabre carência, e também não encurta a que ainda corre.
  return previous.purgeEffectiveAt
}
