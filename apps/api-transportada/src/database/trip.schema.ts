/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TRIP_OCCURRENCE_STAGE } from '../shared/trip-occurrence.constant.js'
import type { TripOccurrenceStage } from '../shared/trip-occurrence.constant.js'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { fleetDrivers, fleetVehicles } from './fleet.schema.js'
import { freightCalculations } from './freight.schema.js'
import { GEOCODING_PRECISIONS, type GeocodingPrecision } from './geocoding.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { storedObjects } from './storage.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * ADR-0067 §2: quem registrou o evento de campo — motorista pelo PWA, escritório em nome dele, ou
 * motorista pelo WhatsApp. `varchar`, nunca ENUM nativo (code-standart §8).
 *
 * Definida aqui (e não só em `trips/domain/`) porque o schema já a usa nos seis `check`s abaixo;
 * `trips/domain/trip-field-channel.constant.ts` reexporta para o resto do módulo, no mesmo molde de
 * `TripStatus`/`TripStopEventKind` — importar `trips/domain` daqui puxaria a árvore de `trips/` para
 * dentro do fechamento de imports do pre-deploy (`test/database-migration/pre-deploy.contract.ts`).
 */
export const TRIP_FIELD_CHANNELS = {
  driverApp: 'driver_app',
  office: 'office',
  whatsapp: 'whatsapp',
  /**
   * ADR-0068 §3: ação da tela do escritório que **não** é em nome do motorista (fechar, planejar
   * rota, despachar pela web, cancelar). Não exige `on_behalf_of_driver_id`.
   */
  backoffice: 'backoffice',
} as const
export type TripFieldChannel = (typeof TRIP_FIELD_CHANNELS)[keyof typeof TRIP_FIELD_CHANNELS]

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
  /**
   * ADR-0058: a viagem na estrada, entre o toque de iniciar trajeto e a última nota fechada. Ela
   * existe porque a derivação não enxergava a hora em que mais se pergunta pela viagem — quem sai
   * do galpão às 6h e roda uma hora até a primeira parada aparecia como `dispatched` o tempo todo.
   */
  'on_delivery_route',
  'completed',
  'cancelled',
] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

/**
 * ADR-0046 §1: **derivado, e nunca a fonte.** A verdade da prontidão é a consulta ao estado real de
 * `cte_fiscal_documents`, feita a cada leitura; esta coluna existe para filtrar a lista de viagens
 * sem varrer o fiscal inteiro.
 *
 * Ela dessincroniza — é da natureza dela — no instante em que um CT-e é cancelado, e **manifesto
 * emitido sobre ela seria declaração falsa a órgão público**. Quem for usá-la para decidir emissão
 * está usando errado; quem for usá-la para pintar um semáforo está usando certo.
 */
export const TRIP_FISCAL_READINESS_STATES = [
  'incomplete',
  'ready',
  'manifested',
  'divergent',
  /**
   * Spec 065 D4: viagem cujas entregas são todas no município da transportadora. Ela vira NFS-e, não
   * tem CT-e a declarar e **não tem manifesto a emitir** — não é "incompleta". Ficar incompleta para
   * sempre é como uma viagem some da lista sem ninguém entender.
   */
  'not_applicable',
] as const
export type TripFiscalReadinessState = (typeof TRIP_FISCAL_READINESS_STATES)[number]

/** ADR-0043 §1: eixo da nota, do qual o estado da viagem é derivado. */
export const TRIP_DOCUMENT_SEPARATION_STATUSES = [
  'pending',
  'separated',
  'loaded',
  'delivered',
  'returned',
] as const
export type TripDocumentSeparationStatus = (typeof TRIP_DOCUMENT_SEPARATION_STATUSES)[number]

/**
 * Spec 164 T1/T2: os sete estados da tratativa de uma ocorrência de nota. Definida aqui, no schema,
 * e não em `trips/domain` (T2), porque o CHECK precisa do vocabulário antes de a máquina existir;
 * `occurrence-case-state.policy.ts` reexporta, no mesmo molde de `TripStatus` acima.
 *
 * ⚠️ **`cancelled` entrou na T2, decisão do usuário**: ocorrência aberta por engano. Sai só de
 * `recorded` e `under_review` — nunca de `awaiting_contractor` em diante, pela mesma razão da D4
 * (depois que o contratante viu, esconder é reescrever o que ele leu). É terminal, como
 * `returned_to_warehouse` e `closed`.
 */
export const TRIP_OCCURRENCE_CASE_STATUSES = [
  'recorded',
  'under_review',
  'returned_to_warehouse',
  'awaiting_contractor',
  'decided',
  'closed',
  'cancelled',
] as const
export type TripOccurrenceCaseStatus = (typeof TRIP_OCCURRENCE_CASE_STATUSES)[number]

export const TRIP_OCCURRENCE_CASE_DECISION_KINDS = [
  'redelivery_authorized',
  'goods_paid',
  'other',
] as const
export type TripOccurrenceCaseDecisionKind = (typeof TRIP_OCCURRENCE_CASE_DECISION_KINDS)[number]

/**
 * Spec 164 T2: o que aconteceu com a proposta de reentrega (T14, `redelivery-proposal.policy.ts`) —
 * `reorder_stop` aplicada (`reordered`), `release_document` aplicada (`released`), ou a viagem
 * despachada recusou a mudança de roteiro (`refused`, D9). `null` é "nunca chegou a propor" — a
 * decisão não foi `redelivery_authorized`, ou a proposta ainda não foi confirmada por gente.
 *
 * ⚠️ **Coluna, não tabela nova** (correção da revisão): a RF18 pede registrar a recusa de
 * reordenação, mas `trip_occurrence_case_events` só aceita evento quando o estado muda
 * (`transition_check`) — aplicar/recusar a reentrega não move `status`. Decisão registrada em
 * `plan.md`: uma tabela de eventos própria para isso duplicaria o histórico sem mudar estado
 * nenhum, e afrouxar o CHECK do histórico deixaria `trip_occurrence_case_events` aceitar "evento"
 * sem transição — a garantia que ele existe para dar.
 */
export const TRIP_OCCURRENCE_CASE_REDELIVERY_APPLICATIONS = [
  'reordered',
  'released',
  'refused',
] as const
export type TripOccurrenceCaseRedeliveryApplication =
  (typeof TRIP_OCCURRENCE_CASE_REDELIVERY_APPLICATIONS)[number]

/** Quem gravou a transição: o time interno ou a decisão do contratante no portal (T9/T10). */
export const TRIP_OCCURRENCE_CASE_ACTOR_KINDS = ['internal', 'contractor'] as const
export type TripOccurrenceCaseActorKind = (typeof TRIP_OCCURRENCE_CASE_ACTOR_KINDS)[number]

