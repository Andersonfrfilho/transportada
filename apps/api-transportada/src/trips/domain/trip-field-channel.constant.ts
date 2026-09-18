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
