/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { storedObjects } from './storage.schema.js'
import { tripDocumentOccurrences } from './trip.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * CPF de onze dígitos ou CNPJ alfanumérico (IN RFB 2229/2024): letra só nas doze posições da base,
 * dígitos verificadores sempre numéricos. Mesma forma canônica do resto do produto — sem máscara e
 * em caixa alta.
 */
const TAX_ID_OR_CNPJ_PATTERN = '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$'
const IBGE_CITY_PATTERN = '^[0-9]{7}$'

export const DELIVERY_CLIENT_STATUSES = ['active', 'inactive'] as const
export type DeliveryClientStatus = (typeof DELIVERY_CLIENT_STATUSES)[number]

/**
 * ADR-0048 §1: o cadastro **nasce da nota**, com identidade e sem regra. `requires_scheduling`,
 * `delivery_fee_amount` e `default_service_time_minutes` ficam vazios até alguém preenchê-los —
 * e é essa distinção que deixa "ausência de janela" ser ausência, e não "janela não preenchida".
 *
 * ⚠️ `tax_id` é dado de pessoa quando é CPF: nunca em log (`security.md` §1), e a busca é por
 * igualdade exata — nunca `LIKE`, que permitiria varrer a base documento a documento.
 */
export const deliveryClients = pgTable(
  'delivery_clients',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: text('tax_id').notNull(),
    /** O nome visto na última nota. A criação automática atualiza este; nunca as regras. */
    displayName: text('display_name').notNull().default(''),
    requiresScheduling: boolean('requires_scheduling').notNull().default(false),
    /** Expectativa, não fato: alimenta o solver e a previsão. O que aconteceu vive em `delivery_charges`. */
    deliveryFeeAmount: numeric('delivery_fee_amount', { precision: 14, scale: 4 }),
    defaultServiceTimeMinutes: bigint('default_service_time_minutes', { mode: 'number' }),
    notes: text().notNull().default(''),
    status: text().$type<DeliveryClientStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'delivery_clients_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('delivery_clients_company_tax_id_unique').on(table.companyId, table.taxId),
    unique('delivery_clients_company_id_id_unique').on(table.companyId, table.id),
    check(
      'delivery_clients_status_check',
      sql`${table.status} in (${sql.raw(inList(DELIVERY_CLIENT_STATUSES))})`,
    ),
    check(
      'delivery_clients_tax_id_check',
      sql`${table.taxId} ~ ${sql.raw(`'${TAX_ID_OR_CNPJ_PATTERN}'`)}`,
    ),
    check(
      'delivery_clients_fee_check',
      sql`${table.deliveryFeeAmount} is null or ${table.deliveryFeeAmount} >= 0`,
    ),
    check(
      'delivery_clients_service_time_check',
      sql`${table.defaultServiceTimeMinutes} is null or ${table.defaultServiceTimeMinutes} > 0`,
    ),
  ],
)

export const CONTRACTOR_CLOSING_PERIODS = ['fortnightly', 'monthly'] as const
export type ContractorClosingPeriod = (typeof CONTRACTOR_CLOSING_PERIODS)[number]

/**
 * ADR-0048 §1: o **contratante** é o embarcador — quem descarrega a carga no barracão e contratou o
 * frete. Ele já está em toda nota (é o emitente), e por isso nasce sozinho pelo mesmo caminho.
 *
 * O que ele guarda é diferente do cliente de entrega: o cliente guarda hora e taxa; o contratante
 * guarda o **período de fechamento** e para quem o relatório vai.
 */
export const contractors = pgTable(
  'contractors',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: text('tax_id').notNull(),
    displayName: text('display_name').notNull().default(''),
    closingPeriod: text('closing_period')
      .$type<ContractorClosingPeriod>()
      .notNull()
      .default('monthly'),
    /** Para onde o relatório do lote vai. Vazio é lote que se exporta à mão. */
    reportEmail: text('report_email').notNull().default(''),
    notes: text().notNull().default(''),
    status: text().$type<DeliveryClientStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractors_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractors_company_tax_id_unique').on(table.companyId, table.taxId),
    unique('contractors_company_id_id_unique').on(table.companyId, table.id),
    check(
      'contractors_status_check',
      sql`${table.status} in (${sql.raw(inList(DELIVERY_CLIENT_STATUSES))})`,
    ),
    check(
      'contractors_tax_id_check',
      sql`${table.taxId} ~ ${sql.raw(`'${TAX_ID_OR_CNPJ_PATTERN}'`)}`,
    ),
    check(
      'contractors_closing_period_check',
      sql`${table.closingPeriod} in (${sql.raw(inList(CONTRACTOR_CLOSING_PERIODS))})`,
    ),
  ],
)

