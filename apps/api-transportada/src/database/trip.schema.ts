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
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { fleetDrivers, fleetVehicles } from './fleet.schema.js'
import { freightCalculations } from './freight.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * ADR-0043 §1: a viagem não fala com a SEFAZ, mas tem fases de barracão que `open|closed` não
 * representava. O estado é derivado do das notas em toda transição, exceto as quatro manuais
 * (draft, route_planned, dispatched, cancelled).
 */
export const TRIP_STATUSES = [
  'draft',
  'route_planned',
  'separating',
  'loading',
  'dispatched',
  'in_transit',
  'completed',
  'cancelled',
] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

/** ADR-0043 §1: eixo da nota, do qual o estado da viagem é derivado. */
export const TRIP_DOCUMENT_SEPARATION_STATUSES = [
  'pending',
  'separated',
  'loaded',
  'delivered',
  'returned',
] as const
export type TripDocumentSeparationStatus = (typeof TRIP_DOCUMENT_SEPARATION_STATUSES)[number]

const TAX_ID_PATTERN = '^[0-9]{11}$'

/** Condutores por viagem: mesmo teto do manifesto (ADR-0016 §1, `MAX_DRIVERS_PER_MANIFEST`). */
const MAX_DRIVERS_PER_TRIP = 10

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)

export const trips = pgTable(
  'trips',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    status: text().$type<TripStatus>().notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trips_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'trips_company_vehicle_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trips_company_id_id_unique').on(table.companyId, table.id),
    index('trips_company_status_created_at_idx').on(table.companyId, table.status, table.createdAt),
    index('trips_company_vehicle_idx').on(table.companyId, table.vehicleId),
    check('trips_status_check', sql`${table.status} in (${raw(inList(TRIP_STATUSES))})`),
  ],
)

/** Mesmo desenho de `mdfe_manifest_drivers` (ADR-0023 §1): `driver_id` + posição, mínimo 1. */
export const tripDrivers = pgTable(
  'trip_drivers',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    driverName: text('driver_name').notNull(),
    driverTaxId: text('driver_tax_id').notNull(),
    position: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_drivers_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_drivers_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_drivers_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_drivers_company_id_id_unique').on(table.companyId, table.id),
    unique('trip_drivers_company_trip_driver_unique').on(
      table.companyId,
      table.tripId,
      table.driverId,
    ),
    unique('trip_drivers_company_trip_position_unique').on(
      table.companyId,
      table.tripId,
      table.position,
    ),
    check(
      'trip_drivers_position_check',
      sql`${table.position} between 1 and ${raw(String(MAX_DRIVERS_PER_TRIP))}`,
    ),
    check('trip_drivers_tax_id_check', sql`${table.driverTaxId} ~ ${raw(`'${TAX_ID_PATTERN}'`)}`),
    check('trip_drivers_name_check', sql`length(${table.driverName}) > 0`),
  ],
)

/**
 * ADR-0043 §3: uma parada por endereço de entrega distinto, nunca por nota. `addressKey` é a
 * chave normalizada (postal_code + number + city_code) que agrupa as notas — a normalização em si
 * é função pura em `trips/domain`, testada à parte. `deliveryWindowStart`/`End` nascem reservadas
 * e nulas para a spec 060; nada aqui as consome ainda.
 */
export const tripStops = pgTable(
  'trip_stops',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    sequence: bigint({ mode: 'bigint' }).notNull(),
    addressKey: text('address_key').notNull(),
    label: text().notNull(),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deliveryWindowStart: timestamp('delivery_window_start', { withTimezone: true }),
    deliveryWindowEnd: timestamp('delivery_window_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_stops_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_stops_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('trip_stops_company_id_id_unique').on(table.companyId, table.id),
    unique('trip_stops_company_trip_sequence_unique').on(
      table.companyId,
      table.tripId,
      table.sequence,
    ),
    index('trip_stops_company_trip_idx').on(table.companyId, table.tripId),
    check('trip_stops_sequence_check', sql`${table.sequence} >= 1`),
    check('trip_stops_address_key_check', sql`length(${table.addressKey}) > 0`),
    check('trip_stops_label_check', sql`length(${table.label}) > 0`),
    // Reservada e nula até a spec 060 — mas já coerente: não existe janela pela metade.
    check(
      'trip_stops_delivery_window_check',
      sql`(${table.deliveryWindowStart} is null) = (${table.deliveryWindowEnd} is null)`,
    ),
    check(
      'trip_stops_completed_requires_arrived_check',
      sql`${table.completedAt} is null or ${table.arrivedAt} is not null`,
    ),
  ],
)

