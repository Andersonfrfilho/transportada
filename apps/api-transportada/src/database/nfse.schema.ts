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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { CTE_CHARGE_CALCULATION_TYPES } from './cte-emission-profile.schema.js'
import type { CteChargeCalculationType } from './cte-emission-profile.schema.js'
import { freightRules } from './freight.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { inList } from './schema-check.constant.js'
import { storedObjects } from './storage.schema.js'

export const NFSE_EMISSION_PROFILE_STATUSES = ['draft', 'active', 'inactive'] as const
export type NfseEmissionProfileStatus = (typeof NFSE_EMISSION_PROFILE_STATUSES)[number]

/**
 * Tomador da nota de serviço, no mesmo vocabulário do CT-e (ADR-0028): `0` remetente, `3`
 * destinatário. Os papéis `1` e `2` do CT-e não existem aqui — expedidor e recebedor não pagam
 * o serviço municipal.
 */
export const NFSE_TAKERS = ['0', '3'] as const
export type NfseTaker = (typeof NFSE_TAKERS)[number]

/** ExigibilidadeISS (ABRASF): 1 exigível … 7 suspensa por processo administrativo. */
export const NFSE_ISS_EXIGIBILITIES = ['1', '2', '3', '4', '5', '6', '7'] as const
export type NfseIssExigibility = (typeof NFSE_ISS_EXIGIBILITIES)[number]

export const NFSE_PROVIDERS = ['notarp'] as const
export type NfseProvider = (typeof NFSE_PROVIDERS)[number]

export const NFSE_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type NfseFiscalEnvironment = (typeof NFSE_FISCAL_ENVIRONMENTS)[number]

export const NFSE_CREDENTIAL_STATUSES = ['active', 'inactive'] as const
export type NfseCredentialStatus = (typeof NFSE_CREDENTIAL_STATUSES)[number]

/**
 * `pending_authorization` não existe no CT-e nem no MDF-e: a prefeitura aceita o RPS na hora e
 * autoriza depois, então há um estado em que a nota já tem número de protocolo do provedor e
 * ainda não é documento fiscal.
 *
 * `cancellation_requested` é a mesma assincronia do outro lado: a prefeitura aceita o pedido de
 * cancelamento na hora e confirma depois. Sem ele a nota ficaria `authorized` na tela até a
 * reconciliação rodar, e quem cancelou não veria nada acontecer.
 */
export const NFSE_SERVICE_INVOICE_STATUSES = [
  'requested',
  'issuing',
  'pending_authorization',
  'authorized',
  'cancellation_requested',
  'rejected',
  'cancelled',
  'failed',
  'discarded',
] as const
export type NfseServiceInvoiceStatus = (typeof NFSE_SERVICE_INVOICE_STATUSES)[number]

/**
 * O `motivo` do `/cancelar-nota` da Nota RP v2 é código, não texto. O vocabulário do provedor tem
 * `1` (erro na emissão), `2` (serviço não prestado) e `4` (nota duplicada) — não existe `3`. O `1`
 * fica de fora de propósito: o próprio provedor **recusa** o cancelamento pedindo substituição de
 * NFS-e, que não emitimos, e aceitá-lo aqui liberaria as NF-e e deixaria a nota esperando um
 * retorno que nunca vem.
 */
export const NFSE_CANCELLATION_MOTIVES = ['2', '4'] as const
export type NfseCancellationMotive = (typeof NFSE_CANCELLATION_MOTIVES)[number]

export const NFSE_ATTEMPT_KINDS = ['issue', 'cancel'] as const
export type NfseAttemptKind = (typeof NFSE_ATTEMPT_KINDS)[number]

export const NFSE_ISSUANCE_STATUSES = [
  'pending',
  'in_flight',
  'accepted',
  'authorized',
  'rejected',
  'retry_scheduled',
  'failed',
  'reconciliation_required',
  'cancelled',
] as const
export type NfseIssuanceStatus = (typeof NFSE_ISSUANCE_STATUSES)[number]

