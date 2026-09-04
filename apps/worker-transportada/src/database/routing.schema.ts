/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor dos schemas de roteirização da API (`geocoding.schema.ts`,
 * `route-suggestion.schema.ts` e a parte de `trip.schema.ts` que o solver lê), **só as colunas que
 * o worker usa**. Quem faz migration é a API.
 */
import {
  bigint,
  char,
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * ⚠️ Os dois vocabulários são **cópia de tipo** do `geocoding.schema.ts` da API, não de catálogo: o
 * worker precisa deles para tipar o que escreve, e não precisa da lista em tempo de execução. Quem
 * valida de verdade são os CHECKs da tabela, que a API declara e migra.
 */
export type GeocodingPrecision = 'rooftop' | 'street' | 'postal_code' | 'city'
export type GeocodingSource = 'manual' | 'google' | 'postal_code' | 'city'

/**
 * O worker deixou de só ler esta tabela e passou a escrevê-la (spec 069): a cascata resolve o
 * endereço que falta e grava. Por isso a cópia ganhou `source`, `external_place_id` e os carimbos —
 * antes bastavam as quatro colunas que `readStops` lia.
 */
export const geocodedAddresses = pgTable('geocoded_addresses', {
  addressKey: text('address_key').primaryKey(),
  latitude: numeric({ precision: 10, scale: 7 }).notNull(),
  longitude: numeric({ precision: 10, scale: 7 }).notNull(),
  externalPlaceId: text('external_place_id').notNull().default(''),
  source: text().$type<GeocodingSource>().notNull(),
  precision: text().$type<GeocodingPrecision>().notNull(),
  geocodedAt: timestamp('geocoded_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Cópia por valor das colunas que o último degrau da cascata lê. A API declara e migra; o worker só
 * consulta — e por isso não precisa dos carimbos.
 */
export const municipalityCentroids = pgTable('municipality_centroids', {
  cityCode: char('city_code', { length: 7 }).primaryKey(),
  state: char({ length: 2 }).notNull(),
  latitude: numeric({ precision: 10, scale: 7 }).notNull(),
  longitude: numeric({ precision: 10, scale: 7 }).notNull(),
})

export const routeSuggestions = pgTable('route_suggestions', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  tripId: uuid('trip_id'),
  vehicleId: uuid('vehicle_id'),
  status: text().notNull(),
  seed: bigint({ mode: 'number' }).notNull(),
  assumptions: jsonb().notNull(),
  estimatedCostAmount: numeric('estimated_cost_amount', { precision: 19, scale: 4 }),
  estimatedDistanceMeters: bigint('estimated_distance_meters', { mode: 'number' }),
  estimatedDurationSeconds: bigint('estimated_duration_seconds', { mode: 'number' }),
  solverMetrics: jsonb('solver_metrics'),
  truncated: boolean().notNull(),
  errorCode: text('error_code').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const routeSuggestionStops = pgTable('route_suggestion_stops', {
  /** O banco gera; o worker insere sem id, como a API faz. */
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  suggestionId: uuid('suggestion_id').notNull(),
  stopId: uuid('stop_id'),
  /** Spec 058 P2: qual veículo serve a parada. Nulo na sugestão de uma viagem só. */
  vehicleId: uuid('vehicle_id'),
  sequence: bigint({ mode: 'bigint' }).notNull(),
  addressKey: text('address_key').notNull(),
  label: text().notNull(),
  geocodingPrecision: text('geocoding_precision'),
  excludedFromOptimization: boolean('excluded_from_optimization').notNull(),
  estimatedArrivalAt: timestamp('estimated_arrival_at', { withTimezone: true }),
  distanceFromPreviousMeters: bigint('distance_from_previous_meters', { mode: 'number' }),
  durationFromPreviousSeconds: bigint('duration_from_previous_seconds', { mode: 'number' }),
  serviceTimeSeconds: bigint('service_time_seconds', { mode: 'number' }),
  serviceTimeSource: text('service_time_source'),
  serviceTimeSampleSize: bigint('service_time_sample_size', { mode: 'number' }),
  weightEstimated: boolean('weight_estimated').notNull(),
  violations: jsonb().notNull(),
})

export const companyRouteOptimizationSettings = pgTable('company_route_optimization_settings', {
  companyId: uuid('company_id').primaryKey(),
  /** Spec 058 P2: o fuso da operação, em nome IANA — a janela do cliente é hora local. */
  timezone: text().notNull(),
  originAddressKey: text('origin_address_key').notNull(),
  endPolicy: text('end_policy').notNull(),
  endAddressKey: text('end_address_key').notNull(),
  solverTimeBudgetSeconds: bigint('solver_time_budget_seconds', { mode: 'number' }).notNull(),
  defaultServiceTimeSeconds: bigint('default_service_time_seconds', { mode: 'number' }).notNull(),
  fallbackWeightKilograms: numeric('fallback_weight_kilograms', {
    precision: 12,
    scale: 2,
  }).notNull(),
  serviceTimeMinimumSamples: bigint('service_time_minimum_samples', { mode: 'number' }).notNull(),
  maxDrivingSecondsPerDay: bigint('max_driving_seconds_per_day', { mode: 'number' }),
  mandatoryBreakSeconds: bigint('mandatory_break_seconds', { mode: 'number' }),
  breakEverySeconds: bigint('break_every_seconds', { mode: 'number' }),
  maxDutySecondsPerDay: bigint('max_duty_seconds_per_day', { mode: 'number' }),
})

/** Só o que o solver lê da parada: ordem, endereço, rótulo e a janela. */
export const tripStops = pgTable('trip_stops', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  tripId: uuid('trip_id').notNull(),
  sequence: bigint({ mode: 'bigint' }).notNull(),
  addressKey: text('address_key').notNull(),
  label: text().notNull(),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  deliveryWindowStart: timestamp('delivery_window_start', { withTimezone: true }),
  deliveryWindowEnd: timestamp('delivery_window_end', { withTimezone: true }),
})

export const trips = pgTable('trips', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  status: text().notNull(),
})

/** O custo por quilômetro do veículo é o que faz o fitness ser dinheiro e não distância. */
export const fleetVehicles = pgTable('fleet_vehicles', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  plate: text().notNull(),
  capacityKilograms: numeric('capacity_kg', { precision: 12, scale: 2 }).notNull(),
  otherCostsPerKilometer: numeric('other_costs_per_kilometer', {
    precision: 19,
    scale: 4,
  }).notNull(),
})

/**
 * ⚠️ Spec 058 P2 — cópia por valor do schema da API, como todo o resto deste arquivo. A frota, o
 * pool de notas e a ligação parada↔nota da sugestão multi-veículo: o worker **lê** as duas primeiras
 * para montar o problema e **escreve** a terceira ao gravar o resultado.
 */
export const routeSuggestionVehicles = pgTable('route_suggestion_vehicles', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  suggestionId: uuid('suggestion_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  /** ADR-0055: o motorista do par. O solver não o lê — a coluna existe aqui para a cópia não mentir. */
  driverId: uuid('driver_id'),
  position: bigint({ mode: 'bigint' }).notNull(),
})

export const routeSuggestionDocuments = pgTable('route_suggestion_documents', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  suggestionId: uuid('suggestion_id').notNull(),
  nfeDocumentId: uuid('nfe_document_id').notNull(),
})

export const routeSuggestionStopDocuments = pgTable('route_suggestion_stop_documents', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  suggestionStopId: uuid('suggestion_stop_id').notNull(),
  nfeDocumentId: uuid('nfe_document_id').notNull(),
})