/**
 * Spec 060 D2: a janela é **lista**, não duas colunas — o cliente que recebe 8h–11h e 14h–16h tem o
 * almoço fechado no meio, e é esse buraco que duas colunas não representam.
 *
 * `weekday` é 0 (domingo) a 6 (sábado), a numeração de `EXTRACT(dow)` do Postgres — a mesma que a
 * consulta usa, para não haver conversão no meio do caminho.
 */
export const deliveryClientWindows = pgTable(
  'delivery_client_windows',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    deliveryClientId: uuid('delivery_client_id').notNull(),
    weekday: bigint({ mode: 'number' }).notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.deliveryClientId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.id],
      name: 'delivery_client_windows_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('delivery_client_windows_client_idx').on(table.companyId, table.deliveryClientId),
    check('delivery_client_windows_weekday_check', sql`${table.weekday} between 0 and 6`),
    /**
     * A janela que cruza a meia-noite (22h–02h) é gravada como **dois** intervalos, um em cada dia:
     * aceitar `closes_at < opens_at` faria toda consulta de "abre agora?" carregar a exceção.
     */
    check('delivery_client_windows_interval_check', sql`${table.opensAt} < ${table.closesAt}`),
  ],
)

export const DELIVERY_CLIENT_EXCEPTION_KINDS = ['closed', 'open'] as const
export type DeliveryClientExceptionKind = (typeof DELIVERY_CLIENT_EXCEPTION_KINDS)[number]

/**
 * Spec 060 D2/D2b: a data que foge da semana. `closed` fecha o dia inteiro (balanço, inventário);
 * `open` abre num horário próprio — e é ela que **vence o feriado do município** (ADR-0048 §3).
 */
export const deliveryClientExceptions = pgTable(
  'delivery_client_exceptions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    deliveryClientId: uuid('delivery_client_id').notNull(),
    exceptionOn: date('exception_on').notNull(),
    kind: text().$type<DeliveryClientExceptionKind>().notNull(),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    reason: text().notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.deliveryClientId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.id],
      name: 'delivery_client_exceptions_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('delivery_client_exceptions_client_idx').on(
      table.companyId,
      table.deliveryClientId,
      table.exceptionOn,
    ),
    check(
      'delivery_client_exceptions_kind_check',
      sql`${table.kind} in (${sql.raw(inList(DELIVERY_CLIENT_EXCEPTION_KINDS))})`,
    ),
    /** `open` sem horário é uma exceção que não diz nada; `closed` com horário é contradição. */
    check(
      'delivery_client_exceptions_hours_check',
      sql`(${table.kind} = 'closed' and ${table.opensAt} is null and ${table.closesAt} is null) or (${table.kind} = 'open' and ${table.opensAt} is not null and ${table.closesAt} is not null and ${table.opensAt} < ${table.closesAt})`,
    ),
  ],
)

/**
 * ADR-0048 §3: o feriado é **do município**. Quando a cidade fecha, fecham os quarenta clientes de
 * lá, e repetir a data em quarenta cadastros é o caminho mais curto para trinta e nove ficarem
 * desatualizados.
 *
 * Alimentado à mão: nenhuma fonte pública de feriado municipal é confiável o bastante para virar
 * dependência. Data sem cadastro é dia útil.
 */
