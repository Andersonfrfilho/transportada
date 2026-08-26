/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor dos schemas de roteirização da API (`geocoding.schema.ts`,
 * `route-suggestion.schema.ts` e a parte de `trip.schema.ts` que o solver lê), **só as colunas que
 * o worker usa**. Quem faz migration é a API.
 */
import {
  bigint,
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const geocodedAddresses = pgTable('geocoded_addresses', {
  addressKey: text('address_key').primaryKey(),
  latitude: numeric({ precision: 10, scale: 7 }).notNull(),
  longitude: numeric({ precision: 10, scale: 7 }).notNull(),
  precision: text().notNull(),
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
