/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { cteFiscalDocuments } from './cte-issuance.schema.js'
import { fiscalSequenceReservations } from './fiscal-sequence.schema.js'
import { fleetDrivers, fleetVehicles } from './fleet.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { storedObjects } from './storage.schema.js'

export const MDFE_MANIFEST_STATUSES = [
  'draft',
  'issuing',
  'authorized',
  'rejected',
  'closed',
  'cancelled',
] as const
export type MdfeManifestStatus = (typeof MDFE_MANIFEST_STATUSES)[number]

/** tpEmit — 1 prestador de serviço, 2 carga própria, 3 prestador com CT-e globalizado. */
export const MDFE_EMITTER_TYPES = ['1', '2', '3'] as const
export type MdfeEmitterType = (typeof MDFE_EMITTER_TYPES)[number]

/** tpTransp — 1 ETC, 2 TAC, 3 CTC. Vazio quando o emitente não é transportador contratado. */
export const MDFE_TRANSPORTER_TYPES = ['1', '2', '3'] as const
export type MdfeTransporterType = (typeof MDFE_TRANSPORTER_TYPES)[number]

/** tpCarga — 01 granel sólido até 12 granel pressurizada. */
export const MDFE_CARGO_TYPES = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
] as const
export type MdfeCargoType = (typeof MDFE_CARGO_TYPES)[number]

/** cUnid — 01 KG, 02 tonelada. */
export const MDFE_CARGO_UNITS = ['01', '02'] as const
export type MdfeCargoUnit = (typeof MDFE_CARGO_UNITS)[number]

/** respSeg — 1 emitente do MDF-e, 2 contratante do serviço de transporte. */
export const MDFE_INSURANCE_RESPONSIBILITIES = ['1', '2'] as const
export type MdfeInsuranceResponsibility = (typeof MDFE_INSURANCE_RESPONSIBILITIES)[number]

export const MDFE_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type MdfeFiscalEnvironment = (typeof MDFE_FISCAL_ENVIRONMENTS)[number]

export const MDFE_ATTEMPT_KINDS = ['issue', 'close', 'cancel'] as const
export type MdfeAttemptKind = (typeof MDFE_ATTEMPT_KINDS)[number]

export const MDFE_ISSUANCE_STATUSES = [
  'pending',
  'in_flight',
  'authorized',
  'rejected',
  'retry_scheduled',
  'failed',
  'reconciliation_required',
  'closed',
  'cancelled',
] as const
export type MdfeIssuanceStatus = (typeof MDFE_ISSUANCE_STATUSES)[number]

export const MDFE_DOCUMENT_STATUSES = ['authorized', 'closed', 'cancelled'] as const
export type MdfeDocumentStatus = (typeof MDFE_DOCUMENT_STATUSES)[number]

export const MDFE_ISSUANCE_EVENTS = [
  'issue_requested',
  'close_requested',
  'cancel_requested',
  'in_flight',
  'authorized',
  'rejected',
  'failed',
  'retry_scheduled',
  'reconciliation_required',
  'closed',
  'cancelled',
] as const
export type MdfeIssuanceEvent = (typeof MDFE_ISSUANCE_EVENTS)[number]

export const MDFE_ISSUANCE_OUTBOX_EVENT_TYPES = [
  'transportada.mdfe.manifest.issue.requested',
  'transportada.mdfe.manifest.close.requested',
  'transportada.mdfe.manifest.cancel.requested',
] as const
export type MdfeIssuanceOutboxEventType = (typeof MDFE_ISSUANCE_OUTBOX_EVENT_TYPES)[number]

export const MDFE_ISSUANCE_OUTBOX_STATUSES = ['requested', 'retry_scheduled'] as const
export type MdfeIssuanceOutboxStatus = (typeof MDFE_ISSUANCE_OUTBOX_STATUSES)[number]

const STATE_PATTERN = '^[A-Z]{2}$'
const IBGE_CITY_PATTERN = '^[0-9]{7}$'
const ACCESS_KEY_PATTERN = '^[0-9]{44}$'
const SHA256_PATTERN = '^[0-9a-f]{64}$'
const RNTRC_PATTERN = '^[0-9]{8}$'
const NCM_PATTERN = '^[0-9]{8}$'
const TAX_ID_PATTERN = '^[0-9]{11}$'
const TAX_ID_OR_CNPJ_PATTERN = '^[0-9]{11}$|^[0-9]{14}$'
const POSTAL_CODE_PATTERN = '^[0-9]{8}$'