/** `unset` nunca aparece em `trip_occurrence_cases.redelivery_policy` — só no tipo cadastrado. */
export const REDELIVERY_POLICIES = ['unset', 'allowed', 'blocked'] as const
export type RedeliveryPolicy = (typeof REDELIVERY_POLICIES)[number]

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
    fiscalReadinessState: text('fiscal_readiness_state')
      .$type<TripFiscalReadinessState>()
      .notNull()
      .default('incomplete'),
    /**
     * Spec 065 D4c: **três estados**. `null` é o padrão e significa "derive da classificação" —
     * quem sobrescreve assume, e o motivo da dispensa fica ao lado.
     */
    requiresMdfe: boolean('requires_mdfe'),
    requiresMdfeReason: text('requires_mdfe_reason'),
    requiresMdfeActorUserId: uuid('requires_mdfe_actor_user_id'),
    requiresMdfeSetAt: timestamp('requires_mdfe_set_at', { withTimezone: true }),
    /**
     * Spec 090 T11: o pedágio congelado no momento em que o roteiro foi planejado — nunca
     * recalculado na leitura da valoração, que pareia a rota de hoje com a distância de ontem
     * (D4). `null` é "roteiro nunca planejado com pedágio calculável", nunca zero.
     */
    plannedToll: jsonb('planned_toll'),
    plannedTollFrozenAt: timestamp('planned_toll_frozen_at', { withTimezone: true }),
    /**
     * Spec 153 D4: **a rota nasce inteira numa escrita.** Traçado simplificado, pernas, assinatura e
     * critério da escolha — o pedágio congelado continua em `planned_toll`, gravado na mesma escrita
     * pelo caso de uso, não nesta coluna. `null` é "roteiro nunca planejado", nunca rota parcial.
     */
    plannedRoute: jsonb('planned_route'),
    plannedDistanceMeters: bigint('planned_distance_meters', { mode: 'number' }),
    /** Spec 153 D9 / "Casos extremos": `end_policy = 'last_stop'` grava `0`, nunca nulo. */
    plannedReturnDistanceMeters: bigint('planned_return_distance_meters', { mode: 'number' }),
    plannedDurationSeconds: bigint('planned_duration_seconds', { mode: 'number' }),
    plannedRouteFrozenAt: timestamp('planned_route_frozen_at', { withTimezone: true }),
    /**
     * Spec 107 D3: quando o ETA das paradas foi calculado. ⚠️ **A hora envelhece, e esta coluna
     * existe para dizer isso** — o ETA congela no planejamento, e às 14h ainda diz o que achava às
     * 7h. Sem o carimbo, a tela mostraria uma hora que parece previsão de agora.
     */
    estimatedArrivalFrozenAt: timestamp('estimated_arrival_frozen_at', { withTimezone: true }),
    /**
     * Spec 109 D2: **a saída a que os ETAs das paradas estão ancorados.** Nasce com a premissa do
     * planejamento e é reescrita pelo despacho com a saída real — é isso que torna o deslocamento
     * idempotente, porque despachar de novo passa a ter diferença zero.
     */
    etaDepartureAt: timestamp('eta_departure_at', { withTimezone: true }),
    /**
     * Spec 143 D4: quantas diárias esta viagem paga. Nasce da duração estimada e quem cria a viagem
     * corrige o número. Nula é viagem anterior à feature: a leitura usa a sugestão e marca a parcela
     * como estimada, em vez de fingir que alguém informou.
     */
    dailyAllowanceDays: integer('daily_allowance_days'),
    /**
     * Spec 156 T8c (ADR-0067): quem encerrou, quando e por quê. `closedAt`/`closedByUserId` nascem
     * juntos, e `closeReason` é obrigatório só quando havia nota em aberto no momento do
     * encerramento — a regra vive em `trip-close.policy.ts`, não aqui.
     */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByUserId: uuid('closed_by_user_id'),
    closeReason: text('close_reason'),
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
    foreignKey({
      columns: [table.companyId, table.closedByUserId],
      foreignColumns: [userCompanyMemberships.companyId, userCompanyMemberships.userId],
      name: 'trips_company_closed_by_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** O motivo só existe com o encerramento: as duas colunas nascem e morrem juntas. */
    check(
      'trips_close_check',
      sql`(${table.closedAt} is null) = (${table.closedByUserId} is null)
        and (${table.closeReason} is null or ${table.closedAt} is not null)`,
    ),
    unique('trips_company_id_id_unique').on(table.companyId, table.id),
    index('trips_company_status_created_at_idx').on(table.companyId, table.status, table.createdAt),
    index('trips_company_vehicle_idx').on(table.companyId, table.vehicleId),
    check('trips_status_check', sql`${table.status} in (${raw(inList(TRIP_STATUSES))})`),
    check(
      'trips_fiscal_readiness_check',
      sql`${table.fiscalReadinessState} in (${raw(inList(TRIP_FISCAL_READINESS_STATES))})`,
    ),
    /** O semáforo da lista: filtrar "prontas para manifestar" sem varrer o fiscal da empresa. */
    index('trips_company_fiscal_readiness_idx').on(table.companyId, table.fiscalReadinessState),
    /**
     * Meia gravação é o estado que faz o leitor inventar (spec 090 T11): o congelado e a hora do
     * congelamento nascem e morrem juntos.
     */
    check(
      'trips_planned_toll_check',
      sql`(${table.plannedToll} is null) = (${table.plannedTollFrozenAt} is null)`,
    ),
    /**
     * Spec 153 D4: as quatro colunas da rota escolhida nascem e morrem com `planned_route_frozen_at`
     * — a mesma forma de `trips_planned_toll_check`, sem misturar as duas guardas.
     */
    check(
      'trips_planned_route_check',
      sql`(${table.plannedRoute} is null) = (${table.plannedRouteFrozenAt} is null)
        and (${table.plannedDistanceMeters} is null) = (${table.plannedRouteFrozenAt} is null)
        and (${table.plannedReturnDistanceMeters} is null) = (${table.plannedRouteFrozenAt} is null)
        and (${table.plannedDurationSeconds} is null) = (${table.plannedRouteFrozenAt} is null)`,
    ),
    /** RF1: distância e duração gravadas nunca são negativas — desconhecido é `null`, nunca zero. */
    check(
      'trips_planned_route_metrics_check',
      sql`(${table.plannedDistanceMeters} is null or ${table.plannedDistanceMeters} >= 0)
        and (${table.plannedReturnDistanceMeters} is null or ${table.plannedReturnDistanceMeters} >= 0)
        and (${table.plannedDurationSeconds} is null or ${table.plannedDurationSeconds} >= 0)`,
    ),
    /** Meia diária está fora do escopo (D4), e viagem de zero dia não existe: o piso é uma. */
    check(
      'trips_daily_allowance_days_check',
      sql`${table.dailyAllowanceDays} is null or ${table.dailyAllowanceDays} >= 1`,
    ),
    foreignKey({
      columns: [table.requiresMdfeActorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trips_requires_mdfe_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * O motivo só existe para a dispensa: `true` e `null` não têm o que justificar. Quem forçar
     * `false` sem motivo é recusado pela política, que conhece a classificação das notas — o banco
     * garante só a coerência da forma.
     */
    check(
      'trips_requires_mdfe_reason_check',
      sql`(${table.requiresMdfeReason} is null) or (${table.requiresMdfe} = false)`,
    ),
    /** Sobrescrita sem autor e sem data é trilha que não conta quem assinou. */
    check(
      'trips_requires_mdfe_trail_check',
      sql`(${table.requiresMdfe} is null) = (${table.requiresMdfeActorUserId} is null)
        and (${table.requiresMdfe} is null) = (${table.requiresMdfeSetAt} is null)`,
    ),
  ],
)

/**
 * ADR-0068 §1: histórico de `trips.status`. `recordTripStatusChange` (`trip-status-event.persistence.ts`,
 * spec 158 T3) é o **único** escritor.
 *
 * ⚠️ `actor_user_id` **não** tem FK para `user_company_memberships` (mesma assimetria deliberada de
 * `nfe_package_box_measurements` — `nfe.schema.ts`): `removeMembership`
 * (`drizzle-company-user.repository.ts`) faz DELETE físico da linha de membership, e aqui RESTRICT
 * quebraria a remoção de quem já planejou, cancelou ou fechou uma viagem — e falharia depois de já
 * ter desvinculado o WhatsApp e desabilitado a conta no Keycloak. O isolamento por empresa continua
 * garantido pela FK composta `(company_id, trip_id)` abaixo; o ator é só um dado guardado, não um
 * vínculo referencial. A leitura resolve o nome por membership escopado pela empresa; ator removido
 * aparece sem nome.
 *
 * `from_status`/`actor_user_id` são `not null`: não há escrita de sistema hoje (inventário da
 * ADR-0068), e nada grava a criação da viagem — ela já está em `trips.created_at`.
 */
export const tripStatusEvents = pgTable(
  'trip_status_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    fromStatus: text('from_status').notNull().$type<TripStatus>(),
    toStatus: text('to_status').notNull().$type<TripStatus>(),
    actorUserId: uuid('actor_user_id').notNull(),
    channel: varchar('channel', { length: 16 })
      .$type<TripFieldChannel>()
      .notNull()
      .default(TRIP_FIELD_CHANNELS.driverApp),
    /** ADR-0067 §2: só quando `channel = 'office'` — o motorista em nome de quem se registrou. */
    onBehalfOfDriverId: uuid('on_behalf_of_driver_id'),
    /** A hora em que a transição aconteceu — não necessariamente a hora em que foi gravada. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** ADR-0067 §3 / ADR-0068 "Consequências": igual a `trip_stop_events.recorded_at`. */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_status_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_status_events_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.onBehalfOfDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_status_events_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Spec 156 T15: o índice da chave estrangeira em nome de quem — sem ele, apagar ou renumerar um
     * motorista varre a tabela inteira. Parcial: só o canal `office` preenche a coluna.
     */
    index('trip_status_events_company_on_behalf_driver_idx')
      .on(table.companyId, table.onBehalfOfDriverId)
      .where(sql`${table.onBehalfOfDriverId} is not null`),
    unique('trip_status_events_company_id_id_unique').on(table.companyId, table.id),
    /** A linha do tempo lê por viagem, ordenada — sem este índice ela varre a tabela inteira. */
    index('trip_status_events_company_trip_occurred_at_idx').on(
      table.companyId,
      table.tripId,
      table.occurredAt,
      table.id,
    ),
    check(
      'trip_status_events_channel_check',
      sql`${table.channel} in (${raw(inList(Object.values(TRIP_FIELD_CHANNELS)))})`,
    ),
    check(
      'trip_status_events_office_driver_check',
      sql`${table.channel} <> 'office' or ${table.onBehalfOfDriverId} is not null`,
    ),
    check('trip_status_events_transition_check', sql`${table.fromStatus} <> ${table.toStatus}`),
    check(
      'trip_status_events_from_status_check',
      sql`${table.fromStatus} in (${raw(inList(TRIP_STATUSES))})`,
    ),
    check(
      'trip_status_events_to_status_check',
      sql`${table.toStatus} in (${raw(inList(TRIP_STATUSES))})`,
    ),
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
    /**
     * ADR-0044 §5: coordenada e precisão da parada. Anuláveis porque a parada nasce do endereço da
     * nota e só ganha coordenada quando é geocodificada — parada sem coordenada é cadastro em
     * andamento, não erro, e inventar valor em migration é inventar rota.
     */
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    geocodingPrecision: text('geocoding_precision').$type<GeocodingPrecision>(),
    /** O que o roteiro aceito calculou para esta parada — some quando a ordem muda. */
    estimatedArrivalAt: timestamp('estimated_arrival_at', { withTimezone: true }),
    distanceFromPreviousMeters: bigint('distance_from_previous_meters', { mode: 'number' }),
    durationFromPreviousSeconds: bigint('duration_from_previous_seconds', { mode: 'number' }),
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
    // Coordenada é par: meia coordenada não localiza nada, e a precisão descreve o par
    check(
      'trip_stops_coordinates_check',
      sql`(${table.latitude} is null) = (${table.longitude} is null) and (${table.latitude} is null or ${table.geocodingPrecision} is not null)`,
    ),
    check(
      'trip_stops_latitude_range_check',
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      'trip_stops_longitude_range_check',
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
    check(
      'trip_stops_geocoding_precision_check',
      sql`${table.geocodingPrecision} is null or ${table.geocodingPrecision} in (${sql.raw(inList(GEOCODING_PRECISIONS))})`,
    ),
    // Trecho anterior não tem sinal: distância negativa é conta errada, não rota curta
    check(
      'trip_stops_leg_check',
      sql`(${table.distanceFromPreviousMeters} is null or ${table.distanceFromPreviousMeters} >= 0) and (${table.durationFromPreviousSeconds} is null or ${table.durationFromPreviousSeconds} >= 0)`,
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
    /**
     * Spec 073 RF4/CA10: de onde saiu o endereço físico — `delivery` do `<entrega>`, `recipient` do
     * `<enderDest>`. Mora no **vínculo**, nunca na parada: uma parada agrupa várias notas, e a mesma
     * chave pode ser alcançada pela entrega de uma e pelo cadastro de outra — em `trip_stops` a tela
     * mentiria na primeira parada mista. Nulo é vínculo anterior à migration, ou nota sem destino.
     */
    destinationOrigin: text('destination_origin'),
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
    /** ADR-0067 §2: quem gravou — motorista, escritório ou WhatsApp. Sem backfill: o default descreve o histórico. */
    channel: varchar('channel', { length: 16 })
      .$type<TripFieldChannel>()
      .notNull()
      .default(TRIP_FIELD_CHANNELS.driverApp),
    /** ADR-0067 §2: só quando `channel = 'office'` — o motorista em nome de quem o escritório registrou. */
    onBehalfOfDriverId: uuid('on_behalf_of_driver_id'),
    /**
     * ADR-0067 §3: `occurred_at` responde quando a transição aconteceu (pode ser retroativo); esta
     * responde quando alguém contou isso ao sistema. As duas coincidem para o motorista.
     */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
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
    // ADR-0067 §2: FK composta — o motorista em nome de quem se registra nunca é de outra empresa.
    foreignKey({
      columns: [table.companyId, table.onBehalfOfDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_document_events_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Spec 156 T15: o índice da chave estrangeira em nome de quem — sem ele, apagar ou renumerar um
     * motorista varre a tabela inteira. Parcial: só o canal `office` preenche a coluna.
     */
    index('trip_document_events_company_on_behalf_driver_idx')
      .on(table.companyId, table.onBehalfOfDriverId)
      .where(sql`${table.onBehalfOfDriverId} is not null`),
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
    check(
      'trip_document_events_channel_check',
      sql`${table.channel} in (${raw(inList(Object.values(TRIP_FIELD_CHANNELS)))})`,
    ),
    check(
      'trip_document_events_office_driver_check',
      sql`${table.channel} <> 'office' or ${table.onBehalfOfDriverId} is not null`,
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
    check('trip_dispatch_snapshots_sha256_check', sql`${table.snapshotSha256} ~ '^[0-9a-f]{64}$'`),
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

/**
 * ADR-0045 §3: **onde estava quando confirmou**, e nunca "onde está agora". A coordenada mora presa
 * ao evento de entrega, e não existe tabela de posição do motorista — essa ausência é a decisão, não
 * uma etapa futura.
 *
 * Anulável em toda coordenada porque a recusa não bloqueia (§3.1): GPS desligado, sem sinal no
 * galpão ou permissão negada confirmam a entrega do mesmo jeito. Produto que exige coordenada é
 * produto que o motorista contorna anotando no papel, e aí não sobra dado nenhum.
 *
 * É desta tabela que sai o tempo real de atendimento por parada — a medição que a 058 lê hoje de
 * colunas que ninguém escrevia, e que a 060 vai ler depois.
 */
export const TRIP_STOP_EVENT_KINDS = ['arrived', 'delivered', 'returned', 'occurrence'] as const
export type TripStopEventKind = (typeof TRIP_STOP_EVENT_KINDS)[number]

export const tripStopEvents = pgTable(
  'trip_stop_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    stopId: uuid('stop_id').notNull(),
    /** Chegada é da parada; entrega e retorno são de uma nota. */
    tripDocumentId: uuid('trip_document_id'),
    kind: text().notNull().$type<TripStopEventKind>(),
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    /**
     * O raio que o aparelho declarou. Precisão de 5 km é gravada **com** o número, nunca descartada:
     * galpão de laje é o caso normal, não o suspeito, e o escritório vê o raio ao lado do pino.
     */
    accuracyMeters: numeric('accuracy_meters', { precision: 10, scale: 2 }),
    /** A hora do aparelho quando a posição foi lida — não a hora em que o evento chegou ao servidor. */
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** ADR-0067 §2: quem gravou. Sem backfill: o default descreve o histórico. */
    channel: varchar('channel', { length: 16 })
      .$type<TripFieldChannel>()
      .notNull()
      .default(TRIP_FIELD_CHANNELS.driverApp),
    /** ADR-0067 §2: só quando `channel = 'office'` — o motorista em nome de quem se registrou. */
    onBehalfOfDriverId: uuid('on_behalf_of_driver_id'),
    /**
     * Spec 159 T11: o cadastro de motorista que reportou pelo app ou pelo WhatsApp, gravado no
     * evento. A nota do motorista deixa de depender do vínculo atual (`actor_user_id` →
     * membership → `fleet_drivers.membership_id`): desligar o acesso ao app não apaga o histórico
     * dele. Evento anterior a esta coluna segue resolvido pelo vínculo.
     */
    reportedByDriverId: uuid('reported_by_driver_id'),
    /**
     * ADR-0067 §3: hoje `created_at` faz os dois papéis (quando aconteceu e quando foi gravado). A
     * baixa retroativa do escritório muda `created_at` para a hora da entrega e grava aqui a hora
     * real do registro.
     */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_stop_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.stopId],
      foreignColumns: [tripStops.companyId, tripStops.id],
      name: 'trip_stop_events_company_stop_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'trip_stop_events_company_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_stop_events_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.onBehalfOfDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_stop_events_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Spec 156 T15: o índice da chave estrangeira em nome de quem — sem ele, apagar ou renumerar um
     * motorista varre a tabela inteira. Parcial: só o canal `office` preenche a coluna.
     */
    index('trip_stop_events_company_on_behalf_driver_idx')
      .on(table.companyId, table.onBehalfOfDriverId)
      .where(sql`${table.onBehalfOfDriverId} is not null`),
    foreignKey({
      columns: [table.companyId, table.reportedByDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_stop_events_company_reported_by_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_stop_events_company_id_id_unique').on(table.companyId, table.id),
    index('trip_stop_events_company_stop_created_at_idx').on(
      table.companyId,
      table.stopId,
      table.createdAt,
    ),
    /**
     * Spec 159 T7: a nota do motorista lê as entregas dos últimos 90 dias pela hora da entrega
     * (`captured_at ?? recorded_at`). Sem ele, o `EXPLAIN` varria todo evento da empresa, de todo
     * tipo e de todo o histórico, para descartar 88% no filtro.
     */
    index('trip_stop_events_company_delivered_at_idx')
      .on(table.companyId, sql`coalesce(${table.capturedAt}, ${table.recordedAt})`)
      .where(sql`${table.kind} = 'delivered'`),
    /** O expurgo dos 90 dias varre por data e apaga só a coordenada; sem este índice ele varre tudo. */
    index('trip_stop_events_located_created_at_idx')
      .on(table.createdAt)
      .where(sql`${table.latitude} is not null`),
    check(
      'trip_stop_events_kind_check',
      sql`${table.kind} in (${raw(inList(TRIP_STOP_EVENT_KINDS))})`,
    ),
    check(
      'trip_stop_events_coordinates_check',
      sql`(${table.latitude} is null) = (${table.longitude} is null)`,
    ),
    check(
      'trip_stop_events_latitude_range_check',
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      'trip_stop_events_longitude_range_check',
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
    /** Coordenada sem precisão e precisão sem coordenada são as duas metades de um dado que mente. */
    check(
      'trip_stop_events_accuracy_check',
      sql`${table.accuracyMeters} is null or ${table.latitude} is not null`,
    ),
    check(
      'trip_stop_events_channel_check',
      sql`${table.channel} in (${raw(inList(Object.values(TRIP_FIELD_CHANNELS)))})`,
    ),
    check(
      'trip_stop_events_office_driver_check',
      sql`${table.channel} <> 'office' or ${table.onBehalfOfDriverId} is not null`,
    ),
  ],
)

/**
 * ADR-0045 §6: o problema que hoje volta por WhatsApp e morre lá.
 *
 * **Não pede decisão** — não há coluna de valor, de custo nem de culpa, e isso é proposital: o
 * motorista descreve o que viu, e quem decide é o escritório com a 060 na mão. Uma coluna de valor
 * aqui viraria, na primeira semana, o motorista negociando taxa na porta do cliente.
 *
 * **É independente da entrega**: `trip_document_id` é anulável e nada liga a ocorrência ao desfecho
 * da nota. Ele esperou duas horas *e* entregou — os dois fatos convivem.
 */
/**
 * ⚠️ **Só o que é da parada.** Três valores saíram em 2026-09-03 porque pertenciam a outro eixo:
 * `damaged_goods` e `address_not_found` são da **nota** — e já são motivo de devolução —, e
 * `customer_closed` era `establishment_closed` com outro nome. O motorista via duas portas para o
 * mesmo fato e escolhia uma; o escritório reconciliava depois.
 *
 * Medido antes de encolher: `trip_stop_occurrences` tinha **zero linhas** nos dois ambientes, e
 * produção tinha **zero viagens**. Sem dado para migrar, o CHECK encolheu junto — conviver com
 * valor que a tela não oferece seria deixar a porta fechada por fora e aberta por dentro.
 */
export const TRIP_STOP_OCCURRENCE_KINDS = [
  'unexpected_charge',
  'long_wait',
  'dock_closed',
  'appointment_required',
  'other',
] as const
export type TripStopOccurrenceKind = (typeof TRIP_STOP_OCCURRENCE_KINDS)[number]

export const tripStopOccurrences = pgTable(
  'trip_stop_occurrences',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    stopId: uuid('stop_id').notNull(),
    tripDocumentId: uuid('trip_document_id'),
    kind: text().notNull().$type<TripStopOccurrenceKind>(),
    /** Curta de propósito: é relato de campo digitado com uma mão, não formulário. */
    description: text().notNull().default(''),
    /**
     * ADR-0057 §2 e §3: a distância entre onde o motorista estava e a parada, em metros inteiros.
     *
     * `null` é **não aferida**, e é um estado, não um erro: parada sem coordenada (latitude e
     * longitude são nulas no contrato de hoje) ou posição que nunca fixou. O escritório vê que a
     * distância não pôde ser medida, em vez de ver uma distância inventada.
     *
     * Longe **não impede**: acima do raio a tela avisa, grava e deixa seguir. Quem decide se a
     * distância invalida o relato é quem tem o contrato (ADR-0045 §6.1).
     */
    reportedDistanceMeters: integer('reported_distance_meters'),
    attachmentObjectId: uuid('attachment_object_id'),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * ADR-0067 §2: quem gravou. Sem backfill: o default descreve o histórico.
     *
     * ⚠️ Sem `recorded_at` própria: a ocorrência não tem uma hora "de acontecimento" separada da
     * hora de registro (D4 só trata a hora da entrega) — `created_at` já é exatamente quando foi
     * contada ao sistema, para os três canais.
     */
    channel: varchar('channel', { length: 16 })
      .$type<TripFieldChannel>()
      .notNull()
      .default(TRIP_FIELD_CHANNELS.driverApp),
    /** ADR-0067 §2: só quando `channel = 'office'` — o motorista em nome de quem se registrou. */
    onBehalfOfDriverId: uuid('on_behalf_of_driver_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_stop_occurrences_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.stopId],
      foreignColumns: [tripStops.companyId, tripStops.id],
      name: 'trip_stop_occurrences_company_stop_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'trip_stop_occurrences_company_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attachmentObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'trip_stop_occurrences_company_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_stop_occurrences_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.onBehalfOfDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_stop_occurrences_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Spec 156 T15: o índice da chave estrangeira em nome de quem — sem ele, apagar ou renumerar um
     * motorista varre a tabela inteira. Parcial: só o canal `office` preenche a coluna.
     */
    index('trip_stop_occurrences_company_on_behalf_driver_idx')
      .on(table.companyId, table.onBehalfOfDriverId)
      .where(sql`${table.onBehalfOfDriverId} is not null`),
    unique('trip_stop_occurrences_company_id_id_unique').on(table.companyId, table.id),
    index('trip_stop_occurrences_company_stop_created_at_idx').on(
      table.companyId,
      table.stopId,
      table.createdAt,
    ),
    /* Distância negativa é leitura corrompida; zero é legítimo — é o motorista na porta. */
    check(
      'trip_stop_occurrences_distance_check',
      sql`${table.reportedDistanceMeters} is null or ${table.reportedDistanceMeters} >= 0`,
    ),
    check(
      'trip_stop_occurrences_kind_check',
      sql`${table.kind} in (${raw(inList(TRIP_STOP_OCCURRENCE_KINDS))})`,
    ),
    check(
      'trip_stop_occurrences_channel_check',
      sql`${table.channel} in (${raw(inList(Object.values(TRIP_FIELD_CHANNELS)))})`,
    ),
    check(
      'trip_stop_occurrences_office_driver_check',
      sql`${table.channel} <> 'office' or ${table.onBehalfOfDriverId} is not null`,
    ),
  ],
)

/**
 * ADR-0045 §5: a idempotência mora **no servidor**, não no cliente.
 *
 * A fila offline reenvia, e dois celulares logados no mesmo motorista mandam a mesma coisa duas
 * vezes. Quem decide que é a mesma confirmação é esta tabela, no padrão `*_processed_messages` dos
 * workers: a chave vem do aparelho, e a resposta guardada volta igual no reenvio.
 *
 * `result_id` é o que foi criado da primeira vez — evento ou ocorrência —, para o reenvio devolver o
 * mesmo recurso em vez de um segundo.
 */
export const tripFieldReports = pgTable(
  'trip_field_reports',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    /** A rota que consumiu a chave: a mesma chave em ações diferentes é erro do cliente, não repetição. */
    operation: text().notNull(),
    resultId: uuid('result_id'),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * ADR-0067 §2: quem gravou. Sem backfill: o default descreve o histórico.
     *
     * ⚠️ Sem `recorded_at` própria: esta linha só existe para a chave de idempotência, e
     * `created_at` já é exatamente quando a chave foi reservada — não há "hora do fato" distinta.
     */
    channel: varchar('channel', { length: 16 })
      .$type<TripFieldChannel>()
      .notNull()
      .default(TRIP_FIELD_CHANNELS.driverApp),
    /** ADR-0067 §2: só quando `channel = 'office'` — o motorista em nome de quem se registrou. */
    onBehalfOfDriverId: uuid('on_behalf_of_driver_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_field_reports_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_field_reports_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.onBehalfOfDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_field_reports_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Spec 156 T15: o índice da chave estrangeira em nome de quem — sem ele, apagar ou renumerar um
     * motorista varre a tabela inteira. Parcial: só o canal `office` preenche a coluna.
     */
    index('trip_field_reports_company_on_behalf_driver_idx')
      .on(table.companyId, table.onBehalfOfDriverId)
      .where(sql`${table.onBehalfOfDriverId} is not null`),
    unique('trip_field_reports_company_key_unique').on(table.companyId, table.idempotencyKey),
    check('trip_field_reports_key_check', sql`length(${table.idempotencyKey}) > 0`),
    check('trip_field_reports_operation_check', sql`length(${table.operation}) > 0`),
    check(
      'trip_field_reports_channel_check',
      sql`${table.channel} in (${raw(inList(Object.values(TRIP_FIELD_CHANNELS)))})`,
    ),
    check(
      'trip_field_reports_office_driver_check',
      sql`${table.channel} <> 'office' or ${table.onBehalfOfDriverId} is not null`,
    ),
  ],
)

/**
 * ADR-0045 §7: o comprovante da entrega — foto do canhoto e/ou assinatura colhida na tela. Duas
 * linhas por entrega no caso comum, e por isso tabela em vez de coluna.
 *
 * **A assinatura colhe traço e nome do recebedor, e nunca CPF.** Puxar CPF de recebedor para dentro
 * do sistema por causa de um comprovante é dado pessoal novo, com criptografia em repouso, retenção
 * e trilha próprias — desproporcional ao ganho, porque quando a disputa acontece é o canhoto em
 * papel que a resolve. Não há coluna para ele aqui, e essa ausência é a decisão.
 */
export const TRIP_DELIVERY_PROOF_KINDS = ['photo', 'signature'] as const
export type TripDeliveryProofKind = (typeof TRIP_DELIVERY_PROOF_KINDS)[number]

/**
 * ADR-0070 §2: os vereditos que uma foto de entrega pode receber. Duplicado do
 * `PROOF_PUNCTUALITY` de `trips/domain/delivery-proof-punctuality.policy.ts`, pelo mesmo motivo do
 * `TRIP_FIELD_CHANNELS` acima — importar `trips/domain` daqui puxaria a árvore do módulo para dentro
 * do fechamento de imports do pre-deploy (`test/database-migration/pre-deploy.contract.ts`).
 */
export const TRIP_DELIVERY_PROOF_PUNCTUALITIES = [
  'not_required',
  'on_time',
  'late',
  'away',
  'late_and_away',
] as const
export type TripDeliveryProofPunctuality = (typeof TRIP_DELIVERY_PROOF_PUNCTUALITIES)[number]

export const tripDeliveryProofs = pgTable(
  'trip_delivery_proofs',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    stopEventId: uuid('stop_event_id').notNull(),
    kind: text().notNull().$type<TripDeliveryProofKind>(),
    objectId: uuid('object_id').notNull(),
    /**
     * Nome de quem recebeu. Normalmente só na assinatura — mas o canal `office` também o carrega em
     * `kind: 'photo'` (ADR-0067 §5, emenda 2026-09-18, spec 156 T6): o escritório não colhe
     * assinatura, e cumpre "assinatura obrigatória" com a foto do canhoto assinado + este nome.
     */
    receiverName: text('receiver_name').notNull().default(''),
    /**
     * ADR-0057 §3 (revisa ADR-0045 §7): o documento do recebedor entra **só quando a configuração
     * da empresa pede**, criptografado em envelope A256GCM com AAD
     * `transportada:delivery-proof:v1:${companyId}:${proofId}`. `null` é o caso de fábrica.
     */
    receiverDocumentEnvelope: jsonb('receiver_document_envelope'),
    /** A forma que toda leitura devolve (`***.938.570-**`). O valor em claro não tem coluna. */
    receiverDocumentMasked: text('receiver_document_masked').notNull().default(''),
    /**
     * Spec 082 (revisão, item 5): chave de idempotência do anexo, mandada pelo app. Reenvio com a
     * mesma chave para o mesmo evento+tipo converge na linha existente — o unique de
     * `(company, evento, tipo)` já impede a duplicata; a chave distingue retry de correção.
     */
    attachmentKey: text('attachment_key').notNull().default(''),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * ADR-0067 §2: quem gravou. Sem backfill: o default descreve o histórico.
     *
     * ⚠️ Sem `recorded_at` própria: o comprovante não tem uma hora "de acontecimento" à parte —
     * `created_at` já é quando o anexo chegou ao servidor, para os três canais.
     */
    channel: varchar('channel', { length: 16 })
      .$type<TripFieldChannel>()
      .notNull()
      .default(TRIP_FIELD_CHANNELS.driverApp),
    /** ADR-0067 §2: só quando `channel = 'office'` — o motorista em nome de quem se registrou. */
    onBehalfOfDriverId: uuid('on_behalf_of_driver_id'),
    /**
     * ADR-0070 §2-4, spec 159 RF3-RF6: onde e quando a foto foi tirada, lido no aparelho do
     * motorista. Anuláveis pelo mesmo motivo da posição do evento de entrega (ADR-0045 §3): a
     * recusa não bloqueia, e sem posição a foto conta como longe (`classifyProofPunctuality`).
     */
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    accuracyMeters: numeric('accuracy_meters', { precision: 10, scale: 2 }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    /**
     * ADR-0070 §2: o veredito da foto (`PROOF_PUNCTUALITY`). `not_required` é o padrão de fábrica —
     * cobre toda linha existente e toda foto de nota sem `photo = 'required'` resolvido.
     */
    punctuality: varchar('punctuality', { length: 16 })
      .notNull()
      .default('not_required')
      .$type<TripDeliveryProofPunctuality>(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_delivery_proofs_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.stopEventId],
      foreignColumns: [tripStopEvents.companyId, tripStopEvents.id],
      name: 'trip_delivery_proofs_company_event_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.objectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'trip_delivery_proofs_company_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.onBehalfOfDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_delivery_proofs_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Spec 156 T15: o índice da chave estrangeira em nome de quem — sem ele, apagar ou renumerar um
     * motorista varre a tabela inteira. Parcial: só o canal `office` preenche a coluna.
     */
    index('trip_delivery_proofs_company_on_behalf_driver_idx')
      .on(table.companyId, table.onBehalfOfDriverId)
      .where(sql`${table.onBehalfOfDriverId} is not null`),
    unique('trip_delivery_proofs_company_id_id_unique').on(table.companyId, table.id),
    /**
     * Spec 159 T11 (item 8): a posição da foto é dado de localização como a do evento de entrega, e
     * o expurgo dos 90 dias do worker (`trip.location.purge`) a apaga pelo mesmo corte — sem este
     * índice ele varreria todo comprovante do histórico.
     */
    index('trip_delivery_proofs_located_created_at_idx')
      .on(table.createdAt)
      .where(sql`${table.latitude} is not null`),
    /** Um comprovante de cada tipo por entrega: o segundo é correção, e correção substitui. */
    unique('trip_delivery_proofs_company_event_kind_unique').on(
      table.companyId,
      table.stopEventId,
      table.kind,
    ),
    check(
      'trip_delivery_proofs_kind_check',
      sql`${table.kind} in (${raw(inList(TRIP_DELIVERY_PROOF_KINDS))})`,
    ),
    /**
     * Nome só faz sentido em assinatura, ou no canhoto do escritório (ADR-0067 §5, emenda
     * 2026-09-18): ele nunca colhe assinatura, e o nome do recebedor é como cumpre a exigência.
     * Relaxado por migration aditiva da spec 156 T6 — o motorista continua sem essa saída.
     */
    check(
      'trip_delivery_proofs_receiver_check',
      sql`${table.kind} = 'signature' or ${table.channel} = 'office' or length(${table.receiverName}) = 0`,
    ),
    /**
     * O documento também é da assinatura, e máscara sem envelope (ou o inverso) é meia escrita.
     * Spec 156 T15 A2 (ADR-0067 §5): o canhoto do escritório cumpre a assinatura e carrega o
     * documento digitado, selado — relaxado por migration aditiva, o motorista continua sem essa saída.
     */
    check(
      'trip_delivery_proofs_receiver_document_check',
      sql`(${table.kind} = 'signature' or ${table.channel} = 'office' or ${table.receiverDocumentEnvelope} is null) and ((${table.receiverDocumentEnvelope} is null) = (length(${table.receiverDocumentMasked}) = 0))`,
    ),
    check(
      'trip_delivery_proofs_channel_check',
      sql`${table.channel} in (${raw(inList(Object.values(TRIP_FIELD_CHANNELS)))})`,
    ),
    check(
      'trip_delivery_proofs_office_driver_check',
      sql`${table.channel} <> 'office' or ${table.onBehalfOfDriverId} is not null`,
    ),
    // Coordenada é par, mesmo molde de `trip_stops_coordinates_check` — meia coordenada não localiza.
    check(
      'trip_delivery_proofs_coordinates_check',
      sql`(${table.latitude} is null) = (${table.longitude} is null)`,
    ),
    check(
      'trip_delivery_proofs_latitude_range_check',
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      'trip_delivery_proofs_longitude_range_check',
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
    check(
      'trip_delivery_proofs_punctuality_check',
      sql`${table.punctuality} in (${raw(inList(TRIP_DELIVERY_PROOF_PUNCTUALITIES))})`,
    ),
  ],
)

/**
 * Spec 079 T020: o que houve com um item da carga.
 *
 * ⚠️ **Append-only por desenho**, como `audit_logs` e `trip_dispatch_snapshots`: ocorrência é
 * registro do que aconteceu, e o que aconteceu não se edita. Corrigir é registrar outra.
 *
 * ⚠️ **Ela só anota.** Não bloqueia transição e não muda `separation_status` — misturar o estado da
 * nota com o que houve com ela deixaria o operador sem saída, porque não existe tela de resolução
 * de ocorrência. Quando existir, é decisão nova, por escrito.
 */
export const tripDocumentOccurrences = pgTable(
  'trip_document_occurrences',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripDocumentId: uuid('trip_document_id').notNull(),
    /** O código do item em `nfe_products`. Vazio na ocorrência da nota inteira — recusa total não tem item. */
    productCode: text('product_code').notNull().default(''),
    stage: text().notNull().$type<TripOccurrenceStage>(),
    /** Spec 079: o tipo que a empresa cadastrou. Deixou de ser texto de catálogo fechado. */
    occurrenceTypeId: uuid('occurrence_type_id').notNull(),
    note: text().notNull().default(''),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * ADR-0067 §2: quem gravou. Sem backfill: o default descreve o histórico.
     *
     * ⚠️ Sem `recorded_at` própria: a ocorrência é append-only e não tem hora "de acontecimento"
     * separada — `created_at` já é quando foi contada ao sistema, para os três canais.
     */
    channel: varchar('channel', { length: 16 })
      .$type<TripFieldChannel>()
      .notNull()
      .default(TRIP_FIELD_CHANNELS.driverApp),
    /** ADR-0067 §2: só quando `channel = 'office'` — o motorista em nome de quem se registrou. */
    onBehalfOfDriverId: uuid('on_behalf_of_driver_id'),
    /**
     * Spec 156 T7b (D7 §3.5): a foto opcional do lote — um objeto só, referenciado pelas N linhas
     * que o mesmo lote gravou. No molde de `trip_stop_occurrences.attachment_object_id`.
     */
    attachmentObjectId: uuid('attachment_object_id'),
  },
  (table) => [
    /**
     * Spec 161 T1: pré-requisito da FK composta de `trip_document_occurrence_attachments` — sem
     * este unique, a tabela nova não consegue referenciar `(company_id, id)` desta.
     */
    unique('trip_document_occurrences_company_id_id_unique').on(table.companyId, table.id),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_document_occurrences_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'trip_document_occurrences_company_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.onBehalfOfDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_document_occurrences_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Spec 156 T15: o índice da chave estrangeira em nome de quem — sem ele, apagar ou renumerar um
     * motorista varre a tabela inteira. Parcial: só o canal `office` preenche a coluna.
     */
    index('trip_document_occurrences_company_on_behalf_driver_idx')
      .on(table.companyId, table.onBehalfOfDriverId)
      .where(sql`${table.onBehalfOfDriverId} is not null`),
    foreignKey({
      columns: [table.companyId, table.attachmentObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'trip_document_occurrences_company_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'trip_document_occurrences_stage_check',
      sql`${table.stage} in (${raw(inList(Object.values(TRIP_OCCURRENCE_STAGE)))})`,
    ),
    check(
      'trip_document_occurrences_channel_check',
      sql`${table.channel} in (${raw(inList(Object.values(TRIP_FIELD_CHANNELS)))})`,
    ),
    check(
      'trip_document_occurrences_office_driver_check',
      sql`${table.channel} <> 'office' or ${table.onBehalfOfDriverId} is not null`,
    ),
    index('trip_document_occurrences_company_document_idx').on(
      table.companyId,
      table.tripDocumentId,
      table.createdAt,
    ),
  ],
)

/**
 * Spec 161 (D2/D12): as fotos da ocorrência de galpão — até cinco por ocorrência, cada uma com um
 * original (`stored_object_id`, prova) e uma miniatura opcional (`thumbnail_object_id`, o que as
 * listas carregam). `attachment_object_id` de `trip_document_occurrences` continua servindo a
 * ocorrência de rua (D6) — esta tabela nunca é escrita por aquele canal.
 *
 * ⚠️ O teto de cinco está **duplicado no banco**: o CHECK de `position` (1 a 5) e a política de
 * aplicação (`OCCURRENCE_ATTACHMENT_LIMIT`, T2). Mudar o teto exige migration nos dois lugares.
 *
 * ⚠️ `position` é monotônica, nunca reciclada. É escolhida **dentro do `INSERT`**
 * (`coalesce(max(position), 0) + 1`, T3), nunca por um `SELECT count(*)` antes — reciclar um buraco
 * (ex.: a foto 3 falhou e a próxima reusa a posição 3) reintroduziria a corrida de duas abas
 * disputando a mesma posição. O unique de `(company_id, occurrence_id, position)` é quem resolve a
 * corrida da sexta foto: a violação vira 409, e o mapeamento para
 * `TripOccurrenceAttachmentLimitError`/`TRIP_OCCURRENCE_ATTACHMENT_LIMIT` cobre os dois SQLSTATE por
 * nome de constraint — `23505` (este unique) e `23514` (o CHECK de posição). Esse mapeamento é do
 * caso de uso (T6/T7), fora do escopo desta task; fica registrado aqui para quem chegar antes.
 */
export const tripDocumentOccurrenceAttachments = pgTable(
  'trip_document_occurrence_attachments',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceId: uuid('occurrence_id').notNull(),
    storedObjectId: uuid('stored_object_id').notNull(),
    /** Nulo: foto do WhatsApp (D14), coluna antiga sem miniatura, ou falha de geração no cliente. */
    thumbnailObjectId: uuid('thumbnail_object_id'),
    position: smallint().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('trip_document_occurrence_attachments_company_id_id_unique').on(
      table.companyId,
      table.id,
    ),
    unique('trip_document_occurrence_attachments_unique_position').on(
      table.companyId,
      table.occurrenceId,
      table.position,
    ),
    check(
      'trip_document_occurrence_attachments_position_check',
      sql`${table.position} between 1 and 5`,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_document_occurrence_attachments_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [tripDocumentOccurrences.companyId, tripDocumentOccurrences.id],
      name: 'trip_document_occurrence_attachments_company_occurrence_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.storedObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'trip_document_occurrence_attachments_company_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.thumbnailObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'trip_document_occurrence_attachments_company_thumbnail_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** FK não-parcial da coluna NOT NULL, RESTRICT — a mais cara de deixar sem índice. */
    index('trip_document_occurrence_attachments_company_object_idx').on(
      table.companyId,
      table.storedObjectId,
    ),
    /** FK parcial: só a linha que tem miniatura, no molde do índice de `on_behalf_of_driver_id`. */
    index('trip_document_occurrence_attachments_company_thumbnail_idx')
      .on(table.companyId, table.thumbnailObjectId)
      .where(sql`${table.thumbnailObjectId} is not null`),
    index('trip_document_occurrence_attachments_company_occurrence_idx').on(
      table.companyId,
      table.occurrenceId,
      table.position,
    ),
  ],
)

/**
 * Os itens da nota que **uma mesma** ocorrência aponta. Uma caixa violada costuma levar mais de um
 * item, e a foto, a observação e o tipo são os mesmos — repetir a ocorrência por item multiplicaria
 * o mesmo fato e faria a estatística contar avarias que não aconteceram.
 *
 * ⚠️ **`trip_document_occurrences.product_code` continua existindo e continua sendo escrita** com o
 * primeiro item (vazia na ocorrência da nota inteira). Ocorrência antiga não tem linha aqui, e o
 * fluxo do WhatsApp grava só a coluna — a leitura deriva `productCodes` de uma ou de outra
 * (`resolveOccurrenceProductCodes`). Migrar a coluna para cá seria reescrever histórico por
 * conveniência de formato.
 *
 * `position` guarda a ordem em que o conferente marcou os itens: o e-mail os cita nessa ordem, e
 * sem ela o texto mudaria de uma leitura para a outra.
 */
export const tripDocumentOccurrenceProducts = pgTable(
  'trip_document_occurrence_products',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceId: uuid('occurrence_id').notNull(),
    /** O código do item em `nfe_products`, conferido contra a nota antes de gravar. */
    productCode: text('product_code').notNull(),
    position: smallint().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('trip_document_occurrence_products_company_id_id_unique').on(table.companyId, table.id),
    /** Item repetido na mesma ocorrência é engano de quem marcou — o banco também não o aceita. */
    unique('trip_document_occurrence_products_unique_code').on(
      table.companyId,
      table.occurrenceId,
      table.productCode,
    ),
    /** Serve de índice da leitura por ocorrência, em ordem — sem índice extra ao lado. */
    unique('trip_document_occurrence_products_unique_position').on(
      table.companyId,
      table.occurrenceId,
      table.position,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_document_occurrence_products_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [tripDocumentOccurrences.companyId, tripDocumentOccurrences.id],
      name: 'trip_document_occurrence_products_company_occurrence_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

/**
 * Spec 079: os tipos de ocorrência que **a empresa cadastrou**.
 *
 * ⚠️ Deixou de ser catálogo fechado do produto em 2026-09-03. O `stage` é escolhido no cadastro
 * porque é ele que decide **quem registra** — `separation` é do galpão (`trip.manage`) e `delivery`
 * é da rua (`trip.report`); sem ele não há como derivar a permissão, e a linha entre barracão e rua
 * da ADR-0043 se perderia.
 *
 * ⚠️ **A flag de aviso é coluna daqui**, não tabela ao lado: eram a mesma decisão chaveada pelo
 * mesmo valor, e separá-las obrigava a tela a casar duas listas para mostrar uma.
 *
 * `active` aposenta o tipo sem apagar histórico — apagar deixaria ocorrência órfã.
 */
export const companyOccurrenceTypes = pgTable(
  'company_occurrence_types',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    stage: text().notNull().$type<TripOccurrenceStage>(),
    notifies: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    /**
     * O e-mail ao embarcador, com marcadores. Vazio é tipo que não gera e-mail — nem toda
     * ocorrência precisa avisar o cliente.
     */
    emailSubject: text('email_subject').notNull().default(''),
    emailBody: text('email_body').notNull().default(''),
    /**
     * A chave do template do módulo de notificações que este tipo **seleciona**. Com ela, o texto
     * mora no catálogo de templates — assunto/corpo acima viram legado e ficam vazios no cadastro
     * novo. Nula é o legado (ou tipo sem e-mail).
     */
    emailTemplateKey: varchar('email_template_key', { length: 120 }),
    /**
     * Spec 143 (P4): liga o envio automático à contratante quando a ocorrência é registrada, sem
     * clique do operador — pela mesma porta do P1 (`send-occurrence-mail.use-case.ts`). Padrão
     * `false`: nenhuma instalação passa a mandar e-mail sozinha ao aplicar esta migration.
     */
    emailsContractor: boolean('emails_contractor').notNull().default(false),
    /**
     * Spec 164 T1: se a nota atingida por este tipo de ocorrência pode ser reentregue
     * (`allowed`/`blocked`) ou se o tipo não decide isso (`unset`, o padrão — nenhuma instalação
     * ganha tratativa nova ao aplicar esta migration). `unset` nunca abre `trip_occurrence_cases`
     * (D1); é o CHECK da tabela nova, não deste, que proíbe o valor na tratativa em si.
     */
    redeliveryPolicy: text('redelivery_policy')
      .notNull()
      .$type<RedeliveryPolicy>()
      .default('unset'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_occurrence_types_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'company_occurrence_types_stage_check',
      sql`${table.stage} in (${raw(inList(Object.values(TRIP_OCCURRENCE_STAGE)))})`,
    ),
    check('company_occurrence_types_name_check', sql`length(btrim(${table.name})) > 0`),
    check(
      'company_occurrence_types_redelivery_policy_check',
      sql`${table.redeliveryPolicy} in (${raw(inList(REDELIVERY_POLICIES))})`,
    ),
    unique('company_occurrence_types_company_id_id_unique').on(table.companyId, table.id),
  ],
)

/**
 * Spec 164 T1: a tratativa da nota atingida por ocorrência — decisão sobre o que houve, em cima do
 * registro append-only de `trip_document_occurrences`. Uma tratativa por ocorrência
 * (`trip_occurrence_cases_occurrence_unique`); a ocorrência continua imutável e é esta tabela que
 * muda de estado. O item do acerto (`trip_occurrence_item_settlements`) foi para a T16 (Fase 5),
 * junto da migration de `delivery_charges` que ele alimenta — as duas mexem no mesmo dinheiro.
 *
 * ⚠️ **`redelivery_policy` nunca guarda `'unset'`** (correção do `architect`, D1): tipo `unset` não
 * abre tratativa — aceitar o valor aqui deixaria a tabela guardar uma linha que a política diz não
 * existir. O CHECK só aceita `allowed`/`blocked`; quem decide `unset` não abre é
 * `occurrence-case.policy.ts` (T2), fora do escopo desta task.
 *
 * ⚠️ **`status` nasce sem `default`** (correção do `architect`): estado inicial escolhido pelo banco
 * é estado que um escritor esquecido grava sem querer — precedente medido:
 * `delivery_charges.status` (`delivery-client.schema.ts`). Quem abre a tratativa (T4) grava
 * `'recorded'` explicitamente.
 *
 * ⚠️ **`resolved_at`, não `closed_at`** (decisão registrada por escrito, correção do `architect`): a
 * coluna também é preenchida por `returned_to_warehouse` — devolvida ao barracão fecha o ciclo tanto
 * quanto `closed` — e `closed_at` sugeriria só o fechamento formal. Renomeada em vez de só comentada,
 * para a leitura do nome não mentir.
 *
 * ⚠️ **Sem FK composta para `trip_document_occurrence_products`** (tentação registrada e recusada,
 * correção do `architect`): ocorrência antiga e a do WhatsApp gravam só `product_code` em
 * `trip_document_occurrences`, e a nota inteira grava `''` — não há chave composta que sirva às três
 * formas ao mesmo tempo. A leitura do item continua por `resolveOccurrenceProductCodes`.
 *
 * ⚠️ **`trip_document_occurrences.occurrence_type_id` continua sem FK para `company_occurrence_types`**
 * (tentação registrada e recusada, correção do `architect`) — não é esta spec que conserta isso.
 */
export const tripOccurrenceCases = pgTable(
  'trip_occurrence_cases',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceId: uuid('occurrence_id').notNull(),
    status: text().notNull().$type<TripOccurrenceCaseStatus>(),
    redeliveryPolicy: text('redelivery_policy').notNull().$type<RedeliveryPolicy>(),
    decisionKind: text('decision_kind').$type<TripOccurrenceCaseDecisionKind>(),
    decisionNote: text('decision_note').notNull().default(''),
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    /** Fechamento **ou** devolução ao barracão — ver a nota acima sobre o nome da coluna. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** RF18 (T14): o que aconteceu com a proposta de reentrega — ver o comentário do tipo acima. */
    redeliveryApplication:
      text('redelivery_application').$type<TripOccurrenceCaseRedeliveryApplication>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('trip_occurrence_cases_company_id_id_unique').on(table.companyId, table.id),
    unique('trip_occurrence_cases_occurrence_unique').on(table.companyId, table.occurrenceId),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_occurrence_cases_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [tripDocumentOccurrences.companyId, tripDocumentOccurrences.id],
      name: 'trip_occurrence_cases_company_occurrence_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check(
      'trip_occurrence_cases_status_check',
      sql`${table.status} in (${raw(inList(TRIP_OCCURRENCE_CASE_STATUSES))})`,
    ),
    check(
      'trip_occurrence_cases_policy_check',
      sql`${table.redeliveryPolicy} in ('allowed','blocked')`,
    ),
    check(
      'trip_occurrence_cases_redelivery_application_check',
      sql`${table.redeliveryApplication} is null or ${table.redeliveryApplication} in (${raw(inList(TRIP_OCCURRENCE_CASE_REDELIVERY_APPLICATIONS))})`,
    ),
    check(
      'trip_occurrence_cases_decision_check',
      sql`(${table.decisionKind} is null) = (${table.decidedAt} is null)`,
    ),
    check(
      'trip_occurrence_cases_decision_kind_check',
      sql`${table.decisionKind} is null or ${table.decisionKind} in (${raw(inList(TRIP_OCCURRENCE_CASE_DECISION_KINDS))})`,
    ),
    /** `decided`/`closed` sem `decision_kind` é tratativa fechada sem motivo registrado. */
    check(
      'trip_occurrence_cases_decided_status_check',
      sql`${table.status} not in ('decided','closed') or ${table.decisionKind} is not null`,
    ),
    /** O inverso: decisão gravada exige que o status já reflita isso. */
    check(
      'trip_occurrence_cases_decision_status_check',
      sql`${table.decisionKind} is null or ${table.status} in ('decided','closed')`,
    ),
    check(
      'trip_occurrence_cases_decided_by_check',
      sql`(${table.decidedAt} is null) = (${table.decidedByUserId} is null)`,
    ),
    check(
      'trip_occurrence_cases_decision_note_check',
      sql`${table.decisionKind} <> 'other' or length(btrim(${table.decisionNote})) > 0`,
    ),
    check(
      'trip_occurrence_cases_resolved_check',
      sql`(${table.status} in ('closed','returned_to_warehouse','cancelled')) = (${table.resolvedAt} is not null)`,
    ),
    /**
     * O feed lê por empresa e estado; nenhuma consulta da spec pagina por `updated_at` — o cursor do
     * feed de ocorrências é `(created_at, id)` da própria ocorrência (correção do `architect`, que
     * derrubou o índice original com `updated_at desc`).
     */
    index('trip_occurrence_cases_company_status_idx').on(table.companyId, table.status),
  ],
)

/**
 * Spec 164 T1: histórico append-only da tratativa — escritor único
 * (`drizzle-occurrence-case.repository.ts`, T4), evento só quando o status muda de verdade. Molde de
 * `trip_status_events` (ADR-0068).
 *
 * ⚠️ **Leva FK direta para `companies`** — ao contrário de `delivery_charge_events`, que é a exceção
 * sem essa FK (histórico de cobrança herdado, fora do módulo `trip`). Todo módulo `trip` sempre tem a
 * FK para `companies`; esta tabela segue a regra do módulo, não a exceção do outro módulo.
 */
export const tripOccurrenceCaseEvents = pgTable(
  'trip_occurrence_case_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    /** Nulo é a abertura — a primeira linha da tratativa não tem "de onde veio". */
    fromStatus: text('from_status').$type<TripOccurrenceCaseStatus>(),
    toStatus: text('to_status').notNull().$type<TripOccurrenceCaseStatus>(),
    actorKind: text('actor_kind').notNull().$type<TripOccurrenceCaseActorKind>(),
    /**
     * Spec 164 T9 (correção do `architect`, Fase 3): obrigatória para **os dois** atores — a
     * decisão do contratante grava o `userId` da conta dele (RF14), e "só existe para ator
     * interno" (redação original) mentia sobre o que a RF14 pede. Coluna de auditoria com
     * comentário que mente é o pior modo de falha possível.
     */
    actorUserId: uuid('actor_user_id').notNull(),
    note: text().notNull().default(''),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('trip_occurrence_case_events_company_id_id_unique').on(table.companyId, table.id),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_occurrence_case_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.caseId],
      foreignColumns: [tripOccurrenceCases.companyId, tripOccurrenceCases.id],
      name: 'trip_occurrence_case_events_company_case_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check(
      'trip_occurrence_case_events_actor_kind_check',
      sql`${table.actorKind} in (${raw(inList(TRIP_OCCURRENCE_CASE_ACTOR_KINDS))})`,
    ),
    check(
      'trip_occurrence_case_events_from_status_check',
      sql`${table.fromStatus} is null or ${table.fromStatus} in (${raw(inList(TRIP_OCCURRENCE_CASE_STATUSES))})`,
    ),
    check(
      'trip_occurrence_case_events_to_status_check',
      sql`${table.toStatus} in (${raw(inList(TRIP_OCCURRENCE_CASE_STATUSES))})`,
    ),
    check(
      'trip_occurrence_case_events_transition_check',
      sql`${table.fromStatus} is null or ${table.fromStatus} <> ${table.toStatus}`,
    ),
    /** `closed`, `returned_to_warehouse` e `cancelled` são terminais — nenhum evento parte deles de novo. */
    check(
      'trip_occurrence_case_events_terminal_check',
      sql`${table.fromStatus} is null or ${table.fromStatus} not in ('closed','returned_to_warehouse','cancelled')`,
    ),
    /** Uma abertura por tratativa — uma segunda linha com `from_status` nulo é escritor duplicado. */
    uniqueIndex('trip_occurrence_case_events_opening_unique')
      .on(table.companyId, table.caseId)
      .where(sql`${table.fromStatus} is null`),
    check(
      'trip_occurrence_case_events_warehouse_note_check',
      sql`${table.toStatus} <> 'returned_to_warehouse' or length(btrim(${table.note})) > 0`,
    ),
    /** Decisão do usuário na T2: cancelar exige motivo — ocorrência aberta por engano se explica. */
    check(
      'trip_occurrence_case_events_cancel_note_check',
      sql`${table.toStatus} <> 'cancelled' or length(btrim(${table.note})) > 0`,
    ),
    /** A linha do tempo lê por tratativa, ordenada — sem este índice ela varre a tabela inteira. */
    index('trip_occurrence_case_events_company_case_occurred_at_idx').on(
      table.companyId,
      table.caseId,
      table.occurredAt,
      table.id,
    ),
  ],
)
