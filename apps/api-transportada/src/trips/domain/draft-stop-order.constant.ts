/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: as constantes da ordem das paradas do rascunho.
 */

/**
 * De onde veio a ordem das paradas da viagem (D4). `unordered` é a viagem antiga e a que o ordenador não conseguiu
 * ordenar; `suggested` é a ordem que o ordenador (ou o aceite da 058) gravou; `manual` é a que o despachante arrastou.
 */
export const STOP_ORDER_SOURCES = ['unordered', 'suggested', 'manual'] as const
export type StopOrderSource = (typeof STOP_ORDER_SOURCES)[number]

/**
 * Por que o ordenador não ordenou. São códigos estáveis: a tela traduz, o log agrupa. Nenhum deles cai para a linha reta
 * (ADR-0044 §1): a falha deixa a ordem de chegada e diz o motivo.
 */
export const STOP_ORDER_ERROR_CODES = [
  'ROUTING_MATRIX_UNAVAILABLE',
  'ROUTING_DEPOT_NOT_GEOCODED',
  'ROUTING_TOO_MANY_STOPS',
] as const
export type StopOrderErrorCode = (typeof STOP_ORDER_ERROR_CODES)[number]

/** Acima disto a matriz não é pedida (`ROUTING_TOO_MANY_STOPS`): 101 pontos já são 10 201 células numa chamada. */
export const DRAFT_STOP_ORDER_MAX_STOPS = 100

/** O tempo que o vínculo espera pela matriz do OSRM antes de desistir e deixar a ordem de chegada (RNF1). */
export const ROAD_MATRIX_TIMEOUT_MILLISECONDS = 5_000

/** Na matriz que o ordenador recebe, o barracão é sempre a linha e a coluna 0; as paradas vêm depois. */
export const DRAFT_STOP_ORDER_DEPOT_INDEX = 0
