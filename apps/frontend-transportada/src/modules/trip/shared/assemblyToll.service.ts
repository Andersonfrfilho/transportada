/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A data da tarifa impressa ao lado do total do pedágio (spec 090 T7). `observed_on` é a data do
 * extract, sempre `AAAA-MM-DD` — nunca passa por `Date`/fuso: meia-noite UTC de 1º de julho vira 30
 * de junho às 21h em Brasília, e a tela imprimiria o mês errado.
 */
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { RouteGeometryToll } from './routeGeometry.service'

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** `'2026-07-01'` vira `'julho/2026'`. Formato inesperado devolve a data crua, nunca quebra a tela. */
export function formatTariffMonth(observedOn: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/u.exec(observedOn)
  if (match === null) return observedOn

  const [, year, month] = match
  const monthIndex = Number(month) - 1
  const monthName = MONTH_NAMES[monthIndex]
  if (monthName === undefined) return observedOn

  return `${monthName}/${year}`
}

/**
 * O que o ícone da praça imprime ao lado dele, no mapa (spec 096 D3/T4).
 *
 * ⚠️ **Tarifa desconhecida é "—", nunca "R$ 0,00".** Medido: `0.00` é tarifa **declarada** em 4 das
 * 166 praças — campo não mapeado, não isenção — e `null` é o único vocabulário de "não sei". Zero
 * declarado continua imprimindo o valor formatado normalmente; só a ausência vira travessão.
 */
export function formatBoothCharge(chargePerAxle: null | string): string {
  return chargePerAxle === null ? '—' : formatAmount(chargePerAxle)
}

/** Uma praça do trajeto, pronta para o mapa desenhar — coordenada mais o rótulo já formatado. */
export type RouteTollBoothMarker = Readonly<{
  label: string
  latitude: number
  longitude: number
}>

/**
 * As praças da rota **escolhida**, prontas para o mapa (spec 096 T4) — é a mesma lista que o bloco
 * de pedágio abaixo do seletor já lista por nome; aqui cada uma ganha coordenada e o valor por eixo
 * ao lado do ícone.
 */
export function resolveTollBoothMarkers(
  toll: null | RouteGeometryToll,
): readonly RouteTollBoothMarker[] {
  if (toll === null) return []

  return toll.booths.map((booth) => ({
    label: formatBoothCharge(booth.chargePerAxle),
    latitude: Number(booth.latitude),
    longitude: Number(booth.longitude),
  }))
}
