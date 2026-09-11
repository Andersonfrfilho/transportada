/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 101: quanto rende cada viagem que a sugestão multi-veículo propõe, e quanto rende o conjunto.
 *
 * Até esta spec, a tela em que o operador escolhe entre distribuir a carga de um jeito ou de outro
 * mostrava só contagem de paradas — era a única tela do produto que não dizia qual dos jeitos paga.
 */
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'

export type SuggestionVehicleValuation = Readonly<{
  /** `null` quando nenhuma perna da sugestão é conhecida — ausência, nunca zero. */
  distanceMeters: null | number
  documentCount: number
  driverId: null | string
  durationSeconds: null | number
  stopCount: number
  valuation: TripValuation
  vehicleId: string
}>

export type SuggestionValuationReport = Readonly<{
  gaps: readonly string[]
  /**
   * ⚠️ É este campo que obriga a tela a imprimir a marca ao lado do lucro. Total com buraco
   * escondido é pior que total nenhum: ele se apresenta como previsão fechada e não é.
   */
  hasGaps: boolean
  totalCost: string
  totalDistanceMeters: null | number
  totalDurationSeconds: null | number
  totalMargin: string
  totalRevenue: string
}>

export type SuggestionValuation = Readonly<{
  report: SuggestionValuationReport
  vehicles: readonly SuggestionVehicleValuation[]
}>

/**
 * ⚠️ `hasExactKeys` nas duas formas: campo novo na API com o bundle antigo derruba a validação e o
 * painel some com 200 na rede e nada no console — o defeito de `VEHICLE_DETAIL_KEYS`. **A API sobe
 * primeiro.**
 */
export const SUGGESTION_VALUATION_REPORT_KEYS = [
  'gaps',
  'hasGaps',
  'totalCost',
  'totalDistanceMeters',
  'totalDurationSeconds',
  'totalMargin',
  'totalRevenue',
] as const

export const SUGGESTION_VEHICLE_VALUATION_KEYS = [
  'distanceMeters',
  'documentCount',
  'driverId',
  'durationSeconds',
  'stopCount',
  'valuation',
  'vehicleId',
] as const

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

export type DurationUnitLabels = Readonly<{
  days: string
  hours: string
  minutes: string
}>

/**
 * Rótulos de dia/hora/minuto, traduzidos por quem chama — `formatDuration` é usado tanto pelo
 * módulo `trip` (TEMPO por viagem, JORNADA SOMADA da proposta) quanto pelo `routing`
 * (`SuggestionVehicleValuation`, `SuggestionValuationReport`), e as duas pontas já leem o
 * namespace `routing` (o `t: tRouting`/`t` que os componentes já chamam) — este helper só evita
 * remontar o objeto de rótulos em cada callsite.
 */
export function buildDurationUnitLabels(translate: (key: string) => string): DurationUnitLabels {
  return {
    days: translate('duration.days'),
    hours: translate('duration.hours'),
    minutes: translate('duration.minutes'),
  }
}

/**
 * Segundos em dias, horas e minutos — o operador raciocina em jornada, não em segundos, e uma
 * viagem de muitas paradas passa de 24h com frequência (spec 138: medido "29h47" ilegível numa
 * fileira de números).
 *
 * Unidade zerada **no meio** é omitida ("2 d 3 min", nunca "2 d 0 h 3 min") — é a leitura mais
 * curta sem perder precisão, e a regra escolhida entre as duas que a spec 138 levantou. Duração
 * zero preserva a saída de sempre (`"0min"`, sem espaço): criar uma segunda forma só para "nada"
 * não ganha nada em clareza.
 */
export function formatDuration(seconds: null | number, units: DurationUnitLabels): null | string {
  if (seconds === null) return null
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes === 0) return '0min'

  const days = Math.floor(totalMinutes / MINUTES_PER_DAY)
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR)
  const minutes = totalMinutes % MINUTES_PER_HOUR

  return [
    days > 0 ? `${days} ${units.days}` : null,
    hours > 0 ? `${hours} ${units.hours}` : null,
    minutes > 0 ? `${minutes} ${units.minutes}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ')
}

/** Metros em quilômetros, uma casa. `null` continua `null` — a tela é que decide o que dizer. */
export function formatDistance(meters: null | number): null | string {
  if (meters === null) return null

  return `${(meters / 1000).toFixed(1)} km`
}