export const municipalHolidays = pgTable(
  'municipal_holidays',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    cityIbgeCode: text('city_ibge_code').notNull(),
    holidayOn: date('holiday_on').notNull(),
    name: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'municipal_holidays_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('municipal_holidays_company_city_day_unique').on(
      table.companyId,
      table.cityIbgeCode,
      table.holidayOn,
    ),
    check(
      'municipal_holidays_city_check',
      sql`${table.cityIbgeCode} ~ ${sql.raw(`'${IBGE_CITY_PATTERN}'`)}`,
    ),
    check('municipal_holidays_name_check', sql`length(${table.name}) > 0`),
  ],
)

export const TRIP_STOP_SCHEDULE_STATUSES = ['pending', 'requested', 'confirmed', 'refused'] as const
export type TripStopScheduleStatus = (typeof TRIP_STOP_SCHEDULE_STATUSES)[number]

/**
 * Spec 060 D3: o agendamento é **pendência da parada**, e ela bloqueia o despacho. Nasce quando uma
 * nota de cliente `requires_scheduling` entra na viagem, e o portão do despacho recusa enquanto ela
 * estiver `pending` ou `refused` — com o mesmo `force` + motivo do despacho com nota pendente.
 *
 * O protocolo viaja até o motorista (057): ele chega na portaria e precisa dizer o número. Um
 * agendamento que o sistema conhece e o motorista não é um agendamento que não existe.
 */
export const tripStopSchedules = pgTable(
  'trip_stop_schedules',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    stopId: uuid('stop_id').notNull(),
    deliveryClientId: uuid('delivery_client_id'),
    status: text().$type<TripStopScheduleStatus>().notNull().default('pending'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    protocol: text().notNull().default(''),
    /**
     * A viagem replanejada para outro dia **não** segue calada com a data velha: o agendamento é
     * marcado como divergente e volta a ser pendência. Quem confirma de novo é gente.
     */
    divergedAt: timestamp('diverged_at', { withTimezone: true }),
    notes: text().notNull().default(''),
    requestedByUserId: uuid('requested_by_user_id'),
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_stop_schedules_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** Um agendamento por parada: dois é a portaria recebendo dois protocolos para a mesma carga. */
    unique('trip_stop_schedules_company_stop_unique').on(table.companyId, table.stopId),
    index('trip_stop_schedules_trip_idx').on(table.companyId, table.tripId),
    check(
      'trip_stop_schedules_status_check',
      sql`${table.status} in (${sql.raw(inList(TRIP_STOP_SCHEDULE_STATUSES))})`,
    ),
    /** Confirmado sem hora marcada é um agendamento que ninguém consegue cumprir. */
    check(
      'trip_stop_schedules_confirmed_check',
      sql`${table.status} <> 'confirmed' or ${table.scheduledAt} is not null`,
    ),
  ],
)

/**
 * Spec 060 D4: os tipos que a operação real cobra. Lista fechada de propósito — texto livre aqui
 * viraria "descarga", "Descarga" e "taxa descarga" no mesmo relatório, e o contratante conferindo
 * três linhas que são a mesma coisa.
 */
export const DELIVERY_CHARGE_TYPES = [
  'unloading',
  'scheduling',
  'platform',
  'parking',
  'other',
  /**
   * Spec 164 T16 (RF25/RF26): a cobrança de mercadoria devolvida que a tratativa de ocorrência gera.
   * ⚠️ **Nunca lançável à mão** — ver `MANUAL_DELIVERY_CHARGE_TYPES` abaixo. Ela só nasce pela ponte
   * `occurrence-charge.policy.ts` (T17), amarrada a `origin: 'occurrence'` e `occurrence_id`
   * preenchido pelo CHECK do banco.
   */
  'returned_goods',
] as const
export type DeliveryChargeType = (typeof DELIVERY_CHARGE_TYPES)[number]

/**
 * Spec 164 T16 (validação 🧠 da Fase 5, achado 1): os tipos que uma pessoa pode lançar pelas rotas
 * `POST .../charges` e `PUT .../charge-rules`. `returned_goods` fica de fora das duas — soltá-lo
 * lançaria mercadoria devolvida com valor livre, fora de qualquer tratativa, e a regra recorrente o
 * proporia de novo todo mês, o que não faz sentido para um prejuízo que não se repete.
 */
