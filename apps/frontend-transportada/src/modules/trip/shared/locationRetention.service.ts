/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  LOCATION_RETENTION_DAYS_RANGE,
  LOCATION_RETENTION_IMPACT_GROUPS,
} from './locationRetention.constant'
import type {
  LocationRetentionDraft,
  LocationRetentionImpact,
  LocationRetentionSettings,
} from './locationRetention.validation'

export type LocationRetentionStatus = 'active' | 'off' | 'waiting'

const DIGITS_ONLY = /^\d+$/u

export function isLocationRetentionDays(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= LOCATION_RETENTION_DAYS_RANGE.min &&
    value <= LOCATION_RETENTION_DAYS_RANGE.max
  )
}

/** Texto digitado no campo: só inteiro de 30 a 90 vale; o resto é `undefined`, nunca arredondado. */
export function parseLocationRetentionDays(raw: string): number | undefined {
  if (!DIGITS_ONLY.test(raw)) return undefined
  const days = Number(raw)
  return isLocationRetentionDays(days) ? days : undefined
}

/** Ligado com a carência ainda correndo é "aguardando": o worker ignora a empresa até lá (D5). */
export function resolveLocationRetentionStatus(
  input: Readonly<{ nowMs: number; settings: LocationRetentionSettings }>,
): LocationRetentionStatus {
  const { nowMs, settings } = input
  if (!settings.purgeEnabled) return 'off'
  if (settings.purgeEffectiveAt === null) return 'active'
  return Date.parse(settings.purgeEffectiveAt) > nowMs ? 'waiting' : 'active'
}

export type LocationRetentionConfirmation = 'enable' | 'shorten'

/**
 * RF9: só o que amplia o que será apagado pede confirmação — ligar e encurtar o prazo com o
 * expurgo ligado. Desligar e alongar não apagam nada e salvam direto.
 */
export function resolveLocationRetentionConfirmation(
  input: Readonly<{ next: LocationRetentionDraft; stored: LocationRetentionSettings }>,
): LocationRetentionConfirmation | undefined {
  const { next, stored } = input
  if (!next.purgeEnabled) return undefined
  if (!stored.purgeEnabled) return 'enable'
  return next.retentionDays < stored.retentionDays ? 'shorten' : undefined
}

export type LocationRetentionImpactSummary = Readonly<{
  groups: readonly Readonly<{ count: number; id: string; isCapped: boolean }>[]
  isCapped: boolean
  total: number
}>

export function summarizeLocationRetentionImpact(
  impact: LocationRetentionImpact,
): LocationRetentionImpactSummary {
  const groups = LOCATION_RETENTION_IMPACT_GROUPS.map((group) => {
    const entries = impact.byTable.filter((entry) =>
      group.kinds.some((kind) => kind === entry.kind),
    )
    return {
      count: entries.reduce((sum, entry) => sum + entry.count, 0),
      id: group.id,
      isCapped: entries.some((entry) => entry.capped),
    }
  })
  return {
    groups,
    isCapped: groups.some((group) => group.isCapped),
    total: groups.reduce((sum, group) => sum + group.count, 0),
  }
}

const MOMENT_PARTS = {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
} as const

/** "DD/MM HH:mm" no fuso de quem olha — o "começa a valer em" da carência. */
export function formatLocationRetentionMoment(iso: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', { ...MOMENT_PARTS, hourCycle: 'h23' })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((byType, part) => ({ ...byType, [part.type]: part.value }), {})
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`
}
