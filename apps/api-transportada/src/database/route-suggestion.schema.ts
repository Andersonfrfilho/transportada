/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { fleetVehicles } from './fleet.schema.js'
import { GEOCODING_PRECISIONS, type GeocodingPrecision } from './geocoding.schema.js'
import { inList } from './schema-check.constant.js'
import { nfeDocuments } from './nfe.schema.js'
import { trips } from './trip.schema.js'

/**
 * ADR-0044 §5 e §7: a sugestão nasce `queued`, o worker a resolve, e o humano decide. `stale` é o
 * que acontece quando uma nota entra depois da sugestão pronta — a proposta descreve uma viagem que
 * não existe mais, e reaproveitá-la seria propor o roteiro errado com cara de certo.
 */
export const ROUTE_SUGGESTION_STATUSES = [
  'queued',
  'running',
  'ready',
  'accepted',
  'rejected',
  'failed',
  'stale',
] as const
export type RouteSuggestionStatus = (typeof ROUTE_SUGGESTION_STATUSES)[number]

/** ADR-0044 §5: a violação aparece explícita na proposta, nunca escondida escolhendo ordem pior. */
export const ROUTE_VIOLATION_KINDS = [
  'weight',
  'delivery_window',
  'duty_time',
  'unreachable',
] as const
export type RouteViolationKind = (typeof ROUTE_VIOLATION_KINDS)[number]

/** De onde veio o tempo de serviço que o ETA usou (ADR-0044, spec 058 D6). */
export const SERVICE_TIME_SOURCES = ['default', 'measured'] as const
export type ServiceTimeSource = (typeof SERVICE_TIME_SOURCES)[number]

export const routeSuggestions = pgTable(
  'route_suggestions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    /**
     * Anulável: a sugestão multi-veículo (P2) distribui um pool de notas antes de existir viagem —
     * ela propõe as viagens, e só o aceite as cria.
     */
    tripId: uuid('trip_id'),
    vehicleId: uuid('vehicle_id'),
    status: text().$type<RouteSuggestionStatus>().notNull().default('queued'),
    /**
     * ADR-0044 §8: determinismo é requisito. A semente que rodou fica gravada, ou o RNF de "mesma
     * entrada, mesma saída" não é verificável e a reclamação do conferente não é depurável.
     */
    seed: bigint({ mode: 'number' }).notNull(),
    /**
     * O que a sugestão assumiu: orçamento do solver, política de fim, tempo de serviço em uso com
     * sua origem e tamanho de amostra, bloco de jornada. Vai em `jsonb` porque é o retrato de uma
     * configuração que muda com o tempo — a proposta tem de continuar legível depois de alguém
     * mexer nos ajustes da empresa.
     */
    assumptions: jsonb().notNull(),
    estimatedCostAmount: numeric('estimated_cost_amount', { precision: 19, scale: 4 }),
    estimatedDistanceMeters: bigint('estimated_distance_meters', { mode: 'number' }),
    estimatedDurationSeconds: bigint('estimated_duration_seconds', { mode: 'number' }),
    /** Métricas do solver: gerações, melhor fitness, tempo gasto — a conversa sobre qualidade. */
    solverMetrics: jsonb('solver_metrics'),
    /** O orçamento de tempo cortou antes da convergência; o melhor encontrado veio mesmo assim. */
    truncated: boolean().notNull().default(false),
    errorCode: text('error_code').notNull().default(''),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: uuid('decided_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'route_suggestions_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'route_suggestions_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'route_suggestions_company_vehicle_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('route_suggestions_company_id_id_unique').on(table.companyId, table.id),
    index('route_suggestions_company_trip_idx').on(table.companyId, table.tripId),
    index('route_suggestions_company_status_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    check(
      'route_suggestions_status_check',
      sql`${table.status} in (${sql.raw(inList(ROUTE_SUGGESTION_STATUSES))})`,
    ),
    // Decisão humana tem autor e hora, ou não é decisão — é linha que mudou sozinha
    check(
      'route_suggestions_decided_check',
      sql`(${table.status} in ('accepted', 'rejected')) = (${table.decidedAt} is not null)`,
    ),
    // Falha tem causa nomeada; sucesso não carrega código de erro
    check(
      'route_suggestions_error_code_check',
      sql`(${table.status} = 'failed') = (length(${table.errorCode}) > 0)`,
    ),
    check(
      'route_suggestions_estimates_check',
      sql`(${table.estimatedDistanceMeters} is null or ${table.estimatedDistanceMeters} >= 0) and (${table.estimatedDurationSeconds} is null or ${table.estimatedDurationSeconds} >= 0) and (${table.estimatedCostAmount} is null or ${table.estimatedCostAmount} >= 0)`,
    ),
  ],
)