export const MANUAL_DELIVERY_CHARGE_TYPES = DELIVERY_CHARGE_TYPES.filter(
  (type) => type !== 'returned_goods',
)
export type ManualDeliveryChargeType = (typeof MANUAL_DELIVERY_CHARGE_TYPES)[number]

/**
 * ADR-0048 §5: o ciclo do repasse. `suggested` é alcançável **só** pelo que nasceu automático, e
 * `submitted` é inalcançável sem passar por `recorded` — quem guarda isso é a máquina em
 * `delivery-charge-state.policy.ts`, e o CHECK aqui só fecha o vocabulário.
 */
export const DELIVERY_CHARGE_STATUSES = [
  'suggested',
  /**
   * A sugestão que gente olhou e recusou. Ela **não some**: guardar o descarte com motivo é o que
   * responde "por que a taxa daquele dia não foi cobrada?" seis meses depois — e é também o que
   * mostra que a regra recorrente está propondo o que não deveria.
   */
  'dismissed',
  'recorded',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
] as const
export type DeliveryChargeStatus = (typeof DELIVERY_CHARGE_STATUSES)[number]

export const DELIVERY_CHARGE_ORIGINS = ['manual', 'recurring', 'occurrence'] as const
export type DeliveryChargeOrigin = (typeof DELIVERY_CHARGE_ORIGINS)[number]

/**
 * ADR-0048 §4: o **fato**, com o valor que o cliente cobrou de verdade. A expectativa mora em
 * `delivery_clients.delivery_fee_amount`, e é a divergência entre as duas que interessa a quem paga.
 *
 * `contractor_id` é anulável de propósito: taxa de nota cujo emitente ainda não tem cadastro existe,
 * aparece na lista de "sem contratante" e **nunca** é descartada nem atribuída por palpite.
 */