export const NFSE_DOCUMENT_STATUSES = ['authorized', 'cancelled'] as const
export type NfseDocumentStatus = (typeof NFSE_DOCUMENT_STATUSES)[number]

export const NFSE_ISSUANCE_EVENTS = [
  'issue_requested',
  'cancel_requested',
  'in_flight',
  'accepted',
  'authorized',
  'rejected',
  'failed',
  'retry_scheduled',
  'reconciliation_required',
  'cancelled',
] as const
export type NfseIssuanceEvent = (typeof NFSE_ISSUANCE_EVENTS)[number]

export const NFSE_ISSUANCE_OUTBOX_EVENT_TYPES = [
  'transportada.nfse.invoice.issue.requested',
  'transportada.nfse.invoice.cancel.requested',
] as const
export type NfseIssuanceOutboxEventType = (typeof NFSE_ISSUANCE_OUTBOX_EVENT_TYPES)[number]

export const NFSE_ISSUANCE_OUTBOX_STATUSES = ['requested', 'retry_scheduled'] as const
export type NfseIssuanceOutboxStatus = (typeof NFSE_ISSUANCE_OUTBOX_STATUSES)[number]

const IBGE_CITY_PATTERN = '^[0-9]{7}$'
const CNAE_PATTERN = '^[0-9]{7}$'
const CNPJ_PATTERN = '^[A-Z0-9]{12}[0-9]{2}$'
const TAX_ID_OR_CNPJ_PATTERN = '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$'
const SHA256_PATTERN = '^[0-9a-f]{64}$'

/** Mesmo teto do nome de município do MDF-e — é o mesmo dado, vindo da mesma tabela do IBGE. */
export const MUNICIPALITY_NAME_MAX_LENGTH = 60

/** `Discriminacao` do ABRASF 2.04 aceita 2000 caracteres; a prefeitura pode apertar o teto. */
export const MIN_DESCRIPTION_MAX_LENGTH = 200
export const MAX_DESCRIPTION_MAX_LENGTH = 5000
export const DEFAULT_DESCRIPTION_MAX_LENGTH = 2000n

const moneyColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })
const rateColumn = (name: string) => numeric(name, { precision: 9, scale: 6 })
const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)

