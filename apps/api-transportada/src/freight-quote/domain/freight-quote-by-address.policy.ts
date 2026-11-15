/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 342: o que a cotação por endereço aceita como verdade. Duas regras, ambas de recusa — a
 * cotação nunca "estima": um número plausível e errado é pior que um erro dito (ADR-0044 §5).
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'

/**
 * Rua, telhado e CEP localizam o ponto a centenas de metros; `city` é o centroide do município e
 * erra quilômetros — o suficiente para trocar de praça de pedágio.
 */
const PRECISE_ENOUGH: ReadonlySet<GeocodingPrecision> = new Set(['rooftop', 'street', 'postal_code'])

export function isPreciseEnoughToQuote(precision: GeocodingPrecision): boolean {
  return PRECISE_ENOUGH.has(precision)
}

/** O que a leitura da estrada devolve de pedágio, na forma que a conta precisa. */
export type QuoteTollReading = Readonly<{
  boothsFallenBackToManual: number
  boothsWithoutCharge: number
  catalogStatus: 'current' | 'empty' | 'stale'
  total: string
}>

/**
 * Pedágio só entra quando é conhecido por inteiro: catálogo carregado e em dia, e nenhuma praça da
 * rota sem tarifa. Queda para a tarifa manual (veículo com tag) superestima de propósito e é aceita,
 * como já é na viagem. `null` (rota sem leitura de pedágio) é desconhecido, nunca zero.
 */
export function isTollKnown(toll: null | QuoteTollReading): toll is QuoteTollReading {
  return toll !== null && toll.catalogStatus === 'current' && toll.boothsWithoutCharge === 0
}