/**
 * ADR-0023 §2: a viagem aceita a nota antes de o CT-e existir. `nfe_document_id` xor
 * `freight_calculation_id` — a viagem vincula a nota crua ou o frete já calculado sobre ela,
 * nunca os dois ao mesmo tempo pro mesmo vínculo (spec 027 § Dúvidas).
 */
export const tripDocuments = pgTable(
  'trip_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id'),
    freightCalculationId: uuid('freight_calculation_id'),
    stopId: uuid('stop_id'),
    separationStatus: text('separation_status')
      .$type<TripDocumentSeparationStatus>()
      .notNull()
      .default('pending'),
    separatedAt: timestamp('separated_at', { withTimezone: true }),
    loadedAt: timestamp('loaded_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    returnReason: text('return_reason'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_documents_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'trip_documents_company_nfe_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightCalculationId],
      foreignColumns: [freightCalculations.companyId, freightCalculations.id],
      name: 'trip_documents_company_freight_calculation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    // ADR-0043 §3: a parada é derivada — apagá-la solta a nota de volta para "sem parada" em vez
    // de travar o vínculo. `restrict`, não `set null`: numa FK composta, `set null` zeraria
    // `company_id` junto com `stop_id`, e `company_id` é `not null` — a T010 achou isso tentando
    // apagar uma parada de verdade. Quem apaga a parada precisa zerar `stop_id` primeiro, no
    // mesmo `UPDATE` que solta a nota (T010, `releaseUnloadedDocuments`).
    foreignKey({
      columns: [table.companyId, table.stopId],
      foreignColumns: [tripStops.companyId, tripStops.id],
      name: 'trip_documents_company_stop_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_documents_company_id_id_unique').on(table.companyId, table.id),
    index('trip_documents_company_trip_idx').on(table.companyId, table.tripId),
    index('trip_documents_company_stop_idx').on(table.companyId, table.stopId),
    // Nota/frete só vivo em uma viagem por vez — mesmo padrão de mdfe_manifest_items_live_document_unique
    uniqueIndex('trip_documents_live_nfe_document_unique')
      .on(table.companyId, table.nfeDocumentId)
      .where(sql`${table.releasedAt} is null`),
    uniqueIndex('trip_documents_live_freight_calculation_unique')
      .on(table.companyId, table.freightCalculationId)
      .where(sql`${table.releasedAt} is null`),
    check(
      'trip_documents_entity_xor_check',
      sql`(${table.nfeDocumentId} is null) <> (${table.freightCalculationId} is null)`,
    ),
    // Uma vez entregue, o vínculo trava — a nota nunca mais migra para outra viagem
    check(
      'trip_documents_delivered_locks_release_check',
      sql`${table.deliveredAt} is null or ${table.releasedAt} is null`,
    ),
    check(
      'trip_documents_separation_status_check',
      sql`${table.separationStatus} in (${raw(inList(TRIP_DOCUMENT_SEPARATION_STATUSES))})`,
    ),
    // ADR-0043 §7: motivo é obrigatório em toda nota devolvida, e só nela.
    check(
      'trip_documents_return_reason_check',
      sql`(${table.separationStatus} = 'returned') = (${table.returnReason} is not null)`,
    ),
  ],
)

/**
 * ADR-0043 §4: a transição é registrada, não inferida da coluna. `separation_status` responde
 * "onde está agora"; esta tabela responde "quem, quando e por quê". Append-only — nenhum update ou
 * delete de evento em lugar nenhum do código; a T008 escreve aqui na mesma transação em que muda
 * `trip_documents.separation_status`, e nunca escreve um evento para uma transição que não mudou
 * nada (idempotência da T008: repetir a mesma transição não duplica evento).
 *
 * Nenhuma coluna de PII: ator e documento são ids opacos, `note` é texto do operador sobre a
 * transição, nunca dado do destinatário. `test/trip-schema/events.contract.ts` tem o contrato
 * negativo que garante isso.
 */