export const routeSuggestionStops = pgTable(
  'route_suggestion_stops',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    suggestionId: uuid('suggestion_id').notNull(),
    /** Anulável pela mesma razão de `trips.trip_id`: a multi-veículo propõe paradas ainda sem viagem. */
    stopId: uuid('stop_id'),
    /**
     * Spec 058 P2: **qual veículo serve esta parada.** Nulo na sugestão de uma viagem só — ali o
     * veículo é o da viagem, e repeti-lo em cada parada seria guardar a mesma resposta N vezes. Na
     * multi-veículo ele é a decisão do solver, e é por ele que o aceite sabe quantas viagens criar.
     */
    vehicleId: uuid('vehicle_id'),
    sequence: bigint({ mode: 'bigint' }).notNull(),
    addressKey: text('address_key').notNull(),
    label: text().notNull(),
    /** ADR-0044 §5: `city` fica fora da otimização — vai marcada, no fim, esperando o humano. */
    geocodingPrecision: text('geocoding_precision').$type<GeocodingPrecision>(),
    excludedFromOptimization: boolean('excluded_from_optimization').notNull().default(false),
    estimatedArrivalAt: timestamp('estimated_arrival_at', { withTimezone: true }),
    distanceFromPreviousMeters: bigint('distance_from_previous_meters', { mode: 'number' }),
    durationFromPreviousSeconds: bigint('duration_from_previous_seconds', { mode: 'number' }),
    serviceTimeSeconds: bigint('service_time_seconds', { mode: 'number' }),
    serviceTimeSource: text('service_time_source').$type<ServiceTimeSource>(),
    serviceTimeSampleSize: bigint('service_time_sample_size', { mode: 'number' }),
    /** Peso estimado porque a nota não informou — vem marcado, e o conferente vê antes de aceitar. */
    weightEstimated: boolean('weight_estimated').notNull().default(false),
    violations: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'route_suggestion_stops_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.suggestionId],
      foreignColumns: [routeSuggestions.companyId, routeSuggestions.id],
      name: 'route_suggestion_stops_company_suggestion_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    /** Chave composta com o tenant: é ela que a ligação parada↔nota da P2 referencia. */
    unique('route_suggestion_stops_company_id_id_unique').on(table.companyId, table.id),
    unique('route_suggestion_stops_company_suggestion_sequence_unique').on(
      table.companyId,
      table.suggestionId,
      table.sequence,
    ),
    index('route_suggestion_stops_company_suggestion_idx').on(table.companyId, table.suggestionId),
    check('route_suggestion_stops_sequence_check', sql`${table.sequence} >= 1`),
    check('route_suggestion_stops_address_key_check', sql`length(${table.addressKey}) > 0`),
    check(
      'route_suggestion_stops_precision_check',
      sql`${table.geocodingPrecision} is null or ${table.geocodingPrecision} in (${sql.raw(inList(GEOCODING_PRECISIONS))})`,
    ),
    // A origem do tempo de serviço acompanha o valor: ETA sem procedência é ETA em que ninguém confia
    check(
      'route_suggestion_stops_service_time_check',
      sql`(${table.serviceTimeSeconds} is null) = (${table.serviceTimeSource} is null) and (${table.serviceTimeSource} is null or ${table.serviceTimeSource} in (${sql.raw(inList(SERVICE_TIME_SOURCES))}))`,
    ),
    check(
      'route_suggestion_stops_leg_check',
      sql`(${table.distanceFromPreviousMeters} is null or ${table.distanceFromPreviousMeters} >= 0) and (${table.durationFromPreviousSeconds} is null or ${table.durationFromPreviousSeconds} >= 0)`,
    ),
  ],
)

/** ADR-0044 §5: como a otimização termina. O motorista que fecha o dia perto de casa é caso real. */
export const ROUTE_END_POLICIES = ['depot', 'last_stop', 'address'] as const
export type RouteEndPolicy = (typeof ROUTE_END_POLICIES)[number]

/**
 * Spec 058 RF-7. **Todo limite de jornada é anulável, e nulo significa "não é restrição aqui"** —
 * distribuição urbana com retorno ao barracão não se parece com viagem interestadual, e uma
 * restrição rígida no lugar errado empobrece a solução sem proteger ninguém.
 */