export const deliveryCharges = pgTable(
  'delivery_charges',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    deliveryClientId: uuid('delivery_client_id').notNull(),
    contractorId: uuid('contractor_id'),
    tripId: uuid('trip_id'),
    tripDocumentId: uuid('trip_document_id'),
    /**
     * Spec 164 T16/T17: preenchida só quando `charge_type = 'returned_goods'` — é o que liga a
     * cobrança ao acerto e à foto da ocorrência. Nulável: nenhuma linha existente muda com a
     * migration aditiva.
     */
    occurrenceId: uuid('occurrence_id'),
    batchId: uuid('batch_id'),
    chargeType: text('charge_type').$type<DeliveryChargeType>().notNull(),
    amount: numeric({ precision: 14, scale: 4 }).notNull(),
    /** A data em que a taxa aconteceu — aceita retroativa: o comprovante volta no fim do dia. */
    chargedOn: date('charged_on').notNull(),
    status: text().$type<DeliveryChargeStatus>().notNull(),
    origin: text().$type<DeliveryChargeOrigin>().notNull(),
    proofObjectId: uuid('proof_object_id'),
    notes: text().notNull().default(''),
    rejectionReason: text('rejection_reason').notNull().default(''),
    recordedByUserId: uuid('recorded_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'delivery_charges_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.deliveryClientId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.id],
      name: 'delivery_charges_company_client_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'delivery_charges_company_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [tripDocumentOccurrences.companyId, tripDocumentOccurrences.id],
      name: 'delivery_charges_company_occurrence_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('delivery_charges_company_id_id_unique').on(table.companyId, table.id),
    index('delivery_charges_status_idx').on(table.companyId, table.status),
    index('delivery_charges_company_occurrence_idx')
      .on(table.companyId, table.occurrenceId)
      .where(sql`${table.occurrenceId} is not null`),
    /**
     * Spec 164 T16 (achado 3 da revisão): sem esta trava, duas requisições concorrentes gravando o
     * mesmo acerto cobrariam o mesmo prejuízo duas vezes — o unique de `suggested` não alcança a
     * cobrança de ocorrência, que nasce `recorded`.
     */
    uniqueIndex('delivery_charges_occurrence_unique')
      .on(table.companyId, table.occurrenceId)
      .where(sql`${table.occurrenceId} is not null`),
    /**
     * Spec 164 T16 (achado 7 da revisão): serve o relatório mensal novo (RF28) **e** conserta o
     * fechamento de lote atual, que hoje varre a tabela inteira por contratante e período.
     */
    index('delivery_charges_contractor_period_idx').on(
      table.companyId,
      table.contractorId,
      table.chargedOn,
    ),
    /**
     * Spec 060 D4c: **uma sugestão por nota e tipo.** A regra recorrente e a ocorrência do motorista
     * propõem a mesma taxa pelo mesmo motivo, e sem esta trava a entrega com recibo fotografado
     * geraria duas linhas para o operador conferir — e uma delas seria cobrada duas vezes.
     *
     * Parcial de propósito: o que já foi conferido pode repetir (a mesma nota pode ter duas taxas de
     * descarga em dias diferentes, e as duas são fato).
     */
    uniqueIndex('delivery_charges_suggested_unique')
      .on(table.companyId, table.tripDocumentId, table.chargeType)
      .where(sql`${table.status} = 'suggested'`),
    index('delivery_charges_batch_idx').on(table.companyId, table.batchId),
    index('delivery_charges_client_idx').on(table.companyId, table.deliveryClientId),
    check(
      'delivery_charges_type_check',
      sql`${table.chargeType} in (${sql.raw(inList(DELIVERY_CHARGE_TYPES))})`,
    ),
    check(
      'delivery_charges_status_check',
      sql`${table.status} in (${sql.raw(inList(DELIVERY_CHARGE_STATUSES))})`,
    ),
    check(
      'delivery_charges_origin_check',
      sql`${table.origin} in (${sql.raw(inList(DELIVERY_CHARGE_ORIGINS))})`,
    ),
    /**
     * Taxa é dinheiro cobrado de outra empresa: zero é lançamento que ninguém precisava fazer.
     *
     * **A sugestão é a exceção**, e ela é deliberada: a ocorrência do motorista diz que cobraram —
     * ele não sabe quanto, e o recibo está na foto. Zero aqui significa "o escritório preenche", e a
     * confirmação recusa sem valor. Sem esta brecha, o aviso do campo morreria por não ter número.
     */
    check(
      'delivery_charges_amount_check',
      sql`${table.amount} > 0 or ${table.status} = 'suggested'`,
    ),
    /**
     * Só o que nasceu automático pode estar `suggested`. Lançamento manual entra direto em
     * `recorded`, e o banco recusa a combinação que a máquina de estados não produz.
     */
    check(
      'delivery_charges_suggested_origin_check',
      sql`${table.status} <> 'suggested' or ${table.origin} <> 'manual'`,
    ),
    /**
     * Toda sugestão **carrega a nota**, e isso é o que faz a dedupe funcionar: o índice parcial de
     * uma sugestão por nota e tipo é `(company_id, trip_document_id, charge_type)`, e no Postgres
     * dois `null` não colidem — sem este CHECK, sugestão sem nota escaparia da trava em silêncio.
     *
     * Lançamento manual sem nota continua permitido: ele já passou por gente.
     */
    check(
      'delivery_charges_suggested_document_check',
      sql`${table.status} <> 'suggested' or ${table.tripDocumentId} is not null`,
    ),
    /** Sugestão em lote seria dinheiro cobrado sem ninguém conferir: o lote só aceita conferido. */
    check(
      'delivery_charges_batch_status_check',
      sql`${table.batchId} is null or ${table.status} in ('submitted', 'approved', 'rejected', 'reimbursed')`,
    ),
    /**
     * Spec 164 T16 (achado 1 da revisão): `returned_goods` só existe amarrado à ocorrência que a
     * gerou — o discriminador da cobrança de ocorrência é `charge_type` + `occurrence_id`, **nunca**
     * `origin` (`origin: 'occurrence'` já é da ocorrência de parada, spec 060, fora de escopo aqui).
     */
    check(
      'delivery_charges_returned_goods_origin_check',
      sql`${table.chargeType} <> 'returned_goods' or (${table.origin} = 'occurrence' and ${table.occurrenceId} is not null)`,
    ),
    /** O simétrico: `occurrence_id` preenchido só faz sentido para a cobrança de mercadoria devolvida. */
    check(
      'delivery_charges_occurrence_type_check',
      sql`${table.occurrenceId} is null or ${table.chargeType} = 'returned_goods'`,
    ),
  ],
)

