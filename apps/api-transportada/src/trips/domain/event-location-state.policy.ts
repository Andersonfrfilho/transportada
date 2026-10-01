/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3 / spec 196 D3: só o motorista tem ponto, e só o motorista tem estado. A decisão é
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
 * Os canais que **pedem** posição ao sistema operacional — os únicos onde faltar coordenada é uma
 * falha, e não uma ausência de pergunta.
 *
 * ⚠️ O WhatsApp não está aqui, e a tentação de incluí-lo é grande porque o motorista também é quem
 * fala por ele. Mas nenhum caminho de WhatsApp carrega latitude: carimbá-lo de `unavailable`
 * pintaria de vermelho, para sempre, 100% das entregas desse canal, afirmando uma falha de GPS que
 * nunca houve. É a mesma recusa que a migration desta spec escreveu sobre o histórico pré-GPS. No
 * dia em que o WhatsApp mandar posição, `hasCoordinate` resolve sozinho, sem tocar nesta lista.
 */
const STATEFUL_CHANNELS: readonly TripFieldChannel[] = [TRIP_FIELD_CHANNELS.driverApp]

/** `null` é a fronteira de banco: a coluna anulável que significa "não se aplica". */
export function resolveEventLocationState(
  params: ResolveEventLocationStateParams,
): EventLocationState | null {
  if (params.hasCoordinate) return EVENT_LOCATION_STATES.captured
  if (STATEFUL_CHANNELS.includes(params.channel)) return EVENT_LOCATION_STATES.unavailable

  return null
}
