/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor da parte de `trip.schema.ts` da API que o expurgo toca — **só as colunas que a
 * rotina lê e apaga**. Quem faz migration é a API, e
 * `test/trip-location-purge/schema-parity.contract.ts` é o que garante que os dois não divergem.
 */
import { numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

export const tripStopEvents = pgTable('trip_stop_events', {
  id: uuid().primaryKey(),
  latitude: numeric({ precision: 10, scale: 7 }),
  longitude: numeric({ precision: 10, scale: 7 }),
  accuracyMeters: numeric('accuracy_meters', { precision: 10, scale: 2 }),
  /** A hora da leitura do GPS vai junto no expurgo: "posição lida às 14h, sem posição" não é dado. */
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
