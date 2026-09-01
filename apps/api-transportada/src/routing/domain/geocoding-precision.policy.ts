/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'

/**
 * O `location_type` que a Geocoding API do Google devolve. É o motivo técnico da escolha do
 * provedor (ADR-0044 §3): ele **declara** a precisão em vez de deixar inferir, e precisão inferida é
 * precisão errada.
 */
export const GOOGLE_LOCATION_TYPES = [
  'ROOFTOP',
  'RANGE_INTERPOLATED',
  'GEOMETRIC_CENTER',
  'APPROXIMATE',
] as const
export type GoogleLocationType = (typeof GOOGLE_LOCATION_TYPES)[number]

/**
 * Um-para-um, e é isso que a ADR-0044 §3 quer dizer com "mapeia quase um-para-um": telhado é
 * telhado; interpolação na faixa de numeração é a rua certa com número aproximado; centroide
 * geométrico é o quarteirão/CEP; e `APPROXIMATE` é o município — que não é parada, é palpite de
 * ~8km, e por isso sai da otimização automática (ADR-0044 §5).
 */
const PRECISION_BY_LOCATION_TYPE: Readonly<Record<GoogleLocationType, GeocodingPrecision>> = {
  APPROXIMATE: 'city',
  GEOMETRIC_CENTER: 'postal_code',
  RANGE_INTERPOLATED: 'street',
  ROOFTOP: 'rooftop',
}

/**
 * `city` para o que não se reconhece: o desconhecido é tratado como o palpite mais grosseiro, nunca
 * como o mais fino. Um `location_type` novo do Google entrando como `rooftop` colocaria um chute de
 * quilômetros dentro da otimização sem ninguém ver.
 */
export function toGeocodingPrecision(locationType: string): GeocodingPrecision {
  return PRECISION_BY_LOCATION_TYPE[locationType as GoogleLocationType] ?? 'city'
}

/**
 * ADR-0044 §5: parada em centroide de município não entra na otimização automática — vai para o fim
 * da lista, marcada, esperando decisão humana. O conferente tem de ver isso na tela antes de
 * aceitar, não descobrir pelo motorista.
 */
export function isOptimizablePrecision(precision: GeocodingPrecision): boolean {
  return precision !== 'city'
}

/** Da melhor para a pior — a cascata da ADR-0044 §3, e o que decide quem vence ao reconciliar. */
const PRECISION_RANK: Readonly<Record<GeocodingPrecision, number>> = {
  city: 0,
  postal_code: 1,
  rooftop: 3,
  street: 2,
}

export function isFinerPrecision(
  candidate: GeocodingPrecision,
  current: GeocodingPrecision,
): boolean {
  return PRECISION_RANK[candidate] > PRECISION_RANK[current]
}