/** xNome de município cabe em 60 caracteres no layout 3.00. */
const CITY_NAME_MAX_LENGTH = 60

/** Condutores por manifesto: mínimo 1, máximo 10. */
const MAX_DRIVERS_PER_MANIFEST = 10

/** Municípios de carregamento: mínimo 1, máximo 50. */
export const MAX_LOADING_CITIES_PER_MANIFEST = 50

/** Justificativa de cancelamento exigida pela SEFAZ. */
const MIN_CANCELLATION_JUSTIFICATION_LENGTH = 15

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)

export const mdfeManifests = pgTable(
  'mdfe_manifests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    status: text().$type<MdfeManifestStatus>().notNull().default('draft'),
    fiscalEnvironment: text('fiscal_environment').$type<MdfeFiscalEnvironment>().notNull(),
    emitterType: text('emitter_type').$type<MdfeEmitterType>().notNull().default('1'),
    transporterType: text('transporter_type')
      .$type<MdfeTransporterType | ''>()
      .notNull()
      .default(''),
    originState: text('origin_state').notNull(),
    destinationState: text('destination_state').notNull(),
    cargoType: text('cargo_type').$type<MdfeCargoType | ''>().notNull().default(''),
    cargoProduct: text('cargo_product').notNull().default(''),
    cargoProductNcm: text('cargo_product_ncm').notNull().default(''),
    cargoUnit: text('cargo_unit').$type<MdfeCargoUnit>().notNull().default('01'),
    cteCount: bigint('cte_count', { mode: 'bigint' }).notNull().default(0n),
    cargoValue: numeric('cargo_value', { precision: 15, scale: 2 }).notNull().default('0'),
    cargoWeight: numeric('cargo_weight', { precision: 15, scale: 4 }).notNull().default('0'),
    rntrc: text().notNull().default(''),
    contractorTaxId: text('contractor_tax_id').notNull().default(''),
    contractorName: text('contractor_name').notNull().default(''),
    freightValue: numeric('freight_value', { precision: 15, scale: 2 }).notNull().default('0'),
    loadingPostalCode: text('loading_postal_code').notNull().default(''),
    dischargePostalCode: text('discharge_postal_code').notNull().default(''),
    insuranceEndorsement: text('insurance_endorsement').notNull().default(''),
    fiscalSeries: text('fiscal_series').notNull().default(''),
    fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }),
    tripStartedAt: timestamp('trip_started_at', { withTimezone: true }),
    additionalInformation: text('additional_information').notNull().default(''),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_manifests_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'mdfe_manifests_company_vehicle_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_manifests_company_id_id_unique').on(table.companyId, table.id),
    uniqueIndex('mdfe_manifests_company_environment_series_number_unique')
      .on(table.companyId, table.fiscalEnvironment, table.fiscalSeries, table.fiscalNumber)
      .where(sql`${table.fiscalNumber} is not null`),
    index('mdfe_manifests_company_status_created_at_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    check(
      'mdfe_manifests_status_check',
      sql`${table.status} in (${raw(inList(MDFE_MANIFEST_STATUSES))})`,
    ),
    check(
      'mdfe_manifests_environment_check',
      sql`${table.fiscalEnvironment} in (${raw(inList(MDFE_FISCAL_ENVIRONMENTS))})`,
    ),
    check(
      'mdfe_manifests_emitter_type_check',
      sql`${table.emitterType} in (${raw(inList(MDFE_EMITTER_TYPES))})`,
    ),
    check(
      'mdfe_manifests_transporter_type_check',
      sql`length(${table.transporterType}) = 0 or ${table.transporterType} in (${raw(inList(MDFE_TRANSPORTER_TYPES))})`,
    ),
    check(
      'mdfe_manifests_state_check',
      sql`${table.originState} ~ ${raw(`'${STATE_PATTERN}'`)} and ${table.destinationState} ~ ${raw(`'${STATE_PATTERN}'`)}`,
    ),
    check(
      'mdfe_manifests_cargo_type_check',
      sql`length(${table.cargoType}) = 0 or ${table.cargoType} in (${raw(inList(MDFE_CARGO_TYPES))})`,
    ),
    check(
      'mdfe_manifests_cargo_unit_check',
      sql`${table.cargoUnit} in (${raw(inList(MDFE_CARGO_UNITS))})`,
    ),
    check(
      'mdfe_manifests_cargo_product_ncm_check',
      sql`length(${table.cargoProductNcm}) = 0 or ${table.cargoProductNcm} ~ ${raw(`'${NCM_PATTERN}'`)}`,
    ),
    check(
      'mdfe_manifests_rntrc_check',
      sql`length(${table.rntrc}) = 0 or ${table.rntrc} ~ ${raw(`'${RNTRC_PATTERN}'`)}`,
    ),
    check(
      'mdfe_manifests_totals_check',
      sql`${table.cteCount} >= 0 and ${table.cargoValue} >= 0 and ${table.cargoWeight} >= 0`,
    ),
    check('mdfe_manifests_freight_value_check', sql`${table.freightValue} >= 0`),
    check(
      'mdfe_manifests_contractor_tax_id_check',
      sql`length(${table.contractorTaxId}) = 0 or ${table.contractorTaxId} ~ ${raw(`'${TAX_ID_OR_CNPJ_PATTERN}'`)}`,
    ),
    check(
      'mdfe_manifests_postal_code_check',
      sql`(length(${table.loadingPostalCode}) = 0 or ${table.loadingPostalCode} ~ ${raw(`'${POSTAL_CODE_PATTERN}'`)}) and (length(${table.dischargePostalCode}) = 0 or ${table.dischargePostalCode} ~ ${raw(`'${POSTAL_CODE_PATTERN}'`)})`,
    ),
    check(
      'mdfe_manifests_fiscal_number_check',
      sql`${table.fiscalNumber} is null or ${table.fiscalNumber} > 0`,
    ),
    // Sem série e número gravados não há como encerrar nem cancelar o manifesto depois
    check(
      'mdfe_manifests_issued_state_check',
      sql`${table.status} not in ('authorized', 'closed', 'cancelled') or (${table.fiscalNumber} is not null and length(${table.fiscalSeries}) > 0)`,
    ),
    check('mdfe_manifests_version_check', sql`${table.version} > 0`),
  ],
)

