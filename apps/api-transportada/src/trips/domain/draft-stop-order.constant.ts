/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: as constantes da ordem das paradas do rascunho.
 */

export {
  STOP_ORDER_ERROR_CODES,
  STOP_ORDER_SOURCES,
  type StopOrderErrorCode,
  type StopOrderSource,
} from '../../shared/trip-stop-order.constant.js'

/** Acima disto a matriz não é pedida (`ROUTING_TOO_MANY_STOPS`): 101 pontos já são 10 201 células numa chamada. */
export const DRAFT_STOP_ORDER_MAX_STOPS = 100

/** O tempo que o vínculo espera pela matriz do OSRM antes de desistir e deixar a ordem de chegada (RNF1). */
export const ROAD_MATRIX_TIMEOUT_MILLISECONDS = 5_000

/** Na matriz que o ordenador recebe, o barracão é sempre a linha e a coluna 0; as paradas vêm depois. */
export const DRAFT_STOP_ORDER_DEPOT_INDEX = 0