export const nfseEmissionProfiles = pgTable(
  'nfse_emission_profiles',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    status: text().$type<NfseEmissionProfileStatus>().notNull().default('draft'),
    freightRuleId: uuid('freight_rule_id').notNull(),
    taker: text().$type<NfseTaker>().notNull(),
    chargeComponentLabel: text('charge_component_label').notNull(),
    municipalityIbgeCode: text('municipality_ibge_code').notNull(),
    municipalityName: text('municipality_name').notNull(),
    cnaeCode: text('cnae_code').notNull(),
    serviceListItem: text('service_list_item').notNull(),
    municipalTaxationCode: text('municipal_taxation_code').notNull().default(''),
    nbsCode: text('nbs_code').notNull().default(''),
    issRate: rateColumn('iss_rate').notNull().default('0'),
    issWithheld: boolean('iss_withheld').notNull().default(false),
    issExigibility: text('iss_exigibility').$type<NfseIssExigibility>().notNull().default('1'),
    descriptionTemplate: text('description_template').notNull(),
    descriptionMaxLength: bigint('description_max_length', { mode: 'bigint' })
      .notNull()
      .default(DEFAULT_DESCRIPTION_MAX_LENGTH),
    observations: text().notNull().default(''),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_emission_profiles_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightRuleId],
      foreignColumns: [freightRules.companyId, freightRules.id],
      name: 'nfse_emission_profiles_company_freight_rule_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'nfse_emission_profiles_author_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_emission_profiles_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_emission_profiles_company_id_name_unique').on(table.companyId, table.name),
    index('nfse_emission_profiles_company_status_name_idx').on(
      table.companyId,
      table.status,
      table.name,
    ),
    check(
      'nfse_emission_profiles_status_check',
      sql`${table.status} in (${raw(inList(NFSE_EMISSION_PROFILE_STATUSES))})`,
    ),
    check(
      'nfse_emission_profiles_taker_check',
      sql`${table.taker} in (${raw(inList(NFSE_TAKERS))})`,
    ),
    check(
      'nfse_emission_profiles_iss_exigibility_check',
      sql`${table.issExigibility} in (${raw(inList(NFSE_ISS_EXIGIBILITIES))})`,
    ),
    check(
      'nfse_emission_profiles_iss_rate_check',
      sql`${table.issRate} >= 0 and ${table.issRate} <= 1`,
    ),
    check(
      'nfse_emission_profiles_municipality_check',
      sql`${table.municipalityIbgeCode} ~ ${raw(`'${IBGE_CITY_PATTERN}'`)}`,
    ),
    check(
      'nfse_emission_profiles_municipality_name_check',
      sql`length(${table.municipalityName}) > 0 and length(${table.municipalityName}) <= ${raw(String(MUNICIPALITY_NAME_MAX_LENGTH))}`,
    ),
    check(
      'nfse_emission_profiles_cnae_check',
      sql`${table.cnaeCode} ~ ${raw(`'${CNAE_PATTERN}'`)}`,
    ),
    check(
      'nfse_emission_profiles_description_max_length_check',
      sql`${table.descriptionMaxLength} between ${raw(String(MIN_DESCRIPTION_MAX_LENGTH))} and ${raw(String(MAX_DESCRIPTION_MAX_LENGTH))}`,
    ),
    check(
      'nfse_emission_profiles_description_template_check',
      sql`length(${table.descriptionTemplate}) > 0`,
    ),
    check(
      'nfse_emission_profiles_service_list_item_check',
      sql`length(${table.serviceListItem}) > 0`,
    ),
    check(
      'nfse_emission_profiles_charge_component_label_check',
      sql`length(${table.chargeComponentLabel}) > 0`,
    ),
    check('nfse_emission_profiles_name_check', sql`length(${table.name}) > 0`),
    check('nfse_emission_profiles_version_check', sql`${table.version} > 0`),
  ],
)

/**
 * O token da Nota RP nunca existe como coluna legível: ele vive selado em `secret_envelope`
 * (ADR-0004). `callback_token_sha256` é outro segredo — o valor opaco que a rota anônima de
 * callback recebe — e é único **global**, porque essa rota não tem contexto de tenant para
 * restringir a busca a uma empresa.
 */
export const nfseProviderCredentials = pgTable(
  'nfse_provider_credentials',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    provider: text().$type<NfseProvider>().notNull().default('notarp'),
    fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
    taxId: text('tax_id').notNull(),
    municipalRegistration: text('municipal_registration').notNull(),
    secretEnvelope: jsonb('secret_envelope').notNull(),
    callbackTokenSha256: text('callback_token_sha256').notNull(),
    status: text().$type<NfseCredentialStatus>().notNull().default('active'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_provider_credentials_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_provider_credentials_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_provider_credentials_company_provider_environment_unique').on(
      table.companyId,
      table.provider,
      table.fiscalEnvironment,
    ),
    unique('nfse_provider_credentials_callback_token_sha256_unique').on(table.callbackTokenSha256),
    check(
      'nfse_provider_credentials_provider_check',
      sql`${table.provider} in (${raw(inList(NFSE_PROVIDERS))})`,
    ),
    check(
      'nfse_provider_credentials_environment_check',
      sql`${table.fiscalEnvironment} in (${raw(inList(NFSE_FISCAL_ENVIRONMENTS))})`,
    ),
    check(
      'nfse_provider_credentials_status_check',
      sql`${table.status} in (${raw(inList(NFSE_CREDENTIAL_STATUSES))})`,
    ),
    check(
      'nfse_provider_credentials_tax_id_check',
      sql`${table.taxId} ~ ${raw(`'${CNPJ_PATTERN}'`)}`,
    ),
    check(
      'nfse_provider_credentials_callback_token_check',
      sql`${table.callbackTokenSha256} ~ ${raw(`'${SHA256_PATTERN}'`)}`,
    ),
    check('nfse_provider_credentials_version_check', sql`${table.version} > 0`),
    /**
     * `not null` sozinho deixava passar a string vazia, e o padrão `''` da coluna a escrevia sem
     * ninguém pedir. A inscrição vai no `X-AUTH-IM` de toda chamada à Nota RP: em branco o provedor
     * responde 200 com `cadastro: null` e a credencial só se revela inválida na primeira emissão.
     */
    check(
      'nfse_provider_credentials_municipal_registration_check',
      sql`length(${table.municipalRegistration}) > 0`,
    ),
  ],
)

