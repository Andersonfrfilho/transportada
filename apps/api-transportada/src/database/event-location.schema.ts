/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §2 / spec 196 D2: o estado do ponto do evento — `varchar(16)` com CHECK, nunca ENUM
 * nativo (code-standart §8). Mora aqui, e não em `trips/domain/`, porque o schema o usa nos CHECKs
 * das tabelas de evento; `trips/domain/event-location-state.policy.ts` o consome, no mesmo molde de
 * `TRIP_FIELD_CHANNELS`.
 *
 * `null` é **não se aplica**: escritório, backoffice, ação derivada, despacho automático e o evento
 * antigo sem coordenada. Sem o estado, "o GPS falhou", "o prazo apagou" e "não era toque do
 * motorista" seriam o mesmo `null`.
 */
export const EVENT_LOCATION_STATES = {
  /** Há coordenada na linha. O CHECK de consistência amarra os dois. */
  captured: 'captured',
  /** O motorista tocou e a posição não veio — recusa, sem sinal, tempo esgotado, app antiga. */
  unavailable: 'unavailable',
  /** O expurgo dos 90 dias apagou as quatro colunas. */
  expired: 'expired',
} as const
export type EventLocationState = (typeof EVENT_LOCATION_STATES)[keyof typeof EVENT_LOCATION_STATES]
