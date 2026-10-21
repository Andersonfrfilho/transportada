/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './tripGuards.validation'
import type { TripOccurrenceFeedItem } from './tripOccurrenceFeed.service'

/**
 * Spec 277 RF5: a resolução média por tipo. Vem pronta da API (`GET /trip-occurrence-resolution-summary`,
 * o dado da 276 somado por tipo) — o painel só a lê e a formata, nunca a recalcula a partir da lista
 * carregada, que é paginada e filtrada.
 */
export type TripOccurrenceResolutionSummaryItem = Readonly<{
  averageSeconds: number
  resolvedCount: number
  typeName: string
}>

function isSummaryItem(value: unknown): value is TripOccurrenceResolutionSummaryItem {
  return (
    isRecord(value) &&
    typeof value.typeName === 'string' &&
    value.typeName !== '' &&
    typeof value.averageSeconds === 'number' &&
    Number.isFinite(value.averageSeconds) &&
    value.averageSeconds >= 0 &&
    typeof value.resolvedCount === 'number' &&
    Number.isInteger(value.resolvedCount) &&
    value.resolvedCount > 0
  )
}

/**
 * Leitura tolerante: linha malformada some, a lista inteira nunca derruba a tela. Corpo que não é o
 * esperado (API anterior à rota, por exemplo) vira lista vazia — e lista vazia esconde o painel.
 */
export function readTripOccurrenceResolutionSummary(
  payload: unknown,
): readonly TripOccurrenceResolutionSummaryItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []
  return payload.data.filter(isSummaryItem).map((item) => ({
    averageSeconds: item.averageSeconds,
    resolvedCount: item.resolvedCount,
    typeName: item.typeName,
  }))
}

export type ResolutionDuration = Readonly<{ hours: number; minutes: number }>

/** Arredonda ao minuto; abaixo de meio minuto é "0 min" (a tela diz "menos de 1 min"). */
export function splitResolutionDuration(seconds: number): ResolutionDuration {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60)
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

/** "2 h 05 min", "45 min", "menos de 1 min" — o texto fixo vem do locale, o número daqui. */
export function formatResolutionDuration(
  seconds: number,
  labels: Readonly<{ lessThanMinute: string }>,
): string {
  const { hours, minutes } = splitResolutionDuration(seconds)
  if (hours === 0 && minutes === 0) return labels.lessThanMinute
  if (hours === 0) return `${minutes} min`
  return `${hours} h ${String(minutes).padStart(2, '0')} min`
}

/**
 * Segundos do registro até a resolução, só para a ocorrência resolvida agora — a mesma definição da
 * média. Reaberta, em aberto e cancelada não têm "resolveu em".
 */
export function resolveOccurrenceResolvedInSeconds(
  item: Pick<TripOccurrenceFeedItem, 'createdAt' | 'resolution'>,
): null | number {
  if (item.resolution?.state !== 'resolved') return null
  const registeredAt = Date.parse(item.createdAt)
  const resolvedAt = Date.parse(item.resolution.at)
  if (Number.isNaN(registeredAt) || Number.isNaN(resolvedAt)) return null
  return Math.max(0, Math.round((resolvedAt - registeredAt) / 1000))
}