export const nfseServiceInvoices = pgTable(
  'nfse_service_invoices',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    emissionProfileId: uuid('emission_profile_id').notNull(),
    takerTaxId: text('taker_tax_id').notNull(),
    takerLegalName: text('taker_legal_name').notNull(),
    status: text().$type<NfseServiceInvoiceStatus>().notNull().default('requested'),
    serviceAmount: moneyColumn('service_amount').notNull(),
    issAmount: moneyColumn('iss_amount').notNull().default('0'),
    description: text().notNull(),
    calculationSnapshot: jsonb('calculation_snapshot').notNull(),
    providerDocumentId: text('provider_document_id'),
    providerNumber: text('provider_number'),
    verificationCode: text('verification_code'),
    rejectionCode: text('rejection_code'),
    rejectionMessage: text('rejection_message'),
    nextStatusCheckAt: timestamp('next_status_check_at', { withTimezone: true }),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationMotive: text('cancellation_motive').$type<NfseCancellationMotive>(),
    cancellationReason: text('cancellation_reason'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_service_invoices_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.emissionProfileId],
      foreignColumns: [nfseEmissionProfiles.companyId, nfseEmissionProfiles.id],
      name: 'nfse_service_invoices_company_profile_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'nfse_service_invoices_author_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_service_invoices_company_id_id_unique').on(table.companyId, table.id),
    uniqueIndex('nfse_service_invoices_company_provider_document_unique')
      .on(table.companyId, table.providerDocumentId)
      .where(sql`${table.providerDocumentId} is not null`),
    index('nfse_service_invoices_company_status_next_check_idx').on(
      table.companyId,
      table.status,
      table.nextStatusCheckAt,
    ),
    index('nfse_service_invoices_company_created_at_idx').on(table.companyId, table.createdAt),
    check(
      'nfse_service_invoices_status_check',
      sql`${table.status} in (${raw(inList(NFSE_SERVICE_INVOICE_STATUSES))})`,
    ),
    check(
      'nfse_service_invoices_taker_tax_id_check',
      sql`${table.takerTaxId} ~ ${raw(`'${TAX_ID_OR_CNPJ_PATTERN}'`)}`,
    ),
    check(
      'nfse_service_invoices_amount_check',
      sql`${table.serviceAmount} >= 0 and ${table.issAmount} >= 0`,
    ),
    check('nfse_service_invoices_description_check', sql`length(${table.description}) > 0`),
    check(
      'nfse_service_invoices_authorized_check',
      sql`${table.status} <> 'authorized' or (${table.providerDocumentId} is not null and ${table.authorizedAt} is not null)`,
    ),
    check(
      'nfse_service_invoices_rejected_check',
      sql`${table.status} <> 'rejected' or (${table.rejectionCode} is not null and ${table.rejectionMessage} is not null)`,
    ),
    check(
      'nfse_service_invoices_cancelled_check',
      sql`${table.status} <> 'cancelled' or (${table.cancelledAt} is not null and ${table.cancellationReason} is not null)`,
    ),
    /**
     * O pedido de cancelamento já nasce com o motivo — ele é entrada obrigatória de quem cancela.
     * `cancelled_at` não: ele é o instante em que o documento deixou de valer, e quem decide isso
     * é a prefeitura. Exigi-lo aqui seria carimbar uma data que ainda não aconteceu.
     */
    check(
      'nfse_service_invoices_cancellation_requested_check',
      sql`${table.status} <> 'cancellation_requested' or (${table.cancellationReason} is not null and ${table.cancelledAt} is null)`,
    ),
    /**
     * Só o conjunto de valores, e nada de obrigatoriedade por status: a nota cancelada antes desta
     * coluna existir tem o texto do operador e não tem código, e um CHECK que a exigisse recusaria
     * a linha antiga. Quem cobra o código é a fronteira Zod da API e a guarda do worker.
     */
    check(
      'nfse_service_invoices_cancellation_motive_check',
      sql`${table.cancellationMotive} is null or ${table.cancellationMotive} in (${raw(inList(NFSE_CANCELLATION_MOTIVES))})`,
    ),
    // Só os estados assíncronos agendam reconciliação — os liquidados não voltam para a varredura
    check(
      'nfse_service_invoices_next_check_state_check',
      sql`${table.status} in ('pending_authorization', 'cancellation_requested') or ${table.nextStatusCheckAt} is null`,
    ),
    check('nfse_service_invoices_version_check', sql`${table.version} > 0`),
  ],
)

