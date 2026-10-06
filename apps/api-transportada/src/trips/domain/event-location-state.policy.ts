/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3 / spec 196 D3 (revista): só o motorista tem ponto, e só o motorista tem estado — no app ou pelo WhatsApp. A decisão é
 * uma função só — o mesmo `if` copiado em cada escritor é como as tabelas de evento passariam a
 * discordar sobre o que `null` quer dizer.
 */
import {
  EVENT_LOCATION_STATES,
  type EventLocationState,
} from '../../database/event-location.schema.js'
import { TRIP_FIELD_CHANNELS, type TripFieldChannel } from './trip-field-channel.constant.js'

export type ResolveEventLocationStateParams = {
  readonly channel: TripFieldChannel
  readonly hasCoordinate: boolean
}

/**
 * Os canais por onde o motorista **pode mandar** posição — os únicos onde faltar coordenada é uma
 * falha, e não uma ausência de pergunta. O WhatsApp entra desde a D3 revista: a mensagem de
 * localização carrega o ponto, então toque do motorista sem ele é `unavailable`, como no app.
 *
 * ⚠️ Esta função só vale para quem decide pelo canal. O operador também usa o canal `whatsapp` e
 * nunca grava ponto nem estado: o carimbo dele sai de `resolveEventLocationStamp`
 * (`isDriverTap: false`), nunca daqui.
 */
const STATEFUL_CHANNELS: readonly TripFieldChannel[] = [
  TRIP_FIELD_CHANNELS.driverApp,
  TRIP_FIELD_CHANNELS.whatsapp,
]

/** `null` é a fronteira de banco: a coluna anulável que significa "não se aplica". */
export function resolveEventLocationState(
  params: ResolveEventLocationStateParams,
): EventLocationState | null {
  if (params.hasCoordinate) return EVENT_LOCATION_STATES.captured
  if (STATEFUL_CHANNELS.includes(params.channel)) return EVENT_LOCATION_STATES.unavailable

  return null
}