export const companyRouteOptimizationSettings = pgTable(
  'company_route_optimization_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    originAddressKey: text('origin_address_key').notNull().default(''),
    endPolicy: text('end_policy').$type<RouteEndPolicy>().notNull().default('depot'),
    endAddressKey: text('end_address_key').notNull().default(''),
    solverTimeBudgetSeconds: bigint('solver_time_budget_seconds', { mode: 'number' })
      .notNull()
      .default(30),
    fallbackAverageSpeedKph: bigint('fallback_average_speed_kph', { mode: 'number' })
      .notNull()
      .default(30),
    defaultServiceTimeSeconds: bigint('default_service_time_seconds', { mode: 'number' })
      .notNull()
      .default(600),
    fallbackWeightKilograms: numeric('fallback_weight_kilograms', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    /** Abaixo disso a mediana é ruído; aprender com três entregas é aprender ruído (D6). */
    serviceTimeMinimumSamples: bigint('service_time_minimum_samples', { mode: 'number' })
      .notNull()
      .default(5),
    // Bloco de jornada (D6b) — nulo é o padrão, e nulo é "não é restrição aqui"
    maxDrivingSecondsPerDay: bigint('max_driving_seconds_per_day', { mode: 'number' }),
    mandatoryBreakSeconds: bigint('mandatory_break_seconds', { mode: 'number' }),
    breakEverySeconds: bigint('break_every_seconds', { mode: 'number' }),
    maxDutySecondsPerDay: bigint('max_duty_seconds_per_day', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_route_optimization_settings_company_id_companies_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check(
      'company_route_optimization_settings_end_policy_check',
      sql`${table.endPolicy} in (${sql.raw(inList(ROUTE_END_POLICIES))})`,
    ),
    // Terminar num endereço declarado exige o endereço; as outras políticas não o admitem
    check(
      'company_route_optimization_settings_end_address_check',
      sql`(${table.endPolicy} = 'address') = (length(${table.endAddressKey}) > 0)`,
    ),
    check(
      'company_route_optimization_settings_budget_check',
      sql`${table.solverTimeBudgetSeconds} between 1 and 600`,
    ),
    check(
      'company_route_optimization_settings_speed_check',
      sql`${table.fallbackAverageSpeedKph} between 1 and 200`,
    ),
    check(
      'company_route_optimization_settings_service_time_check',
      sql`${table.defaultServiceTimeSeconds} >= 0 and ${table.serviceTimeMinimumSamples} >= 1`,
    ),
    check(
      'company_route_optimization_settings_weight_check',
      sql`${table.fallbackWeightKilograms} >= 0`,
    ),
    // Pausa obrigatória e sua frequência só fazem sentido juntas
    check(
      'company_route_optimization_settings_break_check',
      sql`(${table.mandatoryBreakSeconds} is null) = (${table.breakEverySeconds} is null) and (${table.mandatoryBreakSeconds} is null or (${table.mandatoryBreakSeconds} > 0 and ${table.breakEverySeconds} > 0))`,
    ),
    check(
      'company_route_optimization_settings_duty_check',
      sql`(${table.maxDrivingSecondsPerDay} is null or ${table.maxDrivingSecondsPerDay} > 0) and (${table.maxDutySecondsPerDay} is null or ${table.maxDutySecondsPerDay} > 0)`,
    ),
  ],
)

/**
 * Spec 058 P2: **os veículos da sugestão multi-veículo.** A `route_suggestions.vehicle_id` continua
 * existindo e continua sendo a da sugestão de uma viagem só — ali o veículo é o da viagem, e não há
 * escolha a fazer. Aqui há: o operador aponta a frota disponível e o solver decide quem leva o quê.
 *
 * A posição existe para o resultado ser **determinístico**: a mesma semente com a mesma frota tem de
 * produzir a mesma divisão, e ordem de linha em Postgres não é garantida sem `order by`.
 */
export const routeSuggestionVehicles = pgTable(
  'route_suggestion_vehicles',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    suggestionId: uuid('suggestion_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    position: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.suggestionId],
      foreignColumns: [routeSuggestions.companyId, routeSuggestions.id],
      name: 'route_suggestion_vehicles_suggestion_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'route_suggestion_vehicles_vehicle_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('route_suggestion_vehicles_suggestion_vehicle_unique').on(
      table.suggestionId,
      table.vehicleId,
    ),
    unique('route_suggestion_vehicles_suggestion_position_unique').on(
      table.suggestionId,
      table.position,
    ),
    check('route_suggestion_vehicles_position_check', sql`${table.position} >= 0`),
  ],
)

/**
 * Spec 058 P2: **o pool.** A sugestão multi-veículo nasce de notas que ainda não estão em viagem
 * nenhuma — é essa a diferença dela. A nota entra aqui e sai daqui; o vínculo com a viagem só
 * existe depois do aceite, e quem o cria é o caso de uso da 056, não esta tabela.
 */
export const routeSuggestionDocuments = pgTable(
  'route_suggestion_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    suggestionId: uuid('suggestion_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.suggestionId],
      foreignColumns: [routeSuggestions.companyId, routeSuggestions.id],
      name: 'route_suggestion_documents_suggestion_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'route_suggestion_documents_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** A mesma nota duas vezes no mesmo pool é a mesma entrega contada duas vezes. */
    unique('route_suggestion_documents_suggestion_document_unique').on(
      table.suggestionId,
      table.nfeDocumentId,
    ),
  ],
)

/**
 * Spec 058 P2: **qual nota cai em qual parada proposta.** Na sugestão de uma viagem só isso já
 * existe — a parada é `trip_stops`, e a nota já está vinculada. Aqui a parada é proposta: sem esta
 * ligação, aceitar a sugestão obrigaria a reagrupar as notas por endereço **de novo**, e o segundo
 * agrupamento poderia discordar do primeiro (grafia, nota que mudou de endereço no meio).
 */
export const routeSuggestionStopDocuments = pgTable(
  'route_suggestion_stop_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    suggestionStopId: uuid('suggestion_stop_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.suggestionStopId],
      foreignColumns: [routeSuggestionStops.companyId, routeSuggestionStops.id],
      name: 'route_suggestion_stop_documents_stop_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'route_suggestion_stop_documents_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('route_suggestion_stop_documents_stop_document_unique').on(
      table.suggestionStopId,
      table.nfeDocumentId,
    ),
  ],
)
