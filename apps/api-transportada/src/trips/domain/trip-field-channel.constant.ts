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
 * Spec 234 D4c: os canais do motorista em que "GPS desligado" pune — só o app, que coleta posição. O
 * WhatsApp fica de fora: hoje inalcançável com meta-whatsapp 0.1.0 (descarta `messages[].location`);
 * decisão pendente: ponto declarado (pode ser pino de mapa) fora da distância/pontualidade da nota.
 * Escritório e backoffice nunca têm posição.
 */
export const DRIVER_FIELD_CHANNELS: ReadonlySet<TripFieldChannel> = new Set([
  TRIP_FIELD_CHANNELS.driverApp,
])