export const mdfeManifestDrivers = pgTable(
  'mdfe_manifest_drivers',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
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
      name: 'mdfe_manifest_drivers_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_manifest_drivers_company_manifest_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'mdfe_manifest_drivers_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_manifest_drivers_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_manifest_drivers_company_manifest_driver_unique').on(
      table.companyId,
      table.manifestId,
      table.driverId,
    ),
    unique('mdfe_manifest_drivers_company_manifest_position_unique').on(
      table.companyId,
      table.manifestId,
      table.position,
    ),
    check(
      'mdfe_manifest_drivers_position_check',
      sql`${table.position} between 1 and ${raw(String(MAX_DRIVERS_PER_MANIFEST))}`,
    ),
    check(
      'mdfe_manifest_drivers_tax_id_check',
      sql`${table.driverTaxId} ~ ${raw(`'${TAX_ID_PATTERN}'`)}`,
    ),
    check('mdfe_manifest_drivers_name_check', sql`length(${table.driverName}) > 0`),
  ],
)

export const mdfeManifestItems = pgTable(
  'mdfe_manifest_items',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    cteFiscalDocumentId: uuid('cte_fiscal_document_id').notNull(),
    accessKey: text('access_key').notNull(),
    dischargeCityCode: text('discharge_city_code').notNull(),
    dischargeCityName: text('discharge_city_name').notNull(),
    cargoValue: numeric('cargo_value', { precision: 15, scale: 2 }).notNull().default('0'),
    cargoWeight: numeric('cargo_weight', { precision: 15, scale: 4 }).notNull().default('0'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_manifest_items_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_manifest_items_company_manifest_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.cteFiscalDocumentId],
      foreignColumns: [cteFiscalDocuments.companyId, cteFiscalDocuments.id],
      name: 'mdfe_manifest_items_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_manifest_items_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_manifest_items_company_manifest_document_unique').on(
      table.companyId,
      table.manifestId,
      table.cteFiscalDocumentId,
    ),
    // Um CT-e só pode estar em um manifesto vivo; cancelar o manifesto libera a linha
    uniqueIndex('mdfe_manifest_items_live_document_unique')
      .on(table.companyId, table.cteFiscalDocumentId)
      .where(sql`${table.releasedAt} is null`),
    index('mdfe_manifest_items_company_manifest_city_idx').on(
      table.companyId,
      table.manifestId,
      table.dischargeCityCode,
    ),
    check(
      'mdfe_manifest_items_access_key_check',
      sql`${table.accessKey} ~ ${raw(`'${ACCESS_KEY_PATTERN}'`)}`,
    ),
    check(
      'mdfe_manifest_items_discharge_city_code_check',
      sql`${table.dischargeCityCode} ~ ${raw(`'${IBGE_CITY_PATTERN}'`)}`,
    ),
    check(
      'mdfe_manifest_items_discharge_city_name_check',
      sql`length(${table.dischargeCityName}) > 0 and length(${table.dischargeCityName}) <= ${raw(String(CITY_NAME_MAX_LENGTH))}`,
    ),
    check(
      'mdfe_manifest_items_totals_check',
      sql`${table.cargoValue} >= 0 and ${table.cargoWeight} >= 0`,
    ),
  ],
)