/**
 * O vínculo entre a nota de serviço e as NF-e que ela cobre. Cancelar a nota preenche
 * `cancelled_at` na mesma transação, e o índice parcial devolve o documento para a seleção —
 * mesma forma de `billing_invoice_items_active_cte_document_unique`.
 */
export const nfseServiceInvoiceDocuments = pgTable(
  'nfse_service_invoice_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    position: bigint({ mode: 'bigint' }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_service_invoice_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_service_invoice_documents_company_invoice_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfse_service_invoice_documents_company_nfe_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_service_invoice_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_service_invoice_documents_company_invoice_position_unique').on(
      table.companyId,
      table.invoiceId,
      table.position,
    ),
    uniqueIndex('nfse_service_invoice_documents_active_nfe_unique')
      .on(table.companyId, table.nfeDocumentId)
      .where(sql`${table.cancelledAt} is null`),
    check('nfse_service_invoice_documents_position_check', sql`${table.position} > 0`),
  ],
)

export const nfseServiceInvoiceCharges = pgTable(
  'nfse_service_invoice_charges',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    label: text().notNull(),
    calculationType: text('calculation_type').$type<CteChargeCalculationType>().notNull(),
    rate: rateColumn('rate'),
    baseAmount: moneyColumn('base_amount').notNull(),
    amount: moneyColumn('amount').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_service_invoice_charges_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_service_invoice_charges_company_invoice_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('nfse_service_invoice_charges_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_service_invoice_charges_company_invoice_ordinal_unique').on(
      table.companyId,
      table.invoiceId,
      table.ordinal,
    ),
    check(
      'nfse_service_invoice_charges_calculation_type_check',
      sql`${table.calculationType} in (${raw(inList(CTE_CHARGE_CALCULATION_TYPES))})`,
    ),
    check(
      'nfse_service_invoice_charges_value_coherence_check',
      sql`case when ${table.calculationType} = 'fixed_amount' then ${table.rate} is null else ${table.rate} is not null end`,
    ),
    check(
      'nfse_service_invoice_charges_rate_check',
      sql`${table.rate} is null or (${table.rate} >= 0 and ${table.rate} <= 1)`,
    ),
    check(
      'nfse_service_invoice_charges_amount_check',
      sql`${table.amount} >= 0 and ${table.baseAmount} >= 0`,
    ),
    check('nfse_service_invoice_charges_ordinal_check', sql`${table.ordinal} > 0`),
    check('nfse_service_invoice_charges_label_check', sql`length(${table.label}) > 0`),
  ],
)

