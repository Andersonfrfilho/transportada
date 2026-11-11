/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: os vocabulários fechados da ordem das paradas, em `shared/` porque `database/trip.schema.ts` (que o pre-deploy
 * importa) os lê para os CHECK, e a imagem de runtime só copia `database/` e `shared/`. A política e o ordenador os
 * reexportam por `trips/domain/draft-stop-order.constant.ts`.
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
