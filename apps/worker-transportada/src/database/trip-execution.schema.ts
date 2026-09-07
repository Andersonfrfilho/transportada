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

/**
 * ADR-0056 §2: o rastro ao vivo do portal do contratante. Ele já morria com a viagem
 * (`purgeByTrip`, no fechamento e no cancelamento), e isso bastava enquanto o rastro só existia com
 * a tela na mão. Com o segundo plano do aplicativo, a viagem que ninguém fechou na sexta acompanha
 * o motorista no fim de semana inteiro — e é essa a linha que este expurgo apaga.
 *
 * ⚠️ Aqui a linha **inteira** cai, ao contrário de `trip_stop_events`, onde só a coordenada é
 * apagada. A diferença é o que sobra: o evento de parada continua auditável sem a coordenada — quem
 * chegou, quando entregou —, enquanto um ping sem posição não é nada.
 */
export const tripLocationPings = pgTable('trip_location_pings', {
  id: uuid().primaryKey(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
})
