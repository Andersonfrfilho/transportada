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

/** Segundos em horas e minutos — o operador raciocina em jornada, não em segundos. */
export function formatDuration(seconds: null | number): null | string {
  if (seconds === null) return null
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return hours === 0 ? `${minutes}min` : `${hours}h${String(minutes).padStart(2, '0')}`
}

/** Metros em quilômetros, uma casa. `null` continua `null` — a tela é que decide o que dizer. */
export function formatDistance(meters: null | number): null | string {
  if (meters === null) return null

  return `${(meters / 1000).toFixed(1)} km`
}