export const nfseIssuanceAttempts = pgTable(
  'nfse_issuance_attempts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    attemptKind: text('attempt_kind').$type<NfseAttemptKind>().notNull(),
    attemptNumber: bigint('attempt_number', { mode: 'bigint' }).notNull(),
    status: text().$type<NfseIssuanceStatus>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    idempotencyFingerprint: text('idempotency_fingerprint').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
    lastErrorCode: text('last_error_code'),
    lastErrorCause: text('last_error_cause'),
    lastErrorMessage: text('last_error_message'),
    correlationId: text('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_issuance_attempts_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_issuance_attempts_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_issuance_attempts_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_issuance_attempts_company_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    unique('nfse_issuance_attempts_company_invoice_kind_fingerprint_unique').on(
      table.companyId,
      table.invoiceId,
      table.attemptKind,
      table.requestFingerprint,
    ),
    index('nfse_issuance_attempts_company_status_created_at_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    check(
      'nfse_issuance_attempts_kind_check',
      sql`${table.attemptKind} in (${raw(inList(NFSE_ATTEMPT_KINDS))})`,
    ),
    check(
      'nfse_issuance_attempts_status_check',
      sql`${table.status} in (${raw(inList(NFSE_ISSUANCE_STATUSES))})`,
    ),
    check(
      'nfse_issuance_attempts_environment_check',
      sql`${table.fiscalEnvironment} in (${raw(inList(NFSE_FISCAL_ENVIRONMENTS))})`,
    ),
    check('nfse_issuance_attempts_attempt_number_check', sql`${table.attemptNumber} > 0`),
    check('nfse_issuance_attempts_idempotency_key_check', sql`length(${table.idempotencyKey}) > 0`),
    check(
      'nfse_issuance_attempts_request_fingerprint_check',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
  ],
)

export const nfseIssuanceEvents = pgTable(
  'nfse_issuance_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    eventName: text('event_name').$type<NfseIssuanceEvent>().notNull(),
    payload: jsonb().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_issuance_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [nfseIssuanceAttempts.companyId, nfseIssuanceAttempts.id],
      name: 'nfse_issuance_events_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_issuance_events_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_issuance_events_company_id_id_unique').on(table.companyId, table.id),
    index('nfse_issuance_events_company_invoice_created_at_idx').on(
      table.companyId,
      table.invoiceId,
      table.createdAt,
    ),
    check(
      'nfse_issuance_events_name_check',
      sql`${table.eventName} in (${raw(inList(NFSE_ISSUANCE_EVENTS))})`,
    ),
  ],
)

/**
 * Congela o RPS que a prefeitura vai receber. Sem isso o worker remontaria a descrição e o valor
 * a partir das linhas — segunda fonte da verdade fiscal, sujeita a edição entre o pedido e a
 * transmissão.
 */
export const nfseIssuancePayloads = pgTable(
  'nfse_issuance_payloads',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
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
      name: 'nfse_issuance_payloads_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_issuance_payloads_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [nfseIssuanceAttempts.companyId, nfseIssuanceAttempts.id],
      name: 'nfse_issuance_payloads_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_issuance_payloads_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_issuance_payloads_company_attempt_unique').on(table.companyId, table.attemptId),
    index('nfse_issuance_payloads_company_invoice_created_at_idx').on(
      table.companyId,
      table.invoiceId,
      table.createdAt,
    ),
    check(
      'nfse_issuance_payloads_sha256_check',
      sql`${table.payloadSha256} ~ ${raw(`'${SHA256_PATTERN}'`)}`,
    ),
  ],
)

/**
 * O PDF é caminho novo: nenhum outro trilho fiscal arquiva `application/pdf`. Ele pode faltar
 * quando o download falha depois da autorização, por isso o par objeto/digest é opcional e
 * pareado — mas o XML, que é o documento, nunca falta.
 */