export const mdfeManifestLoadingCities = pgTable(
  'mdfe_manifest_loading_cities',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    cityCode: text('city_code').notNull(),
    cityName: text('city_name').notNull(),
    position: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_manifest_loading_cities_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_manifest_loading_cities_company_manifest_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('mdfe_manifest_loading_cities_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_manifest_loading_cities_company_manifest_city_unique').on(
      table.companyId,
      table.manifestId,
      table.cityCode,
    ),
    unique('mdfe_manifest_loading_cities_company_manifest_position_unique').on(
      table.companyId,
      table.manifestId,
      table.position,
    ),
    check(
      'mdfe_manifest_loading_cities_city_code_check',
      sql`${table.cityCode} ~ ${raw(`'${IBGE_CITY_PATTERN}'`)}`,
    ),
    check(
      'mdfe_manifest_loading_cities_city_name_check',
      sql`length(${table.cityName}) > 0 and length(${table.cityName}) <= ${raw(String(CITY_NAME_MAX_LENGTH))}`,
    ),
    check(
      'mdfe_manifest_loading_cities_position_check',
      sql`${table.position} between 1 and ${raw(String(MAX_LOADING_CITIES_PER_MANIFEST))}`,
    ),
  ],
)

export const mdfeIssuanceAttempts = pgTable(
  'mdfe_issuance_attempts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    attemptKind: text('attempt_kind').$type<MdfeAttemptKind>().notNull(),
    attemptNumber: bigint('attempt_number', { mode: 'bigint' }).notNull(),
    status: text().$type<MdfeIssuanceStatus>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    idempotencyFingerprint: text('idempotency_fingerprint').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    fiscalEnvironment: text('fiscal_environment').$type<MdfeFiscalEnvironment>().notNull(),
    fiscalSeries: text('fiscal_series').notNull().default(''),
    fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }),
    reservationId: uuid('reservation_id'),
    lastErrorCode: text('last_error_code'),
    lastErrorCause: text('last_error_cause'),
    correlationId: text('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_issuance_attempts_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_issuance_attempts_company_manifest_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.reservationId],
      foreignColumns: [fiscalSequenceReservations.companyId, fiscalSequenceReservations.id],
      name: 'mdfe_issuance_attempts_company_reservation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_issuance_attempts_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_issuance_attempts_company_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    unique('mdfe_issuance_attempts_company_manifest_kind_fingerprint_unique').on(
      table.companyId,
      table.manifestId,
      table.attemptKind,
      table.requestFingerprint,
    ),
    index('mdfe_issuance_attempts_company_status_created_at_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    check(
      'mdfe_issuance_attempts_kind_check',
      sql`${table.attemptKind} in (${raw(inList(MDFE_ATTEMPT_KINDS))})`,
    ),
    check(
      'mdfe_issuance_attempts_status_check',
      sql`${table.status} in (${raw(inList(MDFE_ISSUANCE_STATUSES))})`,
    ),
    check(
      'mdfe_issuance_attempts_environment_check',
      sql`${table.fiscalEnvironment} in (${raw(inList(MDFE_FISCAL_ENVIRONMENTS))})`,
    ),
    check('mdfe_issuance_attempts_attempt_number_check', sql`${table.attemptNumber} > 0`),
    check('mdfe_issuance_attempts_idempotency_key_check', sql`length(${table.idempotencyKey}) > 0`),
    check(
      'mdfe_issuance_attempts_request_fingerprint_check',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
    // Encerrar e cancelar reaproveitam o número autorizado — só a emissão reserva um novo
    check(
      'mdfe_issuance_attempts_reservation_check',
      sql`${table.attemptKind} <> 'issue' or (${table.reservationId} is not null and ${table.fiscalNumber} is not null and length(${table.fiscalSeries}) > 0)`,
    ),
  ],
)

