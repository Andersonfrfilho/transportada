/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §2: quem registrou o evento de campo. Reexporta de `database/trip.schema.ts`, onde a
 * constante vive porque o schema a usa nos `check`s das seis tabelas de campo — mesmo padrão de
 * `TripStatus`/`TripStopEventKind`, importados pela aplicação a partir do schema.
 */
import { TRIP_FIELD_CHANNELS, type TripFieldChannel } from '../../database/trip.schema.js'

export { TRIP_FIELD_CHANNELS, type TripFieldChannel }

/** O canal padrão de todo registro de campo até aqui — a migration de autoria descreve o histórico. */
export const DEFAULT_TRIP_FIELD_CHANNEL: TripFieldChannel = TRIP_FIELD_CHANNELS.driverApp

/**
 * Spec 234 D4c: os canais em que o próprio motorista registra o evento — o app e o WhatsApp. O
 * escritório (em nome dele) e o backoffice ficam de fora.
 */
export const DRIVER_FIELD_CHANNELS: ReadonlySet<TripFieldChannel> = new Set([
  TRIP_FIELD_CHANNELS.driverApp,
  TRIP_FIELD_CHANNELS.whatsapp,
])