/**
 * Spec 060 D4b: a taxa que se repete vira **regra**, e a regra propõe sozinha. Não guarda lançamento
 * repetido: guarda cliente + tipo + valor esperado, e cada entrega concluída naquele cliente gera uma
 * sugestão já preenchida.
 */
export const deliveryClientChargeRules = pgTable(
  'delivery_client_charge_rules',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    deliveryClientId: uuid('delivery_client_id').notNull(),
    chargeType: text('charge_type').$type<DeliveryChargeType>().notNull(),
    expectedAmount: numeric('expected_amount', { precision: 14, scale: 4 }).notNull(),
    active: boolean().notNull().default(true),
    activatedByUserId: uuid('activated_by_user_id'),
    deactivatedByUserId: uuid('deactivated_by_user_id'),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.deliveryClientId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.id],
      name: 'delivery_client_charge_rules_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    /** Uma regra viva por tipo e por cliente: duas gerariam duas sugestões da mesma taxa. */
    uniqueIndex('delivery_client_charge_rules_active_unique')
      .on(table.companyId, table.deliveryClientId, table.chargeType)
      .where(sql`${table.active}`),
    check(
      'delivery_client_charge_rules_type_check',
      sql`${table.chargeType} in (${sql.raw(inList(DELIVERY_CHARGE_TYPES))})`,
    ),
    check('delivery_client_charge_rules_amount_check', sql`${table.expectedAmount} > 0`),
    /** Desligada sem quem e quando é histórico que não responde "quem desligou isso?". */
    check(
      'delivery_client_charge_rules_deactivation_check',
      sql`${table.active} or (${table.deactivatedAt} is not null and ${table.deactivatedByUserId} is not null)`,
    ),
  ],
)

export const EXTRA_CHARGE_BATCH_STATUSES = ['closed', 'submitted', 'decided'] as const
export type ExtraChargeBatchStatus = (typeof EXTRA_CHARGE_BATCH_STATUSES)[number]

/**
 * ADR-0048 §7: o lote é **do contratante e do período**, nunca da viagem — o embarcador descarrega
 * várias cargas e a transportadora reagrupa em rotas próprias, então uma viagem mistura contratantes.
 *
 * `access_token` é a credencial da página pública da landing. Ele é opaco e **gira** quando o lote é
 * fechado de novo: link antigo deixa de abrir. Guardado em claro de propósito — o operador precisa
 * reenviá-lo —, e o que limita o estrago é o escopo: um lote, de um contratante, de um período.
 */