export const mdfeFiscalDocuments = pgTable(
  'mdfe_fiscal_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    accessKey: text('access_key').notNull(),
    authorizationProtocol: text('authorization_protocol').notNull(),
    fiscalEnvironment: text('fiscal_environment').$type<MdfeFiscalEnvironment>().notNull(),
    fiscalSeries: text('fiscal_series').notNull(),
    fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }).notNull(),
    status: text().$type<MdfeDocumentStatus>().notNull(),
    xmlObjectId: uuid('xml_object_id').notNull(),
    xmlSha256: text('xml_sha256').notNull(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    closureProtocol: text('closure_protocol'),
    closureState: text('closure_state'),
    closureCityCode: text('closure_city_code'),
    closureXmlObjectId: uuid('closure_xml_object_id'),
    closureXmlSha256: text('closure_xml_sha256'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancellationJustification: text('cancellation_justification'),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    cancellationProtocol: text('cancellation_protocol'),
    cancellationXmlObjectId: uuid('cancellation_xml_object_id'),
    cancellationXmlSha256: text('cancellation_xml_sha256'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_fiscal_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_fiscal_documents_company_manifest_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [mdfeIssuanceAttempts.companyId, mdfeIssuanceAttempts.id],
      name: 'mdfe_fiscal_documents_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.xmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'mdfe_fiscal_documents_company_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.closureXmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'mdfe_fiscal_documents_company_closure_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.cancellationXmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'mdfe_fiscal_documents_company_cancellation_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_fiscal_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_fiscal_documents_company_access_key_unique').on(table.companyId, table.accessKey),
    unique('mdfe_fiscal_documents_company_manifest_unique').on(table.companyId, table.manifestId),
    check(
      'mdfe_fiscal_documents_access_key_check',
      sql`${table.accessKey} ~ ${raw(`'${ACCESS_KEY_PATTERN}'`)}`,
    ),
    check(
      'mdfe_fiscal_documents_status_check',
      sql`${table.status} in (${raw(inList(MDFE_DOCUMENT_STATUSES))})`,
    ),
    check(
      'mdfe_fiscal_documents_environment_check',
      sql`${table.fiscalEnvironment} in (${raw(inList(MDFE_FISCAL_ENVIRONMENTS))})`,
    ),
    check(
      'mdfe_fiscal_documents_sha256_check',
      sql`${table.xmlSha256} ~ ${raw(`'${SHA256_PATTERN}'`)}`,
    ),
    check(
      'mdfe_fiscal_documents_closure_city_code_check',
      sql`${table.closureCityCode} is null or ${table.closureCityCode} ~ ${raw(`'${IBGE_CITY_PATTERN}'`)}`,
    ),
    check(
      'mdfe_fiscal_documents_closure_state_check',
      sql`${table.closureState} is null or ${table.closureState} ~ ${raw(`'${STATE_PATTERN}'`)}`,
    ),
    check(
      'mdfe_fiscal_documents_closure_xml_check',
      sql`(${table.closureXmlObjectId} is null) = (${table.closureXmlSha256} is null) and (${table.closureXmlSha256} is null or ${table.closureXmlSha256} ~ ${raw(`'${SHA256_PATTERN}'`)})`,
    ),
    check(
      'mdfe_fiscal_documents_closed_state_check',
      sql`${table.status} <> 'closed' or (${table.closureProtocol} is not null and ${table.closureCityCode} is not null and ${table.closureState} is not null and ${table.closedAt} is not null)`,
    ),
    check(
      'mdfe_fiscal_documents_cancellation_justification_check',
      sql`${table.cancellationJustification} is null or length(${table.cancellationJustification}) >= ${raw(String(MIN_CANCELLATION_JUSTIFICATION_LENGTH))}`,
    ),
    check(
      'mdfe_fiscal_documents_cancellation_xml_check',
      sql`(${table.cancellationXmlObjectId} is null) = (${table.cancellationXmlSha256} is null) and (${table.cancellationXmlSha256} is null or ${table.cancellationXmlSha256} ~ ${raw(`'${SHA256_PATTERN}'`)})`,
    ),
    check(
      'mdfe_fiscal_documents_cancelled_state_check',
      sql`${table.status} <> 'cancelled' or (${table.cancellationProtocol} is not null and ${table.cancellationJustification} is not null and ${table.cancelledAt} is not null)`,
    ),
    // Manifesto encerrado não cancela — a SEFAZ rejeita o 110111 depois do 110112
    check(
      'mdfe_fiscal_documents_closed_never_cancels',
      sql`${table.closedAt} is null or ${table.status} <> 'cancelled'`,
    ),
  ],
)

export const mdfeIssuanceEvents = pgTable(
  'mdfe_issuance_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    eventName: text('event_name').$type<MdfeIssuanceEvent>().notNull(),
    payload: jsonb().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_issuance_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [mdfeIssuanceAttempts.companyId, mdfeIssuanceAttempts.id],
      name: 'mdfe_issuance_events_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_issuance_events_company_manifest_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_issuance_events_company_id_id_unique').on(table.companyId, table.id),
    index('mdfe_issuance_events_company_manifest_created_at_idx').on(
      table.companyId,
      table.manifestId,
      table.createdAt,
    ),
    check(
      'mdfe_issuance_events_name_check',
      sql`${table.eventName} in (${raw(inList(MDFE_ISSUANCE_EVENTS))})`,
    ),
  ],
)