export const tripDocumentEvents = pgTable(
  'trip_document_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripDocumentId: uuid('trip_document_id').notNull(),
    fromStatus: text('from_status').$type<TripDocumentSeparationStatus>(),
    toStatus: text('to_status').$type<TripDocumentSeparationStatus>().notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    note: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_document_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    // Segue o mesmo padrão de audit_logs_actor_membership_fk: o ator precisa ser membro desta
    // empresa, não só um usuário que existe em algum lugar do sistema.
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_document_events_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'trip_document_events_company_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('trip_document_events_company_document_occurred_idx').on(
      table.companyId,
      table.tripDocumentId,
      table.occurredAt,
    ),
    check(
      'trip_document_events_from_status_check',
      sql`${table.fromStatus} is null or ${table.fromStatus} in (${raw(inList(TRIP_DOCUMENT_SEPARATION_STATUSES))})`,
    ),
    check(
      'trip_document_events_to_status_check',
      sql`${table.toStatus} in (${raw(inList(TRIP_DOCUMENT_SEPARATION_STATUSES))})`,
    ),
    check(
      'trip_document_events_actual_transition_check',
      sql`${table.fromStatus} is distinct from ${table.toStatus}`,
    ),
  ],
)

/**
 * ADR-0043 §2: `dispatched` é a porta de não-retorno, e o roteiro que o motorista levou é o que se
 * cobra dele depois — não a versão que alguém editou às onze da noite. Uma linha por viagem
 * despachada, gravada na mesma transação da transição.
 *
 * **Tabela própria, não coluna em `trips`**, por um motivo de execução: `trips` sofre `UPDATE` a
 * cada transição de estado, então nunca poderia carregar o trigger append-only que torna esta
 * imutabilidade real. A tabela pode.
 *
 * O `snapshot` guarda as paradas na ordem e os ids das notas de cada uma **sem FK** — de
 * propósito. Congelar é justamente parar de acompanhar: se a parada for reconciliada ou apagada
 * depois, o documento que o motorista levou não muda junto.
 */
export const tripDispatchSnapshots = pgTable(
  'trip_dispatch_snapshots',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    snapshot: jsonb().notNull(),
    snapshotSha256: text('snapshot_sha256').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    /** ADR-0043 §2: despachar com nota pendente acontece todo dia — mas não sem alguém assinar. */
    forced: boolean().notNull().default(false),
    forceReason: text('force_reason'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_dispatch_snapshots_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_dispatch_snapshots_company_trip_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_dispatch_snapshots_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_dispatch_snapshots_company_id_id_unique').on(table.companyId, table.id),
    // `dispatched` é irreversível, então despacho é um evento único por viagem.
    unique('trip_dispatch_snapshots_company_trip_unique').on(table.companyId, table.tripId),
    check(
      'trip_dispatch_snapshots_sha256_check',
      sql`${table.snapshotSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    // Mesmo par coerente do motivo de retorno: forçado exige motivo, e motivo exige forçado.
    check(
      'trip_dispatch_snapshots_force_reason_check',
      sql`${table.forced} = (${table.forceReason} is not null)`,
    ),
    check(
      'trip_dispatch_snapshots_stops_shape_check',
      sql`jsonb_typeof(${table.snapshot} -> 'stops') = 'array'`,
    ),
  ],
)

/**
 * ADR-0043 §3 (D9): o endereço de entrega pode ser sobrescrito, mas não é campo — é ação, e a
 * ação vira histórico aqui, nunca estado. Duas identidades distintas por design: `requestedBy`
 * (texto livre — o cliente que ligou, o vendedor, quase nunca é usuário do sistema) é quem pediu
 * o desvio; `actorUserId` (membership, mesmo padrão de `trip_document_events`) é quem executou no
 * sistema. Sem a primeira, "quem mandou entregar ali?" vira pergunta sem resposta quando a entrega
 * dá errado no endereço novo — é a informação que some primeiro.
 *
 * Guarda o par de endereços (anterior/novo) como os mesmos componentes de `StopAddressComponents`
 * — é exatamente o que `buildStopAddressKey` consome para reconciliar a parada — mais um rótulo
 * legível de cada lado para a tela não precisar recalcular nada para exibir o histórico.
 */
export const deliveryAddressOverrides = pgTable(
  'delivery_address_overrides',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripDocumentId: uuid('trip_document_id').notNull(),
    requestedBy: text('requested_by').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    reason: text().notNull(),
    previousPostalCode: text('previous_postal_code'),
    previousNumber: text('previous_number'),
    previousCityCode: text('previous_city_code'),
    previousLabel: text('previous_label').notNull(),
    newPostalCode: text('new_postal_code'),
    newNumber: text('new_number'),
    newCityCode: text('new_city_code'),
    newLabel: text('new_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'delivery_address_overrides_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'delivery_address_overrides_company_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'delivery_address_overrides_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('delivery_address_overrides_company_document_idx').on(
      table.companyId,
      table.tripDocumentId,
    ),
    check('delivery_address_overrides_requested_by_check', sql`length(${table.requestedBy}) > 0`),
    check('delivery_address_overrides_reason_check', sql`length(${table.reason}) > 0`),
  ],
)