export const extraChargeBatches = pgTable(
  'extra_charge_batches',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text().$type<ExtraChargeBatchStatus>().notNull().default('closed'),
    accessToken: text('access_token').notNull(),
    tokenRotatedAt: timestamp('token_rotated_at', { withTimezone: true }).notNull().defaultNow(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 4 }).notNull().default('0'),
    closedByUserId: uuid('closed_by_user_id').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /**
     * Spec 164 T20: o demonstrativo de ressarcimento em PDF, artefato **imutável** gerado no
     * fechamento. Nulável porque todo lote fechado antes desta migration não tem um, e porque a
     * geração falhando não pode derrubar o fechamento do dinheiro.
     */
    statementObjectId: uuid('statement_object_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'extra_charge_batches_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'extra_charge_batches_company_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('extra_charge_batches_company_id_id_unique').on(table.companyId, table.id),
    /** O token é a credencial: colisão entre empresas abriria o lote de outra transportadora. */
    unique('extra_charge_batches_access_token_unique').on(table.accessToken),
    foreignKey({
      columns: [table.companyId, table.statementObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'extra_charge_batches_company_statement_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('extra_charge_batches_contractor_idx').on(table.companyId, table.contractorId),
    /** FK parcial: só o lote que já tem demonstrativo, no molde do índice da miniatura (spec 161). */
    index('extra_charge_batches_company_statement_object_idx')
      .on(table.companyId, table.statementObjectId)
      .where(sql`${table.statementObjectId} is not null`),
    check(
      'extra_charge_batches_status_check',
      sql`${table.status} in (${sql.raw(inList(EXTRA_CHARGE_BATCH_STATUSES))})`,
    ),
    check('extra_charge_batches_period_check', sql`${table.periodStart} <= ${table.periodEnd}`),
    check('extra_charge_batches_total_check', sql`${table.totalAmount} >= 0`),
    /** Token curto é token adivinhável, e esta é a única porta anônima que serve dinheiro. */
    check('extra_charge_batches_token_check', sql`length(${table.accessToken}) >= 32`),
  ],
)

export const DELIVERY_CHARGE_EVENT_NAMES = [
  'suggested',
  'recorded',
  'dismissed',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
] as const
export type DeliveryChargeEventName = (typeof DELIVERY_CHARGE_EVENT_NAMES)[number]

/**
 * Trilha append-only do lançamento (`security.md` §10). É dinheiro entre duas empresas, e a pergunta
 * "quem aprovou isso?" vai ser feita — inclusive quando a resposta é "quem estava com o link do
 * lote", que é o que `decided_by_token` guarda (ADR-0048 §7), ou "quem decidiu pela mensagem de
 * e-mail" (spec 143 / RF6), que é o que `decided_by_message_id` guarda.
 *
 * ⚠️ **A FK de `decided_by_message_id` para `contractor_mail_messages` vive só na migration SQL,
 * não neste objeto Drizzle.** `contractor-mail.schema.ts` já importa `contractors` deste arquivo
 * para as FKs de `contractor_contacts`/`contractor_mail_threads`; importar `contractorMailMessages`
 * de volta aqui fecharia um ciclo de módulos ES (nenhum par de arquivos de schema neste repositório
 * importa um do outro), e o `pgTable` do lado que carregasse por último leria a tabela ainda não
 * inicializada. A restrição existe no banco (composta, com `company_id`, igual às demais) — só não
 * está espelhada no TypeScript. Decisão registrada em `evidence.md` da T003.
 *
 * ⚠️ **O CHECK de autoria não existia antes desta migration** — o `plan.md` presumia um CHECK
 * anterior de "ator xor token" para "refazer"; a tabela real nunca teve essa restrição no banco (só
 * `delivery_charge_events_name_check`). `suggest-delivery-charges.use-case.ts:88` grava o evento
 * `suggested` com `actorUserId: null` e sem `decidedByToken` — nem ator, nem token, nem mensagem —
 * porque é a sugestão automática do sistema, não uma decisão de alguém. Por isso o CHECK abaixo
 * exige exatamente um dos três **exceto** em `suggested`, e não "sempre exatamente um" como o texto
 * do RF6 sugere ao pé da letra.
 */
export const deliveryChargeEvents = pgTable(
  'delivery_charge_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    chargeId: uuid('charge_id').notNull(),
    eventName: text('event_name').$type<DeliveryChargeEventName>().notNull(),
    actorUserId: uuid('actor_user_id'),
    /** Preenchido quando quem decidiu foi a página pública: não se inventa `userId` para forasteiro. */
    decidedByToken: text('decided_by_token'),
    /** Preenchido quando quem decidiu foi uma resposta de e-mail (spec 143, RF6). Sem FK aqui — ver
     * o comentário da tabela. */
    decidedByMessageId: uuid('decided_by_message_id'),
    payload: jsonb().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.chargeId],
      foreignColumns: [deliveryCharges.companyId, deliveryCharges.id],
      name: 'delivery_charge_events_charge_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('delivery_charge_events_charge_idx').on(table.companyId, table.chargeId),
    check(
      'delivery_charge_events_name_check',
      sql`${table.eventName} in (${sql.raw(inList(DELIVERY_CHARGE_EVENT_NAMES))})`,
    ),
    check(
      'delivery_charge_events_authorship_check',
      sql`${table.eventName} = 'suggested' or (
        (case when ${table.actorUserId} is not null then 1 else 0 end) +
        (case when ${table.decidedByToken} is not null then 1 else 0 end) +
        (case when ${table.decidedByMessageId} is not null then 1 else 0 end)
      ) = 1`,
    ),
  ],
)