export const nfseFiscalDocuments = pgTable(
  'nfse_fiscal_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    providerDocumentId: text('provider_document_id').notNull(),
    fiscalNumber: text('fiscal_number').notNull(),
    verificationCode: text('verification_code').notNull().default(''),
    fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
    status: text().$type<NfseDocumentStatus>().notNull(),
    xmlObjectId: uuid('xml_object_id').notNull(),
    xmlSha256: text('xml_sha256').notNull(),
    pdfObjectId: uuid('pdf_object_id'),
    pdfSha256: text('pdf_sha256'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_fiscal_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_fiscal_documents_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [nfseIssuanceAttempts.companyId, nfseIssuanceAttempts.id],
      name: 'nfse_fiscal_documents_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.xmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfse_fiscal_documents_company_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.pdfObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfse_fiscal_documents_company_pdf_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_fiscal_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_fiscal_documents_company_invoice_unique').on(table.companyId, table.invoiceId),
    unique('nfse_fiscal_documents_company_provider_document_unique').on(
      table.companyId,
      table.providerDocumentId,
    ),
    check(
      'nfse_fiscal_documents_status_check',
      sql`${table.status} in (${raw(inList(NFSE_DOCUMENT_STATUSES))})`,
    ),
    check(
      'nfse_fiscal_documents_environment_check',
      sql`${table.fiscalEnvironment} in (${raw(inList(NFSE_FISCAL_ENVIRONMENTS))})`,
    ),
    check(
      'nfse_fiscal_documents_sha256_check',
      sql`${table.xmlSha256} ~ ${raw(`'${SHA256_PATTERN}'`)}`,
    ),
    check(
      'nfse_fiscal_documents_pdf_check',
      sql`(${table.pdfObjectId} is null) = (${table.pdfSha256} is null) and (${table.pdfSha256} is null or ${table.pdfSha256} ~ ${raw(`'${SHA256_PATTERN}'`)})`,
    ),
    check(
      'nfse_fiscal_documents_cancelled_state_check',
      sql`${table.status} <> 'cancelled' or ${table.cancelledAt} is not null`,
    ),
  ],
)

/**
 * Ledger de idempotência do trilho NFS-e. Como no CT-e e no MDF-e, não referencia o outbox de
 * origem: a FK para a tabela de outbox foi o que impediu o consumidor de gravar.
 */
export const nfseProcessedMessages = pgTable(
  'nfse_processed_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    consumerName: text('consumer_name').notNull(),
    eventId: uuid('event_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    result: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'nfse_processed_messages_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_processed_messages_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_processed_messages_company_consumer_event_unique').on(
      table.companyId,
      table.consumerName,
      table.eventId,
    ),
  ],
)

export const nfseIssuanceOutbox = pgTable(
  'nfse_issuance_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateSubtype: text('aggregate_subtype').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    attemptId: uuid('attempt_id').notNull(),
    attemptKind: text('attempt_kind').$type<NfseAttemptKind>().notNull(),
    status: text().$type<NfseIssuanceOutboxStatus>().notNull(),
    eventType: text('event_type').$type<NfseIssuanceOutboxEventType>().notNull(),
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
      name: 'nfse_issuance_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.aggregateId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_issuance_outbox_company_aggregate_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [nfseServiceInvoices.companyId, nfseServiceInvoices.id],
      name: 'nfse_issuance_outbox_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attemptId],
      foreignColumns: [nfseIssuanceAttempts.companyId, nfseIssuanceAttempts.id],
      name: 'nfse_issuance_outbox_company_attempt_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'nfse_issuance_outbox_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('nfse_issuance_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('nfse_issuance_outbox_company_id_event_id_unique').on(table.companyId, table.eventId),
    index('nfse_issuance_outbox_company_published_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check(
      'nfse_issuance_outbox_attempt_kind_check',
      sql`${table.attemptKind} in (${raw(inList(NFSE_ATTEMPT_KINDS))})`,
    ),
    check(
      'nfse_issuance_outbox_status_check',
      sql`${table.status} in (${raw(inList(NFSE_ISSUANCE_OUTBOX_STATUSES))})`,
    ),
    check(
      'nfse_issuance_outbox_event_type_check',
      sql`${table.eventType} in (${raw(inList(NFSE_ISSUANCE_OUTBOX_EVENT_TYPES))})`,
    ),
    check('nfse_issuance_outbox_event_version_check', sql`${table.eventVersion} > 0`),
    check(
      'nfse_issuance_outbox_claim_check',
      sql`(${table.claimOwner} is null) = (${table.claimExpiresAt} is null)`,
    ),
  ],
)