/**
 * Congela o que a SEFAZ vai receber no momento do pedido. Sem isso o worker teria de remontar o
 * `MdfeData` a partir das linhas — segunda fonte da verdade fiscal, sujeita a edição do manifesto
 * entre o pedido e a transmissão.
 */
export const mdfeIssuancePayloads = pgTable(
  'mdfe_issuance_payloads',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    payload: jsonb().notNull(),
    providerConfig: jsonb('provider_config').notNull(),
    payloadSha256: text('payload_sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_issuance_payloads_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_issuance_payloads_company_manifest_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [mdfeIssuanceAttempts.companyId, mdfeIssuanceAttempts.id],
      name: 'mdfe_issuance_payloads_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_issuance_payloads_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_issuance_payloads_company_attempt_unique').on(table.companyId, table.attemptId),
    index('mdfe_issuance_payloads_company_manifest_created_at_idx').on(
      table.companyId,
      table.manifestId,
      table.createdAt,
    ),
    check('mdfe_issuance_payloads_sha256_check', sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`),
  ],
)

/**
 * Ledger de idempotência do trilho MDF-e. Igual ao do CT-e, não referencia o outbox de origem: a
 * FK para a tabela de outbox foi o que impediu o consumidor de gravar.
 */
export const mdfeProcessedMessages = pgTable(
  'mdfe_processed_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    consumerName: text('consumer_name').notNull(),
    eventId: uuid('event_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    result: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_processed_messages_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_processed_messages_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_processed_messages_company_consumer_event_unique').on(
      table.companyId,
      table.consumerName,
      table.eventId,
    ),
  ],
)

export const mdfeIssuanceOutbox = pgTable(
  'mdfe_issuance_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateSubtype: text('aggregate_subtype').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    manifestId: uuid('manifest_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    attemptKind: text('attempt_kind').$type<MdfeAttemptKind>().notNull(),
    status: text().$type<MdfeIssuanceOutboxStatus>().notNull(),
    eventType: text('event_type').$type<MdfeIssuanceOutboxEventType>().notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
    attemptFingerprint: text('attempt_fingerprint').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb().notNull(),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'mdfe_issuance_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.aggregateId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_issuance_outbox_company_aggregate_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.manifestId],
      foreignColumns: [mdfeManifests.companyId, mdfeManifests.id],
      name: 'mdfe_issuance_outbox_company_manifest_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [mdfeIssuanceAttempts.companyId, mdfeIssuanceAttempts.id],
      name: 'mdfe_issuance_outbox_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'mdfe_issuance_outbox_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('mdfe_issuance_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('mdfe_issuance_outbox_company_id_event_id_unique').on(table.companyId, table.eventId),
    index('mdfe_issuance_outbox_company_published_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check(
      'mdfe_issuance_outbox_attempt_kind_check',
      sql`${table.attemptKind} in (${raw(inList(MDFE_ATTEMPT_KINDS))})`,
    ),
    check(
      'mdfe_issuance_outbox_status_check',
      sql`${table.status} in (${raw(inList(MDFE_ISSUANCE_OUTBOX_STATUSES))})`,
    ),
    check(
      'mdfe_issuance_outbox_event_type_check',
      sql`${table.eventType} in (${raw(inList(MDFE_ISSUANCE_OUTBOX_EVENT_TYPES))})`,
    ),
    check('mdfe_issuance_outbox_event_version_check', sql`${table.eventVersion} > 0`),
    check(
      'mdfe_issuance_outbox_claim_check',
      sql`(${table.claimOwner} is null) = (${table.claimExpiresAt} is null)`,
    ),
  ],
)
