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
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { companies, identityUsers, userCompanyMemberships } from './identity.schema.js'
import { storedObjects } from './storage.schema.js'

export const NFE_IMPORT_SOURCES = ['upload', 'distribution'] as const
export type NfeImportSource = (typeof NFE_IMPORT_SOURCES)[number]

export const NFE_ORIGIN_TRIGGERS = ['user', 'automation'] as const
export type NfeOriginTrigger = (typeof NFE_ORIGIN_TRIGGERS)[number]

export const NFE_IMPORT_STATUSES = [
  'pending',
  'queued',
  'processing',
  'completed',
  'partially_processed',
  'failed',
  'cancelled',
] as const
export type NfeImportStatus = (typeof NFE_IMPORT_STATUSES)[number]

export const NFE_ITEM_STATUSES = [
  'pending',
  'validating',
  'imported',
  'duplicated',
  'invalid',
  'rejected',
  'failed',
] as const
export type NfeItemStatus = (typeof NFE_ITEM_STATUSES)[number]

export const NFE_ITEM_VARIANTS = ['complete', 'summary', 'event'] as const
export type NfeItemVariant = (typeof NFE_ITEM_VARIANTS)[number]

export const NFE_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type NfeFiscalEnvironment = (typeof NFE_FISCAL_ENVIRONMENTS)[number]

export const NFE_DOCUMENT_STATUSES = ['authorized', 'cancelled', 'denied', 'unsigned'] as const
export type NfeDocumentStatus = (typeof NFE_DOCUMENT_STATUSES)[number]

export const NFE_EVENT_ORIGINS = ['manual', 'automatic'] as const
export type NfeEventOrigin = (typeof NFE_EVENT_ORIGINS)[number]

export const NFE_DOCUMENT_STATUS_CHANGE_CAUSES = ['event', 'summary', 'document_insert'] as const
export type NfeDocumentStatusChangeCause = (typeof NFE_DOCUMENT_STATUS_CHANGE_CAUSES)[number]

const decimalColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })

export const nfeImports = pgTable(
  'nfe_imports',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    source: text().$type<NfeImportSource>().notNull(),
    triggeredBy: text('triggered_by').$type<NfeOriginTrigger>().notNull().default('user'),
    automationJob: text('automation_job'),
    requestedByUserId: uuid('requested_by_user_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    status: text().$type<NfeImportStatus>().notNull(),
    receivedCount: bigint('received_count', { mode: 'bigint' }).notNull().default(0n),
    processedCount: bigint('processed_count', { mode: 'bigint' }).notNull().default(0n),
    importedCount: bigint('imported_count', { mode: 'bigint' }).notNull().default(0n),
    duplicatedCount: bigint('duplicated_count', { mode: 'bigint' }).notNull().default(0n),
    invalidCount: bigint('invalid_count', { mode: 'bigint' }).notNull().default(0n),
    rejectedCount: bigint('rejected_count', { mode: 'bigint' }).notNull().default(0n),
    failedCount: bigint('failed_count', { mode: 'bigint' }).notNull().default(0n),
    terminalError: jsonb('terminal_error'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_imports_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_imports_company_id_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.requestedByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'nfe_imports_requested_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('nfe_imports_source_check', sql`${table.source} in ('upload', 'distribution')`),
    check(
      'nfe_imports_origin_ck',
      sql`(${table.triggeredBy} = 'user' and ${table.automationJob} is null) or (${table.triggeredBy} = 'automation' and ${table.automationJob} is not null)`,
    ),
    check(
      'nfe_imports_status_check',
      sql`${table.status} in ('pending', 'queued', 'processing', 'completed', 'partially_processed', 'failed', 'cancelled')`,
    ),
    check(
      'nfe_imports_counters_check',
      sql`${table.receivedCount} >= 0 and ${table.processedCount} >= 0 and ${table.importedCount} >= 0 and ${table.duplicatedCount} >= 0 and ${table.invalidCount} >= 0 and ${table.rejectedCount} >= 0 and ${table.failedCount} >= 0 and ${table.processedCount} <= ${table.receivedCount} and ${table.processedCount} = ${table.importedCount} + ${table.duplicatedCount} + ${table.invalidCount} + ${table.rejectedCount} + ${table.failedCount}`,
    ),
    check('nfe_imports_version_check', sql`${table.version} > 0`),
  ],
)

export const nfeImportItems = pgTable(
  'nfe_import_items',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    importId: uuid('import_id').notNull(),
    previousItemId: uuid('previous_item_id'),
    previousAttempt: bigint('previous_attempt', { mode: 'bigint' }),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    sourceName: text('source_name').notNull(),
    sourceObjectId: uuid('source_object_id').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    sourceEntry: text('source_entry').notNull(),
    variant: text().$type<NfeItemVariant>(),
    accessKey: text('access_key'),
    sourceNsu: text('source_nsu'),
    environment: text().$type<NfeFiscalEnvironment>(),
    status: text().$type<NfeItemStatus>().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(1n),
    error: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_import_items_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_import_items_company_id_import_id_ordinal_attempt_unique').on(
      table.companyId,
      table.importId,
      table.ordinal,
      table.attempt,
    ),
    unique('nfe_import_items_company_id_import_id_source_attempt_unique').on(
      table.companyId,
      table.importId,
      table.sourceSha256,
      table.sourceEntry,
      table.attempt,
    ),
    unique('nfe_import_items_lineage_target_unique').on(
      table.companyId,
      table.id,
      table.sourceObjectId,
      table.sourceSha256,
      table.sourceEntry,
      table.attempt,
    ),
    uniqueIndex('nfe_import_items_company_environment_source_nsu_unique')
      .on(table.companyId, table.environment, table.sourceNsu)
      .where(sql`${table.sourceNsu} is not null`),
    uniqueIndex('nfe_import_items_company_previous_item_unique')
      .on(table.companyId, table.previousItemId)
      .where(sql`${table.previousItemId} is not null`),
    foreignKey({
      columns: [table.companyId, table.importId],
      foreignColumns: [nfeImports.companyId, nfeImports.id],
      name: 'nfe_import_items_company_import_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.sourceObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfe_import_items_company_source_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [
        table.companyId,
        table.previousItemId,
        table.sourceObjectId,
        table.sourceSha256,
        table.sourceEntry,
        table.previousAttempt,
      ],
      foreignColumns: [
        table.companyId,
        table.id,
        table.sourceObjectId,
        table.sourceSha256,
        table.sourceEntry,
        table.attempt,
      ],
      name: 'nfe_import_items_lineage_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('nfe_import_items_ordinal_check', sql`${table.ordinal} > 0`),
    check('nfe_import_items_attempt_check', sql`${table.attempt} > 0`),
    check('nfe_import_items_sha256_check', sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      'nfe_import_items_status_check',
      sql`${table.status} in ('pending', 'validating', 'imported', 'duplicated', 'invalid', 'rejected', 'failed')`,
    ),
    check(
      'nfe_import_items_variant_check',
      sql`${table.variant} is null or ${table.variant} in ('complete', 'summary', 'event')`,
    ),
    check(
      'nfe_import_items_access_key_check',
      sql`${table.accessKey} is null or ${table.accessKey} ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'`,
    ),
    check(
      'nfe_import_items_distribution_source_presence_check',
      sql`(${table.sourceNsu} is null) = (${table.environment} is null)`,
    ),
    check(
      'nfe_import_items_source_nsu_check',
      sql`${table.sourceNsu} is null or ${table.sourceNsu} ~ '^[0-9]{15}$'`,
    ),
    check(
      'nfe_import_items_environment_check',
      sql`${table.environment} is null or ${table.environment} in ('homologation', 'production')`,
    ),
    check(
      'nfe_import_items_attempt_history_check',
      sql`(${table.attempt} = 1 and ${table.previousItemId} is null and ${table.previousAttempt} is null) or (${table.attempt} > 1 and ${table.previousItemId} is not null and ${table.previousAttempt} is not null and ${table.attempt} = ${table.previousAttempt} + 1)`,
    ),
    check(
      'nfe_import_items_previous_item_check',
      sql`${table.previousItemId} is null or ${table.previousItemId} <> ${table.id}`,
    ),
  ],
)

export const nfeDocuments = pgTable(
  'nfe_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    accessKey: text('access_key').notNull(),
    model: text().notNull(),
    number: text().notNull(),
    series: text().notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    operationNature: text('operation_nature').notNull(),
    operationType: text('operation_type').notNull(),
    status: text().$type<NfeDocumentStatus>().notNull(),
    source: text().$type<NfeImportSource>().notNull(),
    totalValue: decimalColumn('total_value').notNull(),
    productsValue: decimalColumn('products_value').notNull(),
    freightValue: decimalColumn('freight_value').default('0'),
    insuranceValue: decimalColumn('insurance_value').default('0'),
    discountValue: decimalColumn('discount_value').default('0'),
    otherExpensesValue: decimalColumn('other_expenses_value').default('0'),
    additionalInformation: text('additional_information'),
    authorizationProtocol: text('authorization_protocol'),
    xmlObjectId: uuid('xml_object_id').notNull(),
    xmlSha256: text('xml_sha256').notNull(),
    importId: uuid('import_id').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => identityUsers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_documents_company_id_access_key_unique').on(table.companyId, table.accessKey),
    index('nfe_documents_company_updated_issued_id_idx').on(
      table.companyId,
      table.updatedAt.desc().nullsFirst(),
      table.issuedAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.companyId, table.xmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfe_documents_company_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.importId],
      foreignColumns: [nfeImports.companyId, nfeImports.id],
      name: 'nfe_documents_company_import_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'nfe_documents_created_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_documents_access_key_check',
      sql`${table.accessKey} ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'`,
    ),
    check('nfe_documents_model_check', sql`${table.model} = '55'`),
    check('nfe_documents_number_check', sql`${table.number} ~ '^[0-9]{1,9}$'`),
    check('nfe_documents_series_check', sql`${table.series} ~ '^[0-9]{1,3}$'`),
    check('nfe_documents_operation_type_check', sql`${table.operationType} in ('0', '1')`),
    check(
      'nfe_documents_status_check',
      sql`${table.status} in ('authorized', 'cancelled', 'denied', 'unsigned')`,
    ),
    check(
      'nfe_documents_authorization_protocol_presence_check',
      sql`(${table.status} <> 'authorized') or (${table.authorizationProtocol} is not null)`,
    ),
    check('nfe_documents_source_check', sql`${table.source} in ('upload', 'distribution')`),
    check(
      'nfe_documents_values_check',
      sql`${table.totalValue} >= 0 and ${table.productsValue} >= 0 and ${table.freightValue} >= 0 and ${table.insuranceValue} >= 0 and ${table.discountValue} >= 0 and ${table.otherExpensesValue} >= 0`,
    ),
    check('nfe_documents_sha256_check', sql`${table.xmlSha256} ~ '^[0-9a-f]{64}$'`),
  ],
)

export const nfeParticipants = pgTable(
  'nfe_participants',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    documentId: uuid('document_id').notNull(),
    role: text().notNull(),
    taxId: text('tax_id'),
    legalName: text('legal_name'),
    tradeName: text('trade_name'),
    stateRegistration: text('state_registration'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_participants_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_participants_company_document_role_unique').on(
      table.companyId,
      table.documentId,
      table.role,
    ),
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfe_participants_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

export const nfeAddresses = pgTable(
  'nfe_addresses',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    participantId: uuid('participant_id').notNull(),
    street: text(),
    number: text(),
    complement: text(),
    district: text(),
    cityCode: text('city_code'),
    city: text(),
    state: text(),
    postalCode: text('postal_code'),
    countryCode: text('country_code'),
    phone: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.participantId],
      foreignColumns: [nfeParticipants.companyId, nfeParticipants.id],
      name: 'nfe_addresses_company_participant_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    // A origem mais rica de CEP da instalação, e a que mais cresce: sem índice a sugestão varre a tabela
    index('nfe_addresses_company_postal_code_idx')
      .on(table.companyId, table.postalCode)
      .where(sql`${table.postalCode} is not null`),
  ],
)

export const nfeVolumes = pgTable(
  'nfe_volumes',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    documentId: uuid('document_id').notNull(),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    quantity: decimalColumn('quantity').default('0'),
    species: text(),
    grossWeight: decimalColumn('gross_weight').default('0'),
    netWeight: decimalColumn('net_weight').default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfe_volumes_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_volumes_values_check',
      sql`${table.ordinal} > 0 and ${table.quantity} >= 0 and ${table.grossWeight} >= 0 and ${table.netWeight} >= 0`,
    ),
    index('nfe_volumes_company_document_idx').on(table.companyId, table.documentId),
  ],
)

/**
 * Spec 152: como a medida da caixa chegou (D13–D19). `typed` e o padrao (digitada); `camera` e
 * `camera_adjusted` so existem com a funcao ligada na empresa (`company_cargo_settings`).
 * `camera_adjusted` e `camera` que o conferente editou a mao antes de gravar — a origem some, a
 * edicao fica registrada.
 * `replicated` (spec 155, D6) e medida copiada de outra variacao do mesmo produto: nao foi
 * conferida nesta caixa, e o cadastro precisa saber a diferenca.
 * `catalog` (spec 160) e proposta promovida do catalogo publico de GTIN — duas fontes concordando
 * dentro da tolerancia (RNF03), nunca conferida por gente.
 *
 * ⚠️ **A CHECK do banco (`nfe_package_boxes_measurement_source_check`,
 * `nfe_package_box_measurements_source_check`) ainda lista só os quatro valores antigos** — este
 * array TS por si só não torna `catalog` gravável; falta a migration aditiva que alarga as duas
 * CHECKs (fora do escopo da Fase 1 da spec 160, T006 pediu explicitamente para não gerar migration
 * aqui). Até essa migration existir, `catalog` só serve para o domínio raciocinar sobre a origem
 * antes de ela ser persistida.
 */
export const PACKAGE_BOX_MEASUREMENT_SOURCES = [
  'typed',
  'camera',
  'camera_adjusted',
  'replicated',
  'catalog',
] as const
export type PackageBoxMeasurementSource = (typeof PACKAGE_BOX_MEASUREMENT_SOURCES)[number]

/**
 * A caixa de papelao que carrega os produtos, e a medida dela (spec 085, ADR-0062).
 *
 * ⚠️ A identidade e `(empresa, emitente, cProd, uCom)`. O `cProd` e o codigo **do emitente** —
 * sozinho nao identifica nada — e o `uCom` entra na chave porque o mesmo produto em `CX12` e `CX24`
 * sao **duas caixas diferentes**: medido em 345 NF-e, `CX12` cobre 151 produtos distintos.
 *
 * ⚠️ A linha nasce **sem medida**, na importacao: o cadastro se popula do que roda, e medir e
 * preencher o que ja esta la. Milimetro e grama inteiros, como o dinheiro e centavo; o m3 e
 * derivado das tres dimensoes, nunca digitado.
 */
export const nfePackageBoxes = pgTable(
  'nfe_package_boxes',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    emitterTaxId: varchar('emitter_tax_id', { length: 14 }).notNull(),
    /** ⚠️ `text`, como `nfe_products.code`: truncar aqui e comparar inteiro no join da ocupação
     * fazia a caixa medida existir e nunca alcançar viagem nenhuma, calada. */
    productCode: text('product_code').notNull(),
    commercialUnit: text('commercial_unit').notNull(),
    description: text().notNull().default(''),
    /**
     * Quantas unidades comerciais cabem na caixa. `1` quando `uCom` já é a embalagem (`CX24`); o
     * conferente informa o resto — sem isto, 480 `UN` multiplicavam a caixa master por 480.
     */
    unitsPerBox: integer('units_per_box').notNull().default(1),
    /** GTIN-14 da caixa: alias **global**, presente em so 11% delas. Complementa a chave. */
    cartonGtin: varchar('carton_gtin', { length: 14 }),
    lengthMm: integer('length_mm'),
    widthMm: integer('width_mm'),
    heightMm: integer('height_mm'),
    grossWeightGrams: integer('gross_weight_grams'),
    /**
     * Spec 094: como a caixa **pode** ser posicionada. Os quatro são `null` até alguém informar, e
     * `null` é "não sei" — nunca "pode".
     *
     * ⚠️ A diferença importa no desenho: com `is_stackable = null` a planta empilha e **marca o
     * arranjo como presumido**; com `false` ela não empilha e não marca, porque a restrição é
     * conhecida. Tratar ausência como permissão apagaria a diferença entre uma carga que alguém
     * conferiu e uma que ninguém olhou.
     */
    isStackable: boolean('is_stackable'),
    /** Quantas cabem na pilha. `null` com `is_stackable` verdadeiro é "empilha, não sei quantas". */
    maxStackCount: integer('max_stack_count'),
    isFragile: boolean('is_fragile'),
    /** "Este lado para cima": a caixa não pode ser deitada para caber melhor. */
    keepUpright: boolean('keep_upright'),
    measuredAt: timestamp('measured_at', { withTimezone: true }),
    /**
     * Spec 152 (D13–D19, experimental): de onde veio a ultima medida gravada. `null` em toda caixa
     * medida antes desta spec — o R5 grava `typed` a partir daqui, nunca reescreve o historico.
     */
    measurementSource: varchar('measurement_source', {
      length: 16,
    }).$type<PackageBoxMeasurementSource>(),
    /** A maior das tres margens da ultima medida por camera (D17). `null` em medida `typed`. */
    measurementMarginMm: integer('measurement_margin_mm'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * Identidade em dois eixos (spec 155): (1) família de variação — `(emitente, prefixo, uCom)`
     * da descrição é replicável (mesma caixa física, sabores diferentes); (2) grupo de embalagem —
     * `(emitente, cProd)` agrupa só a tela, nunca replica dimensão entre unidades diferentes.
     */
    unique('nfe_package_boxes_identity_unique').on(
      table.companyId,
      table.emitterTaxId,
      table.productCode,
      table.commercialUnit,
    ),
    /** Alvo da FK composta de `nfe_package_box_measurements` — o historico so referencia caixa da mesma empresa. */
    unique('nfe_package_boxes_company_id_id_unique').on(table.companyId, table.id),
    check('nfe_package_boxes_units_per_box_check', sql`${table.unitsPerBox} > 0`),
    /**
     * Pilha de zero não existe, e pilha declarada em caixa que não empilha é contradição — a
     * primeira coisa que alguém digita errado num formulário com quatro campos novos.
     */
    check(
      'nfe_package_boxes_stack_check',
      sql`(${table.maxStackCount} is null or ${table.maxStackCount} > 0) and (${table.maxStackCount} is null or ${table.isStackable} is not false)`,
    ),
    check(
      'nfe_package_boxes_dimensions_check',
      sql`(${table.lengthMm} is null or (${table.lengthMm} > 0 and ${table.lengthMm} <= 6000)) and (${table.widthMm} is null or (${table.widthMm} > 0 and ${table.widthMm} <= 3000)) and (${table.heightMm} is null or (${table.heightMm} > 0 and ${table.heightMm} <= 3000)) and (${table.grossWeightGrams} is null or (${table.grossWeightGrams} > 0 and ${table.grossWeightGrams} <= 2000000))`,
    ),
    /** Medida pela metade nao mede nada: ou as tres dimensoes, ou nenhuma. */
    check(
      'nfe_package_boxes_dimensions_together_check',
      sql`(${table.lengthMm} is null and ${table.widthMm} is null and ${table.heightMm} is null) or (${table.lengthMm} is not null and ${table.widthMm} is not null and ${table.heightMm} is not null)`,
    ),
    check(
      'nfe_package_boxes_measured_at_check',
      sql`(${table.lengthMm} is null) = (${table.measuredAt} is null)`,
    ),
    check(
      'nfe_package_boxes_measurement_source_check',
      sql`${table.measurementSource} is null or ${table.measurementSource} in ('typed', 'camera', 'camera_adjusted', 'replicated')`,
    ),
    check(
      'nfe_package_boxes_measurement_margin_check',
      sql`${table.measurementMarginMm} is null or (${table.measurementMarginMm} >= 0 and ${table.measurementMarginMm} <= 3000)`,
    ),
    /** Origem gravada sem medida seria uma proveniência que não descreve nada. */
    check(
      'nfe_package_boxes_measurement_source_pairing_check',
      sql`${table.measurementSource} is null or ${table.lengthMm} is not null`,
    ),
    /** `typed` e `replicated` não carregam margem — margem é só do que a câmera propôs. */
    check(
      'nfe_package_boxes_measurement_margin_pairing_check',
      sql`${table.measurementSource} not in ('typed', 'replicated') or ${table.measurementMarginMm} is null`,
    ),
    index('nfe_package_boxes_company_pending_idx')
      .on(table.companyId)
      .where(sql`${table.lengthMm} is null`),
    index('nfe_package_boxes_company_gtin_idx')
      .on(table.companyId, table.cartonGtin)
      .where(sql`${table.cartonGtin} is not null`),
    index('nfe_package_boxes_company_measured_idx')
      .on(table.companyId)
      .where(sql`${table.measuredAt} is not null`),
  ],
)

/**
 * Codigos fechados de D9 — motivo de imprecisao mostrado na tela, sempre com texto e icone.
 * `markerAtEdge` fica fora de proposito (tasks.md T6): e codigo interno do motor de medida,
 * ainda sem lugar decidido no enum publico ate a validacao com caixas reais (T15) dizer se ele
 * vira aviso de tela ou fica so no log do motor.
 */
export const PACKAGE_BOX_MEASUREMENT_WARNINGS = [
  'markerNotFound',
  'markerTooSmall',
  'steepAngle',
  'lowLight',
  'blurry',
  'boxOutOfFrame',
  'unstable',
] as const
export type PackageBoxMeasurementWarning = (typeof PACKAGE_BOX_MEASUREMENT_WARNINGS)[number]

/**
 * Historico append-only da medida de uma caixa (spec 152, D13–D17, experimental). Nenhuma rota
 * atualiza ou apaga linha aqui — cada tentativa de medir (digitada, pela camera ou ajustada) vira
 * uma linha nova, ao lado da que `nfe_package_boxes.length_mm`/etc. grava por cima. O `proposed_*`
 * guarda o que o motor de camera sugeriu (D17), para a validacao da Fase 7 comparar com o gravado
 * mesmo quando o conferente editou o campo antes de salvar.
 *
 * ⚠️ `measured_by_user_id` **nao** tem FK para `user_company_memberships` (assimetria deliberada,
 * revisao do architect da T2): `removeMembership` (spec 149) faz DELETE fisico da linha de
 * membership, e aqui RESTRICT quebraria a remocao do conferente e SET NULL/CASCADE apagaria o ator
 * do registro de auditoria. O isolamento por empresa continua garantido pela FK composta
 * `(company_id, package_box_id)` abaixo — o ator e so um dado guardado, nao um vinculo referencial.
 */
export const nfePackageBoxMeasurements = pgTable(
  'nfe_package_box_measurements',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    packageBoxId: uuid('package_box_id').notNull(),
    source: varchar('source', { length: 16 }).$type<PackageBoxMeasurementSource>().notNull(),
    lengthMm: integer('length_mm').notNull(),
    widthMm: integer('width_mm').notNull(),
    heightMm: integer('height_mm').notNull(),
    lengthMarginMm: integer('length_margin_mm'),
    widthMarginMm: integer('width_margin_mm'),
    heightMarginMm: integer('height_margin_mm'),
    /** Codigos de D9, guardados por valor — sem FK para um catalogo. */
    warnings: varchar('warnings', { length: 32 }).array().notNull().default([]),
    impreciseConfirmed: boolean('imprecise_confirmed').notNull().default(false),
    engine: varchar('engine', { length: 32 }),
    /** D17: a proposta do motor de camera antes de qualquer edicao. `null` quando `source = typed`. */
    proposedLengthMm: integer('proposed_length_mm'),
    proposedWidthMm: integer('proposed_width_mm'),
    proposedHeightMm: integer('proposed_height_mm'),
    measuredByUserId: uuid('measured_by_user_id').notNull(),
    /** Spec 155 (D6): a caixa de onde a medida foi copiada. Só existe com `source = replicated`. */
    replicatedFromBoxId: uuid('replicated_from_box_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.packageBoxId],
      foreignColumns: [nfePackageBoxes.companyId, nfePackageBoxes.id],
      name: 'nfe_package_box_measurements_company_package_box_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** Composta pelo mesmo motivo da FK acima: a origem da réplica nunca é caixa de outra empresa. */
    foreignKey({
      columns: [table.companyId, table.replicatedFromBoxId],
      foreignColumns: [nfePackageBoxes.companyId, nfePackageBoxes.id],
      name: 'nfe_package_box_measurements_company_replicated_from_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_package_box_measurements_source_check',
      sql`${table.source} in ('typed', 'camera', 'camera_adjusted', 'replicated')`,
    ),
    /** Réplica sem origem não é auditável, e origem em medida que não é réplica não descreve nada. */
    check(
      'nfe_package_box_measurements_replicated_from_check',
      sql`(${table.source} = 'replicated') = (${table.replicatedFromBoxId} is not null)`,
    ),
    check(
      'nfe_package_box_measurements_dimensions_check',
      sql`${table.lengthMm} > 0 and ${table.lengthMm} <= 6000 and ${table.widthMm} > 0 and ${table.widthMm} <= 3000 and ${table.heightMm} > 0 and ${table.heightMm} <= 3000`,
    ),
    check(
      'nfe_package_box_measurements_margin_range_check',
      sql`(${table.lengthMarginMm} is null or (${table.lengthMarginMm} >= 0 and ${table.lengthMarginMm} <= 3000)) and (${table.widthMarginMm} is null or (${table.widthMarginMm} >= 0 and ${table.widthMarginMm} <= 3000)) and (${table.heightMarginMm} is null or (${table.heightMarginMm} >= 0 and ${table.heightMarginMm} <= 3000))`,
    ),
    /** `typed` e `replicated` não têm margem, proposta nem motor — só existem quando a câmera participou. */
    check(
      'nfe_package_box_measurements_typed_pairing_check',
      sql`${table.source} not in ('typed', 'replicated') or (${table.lengthMarginMm} is null and ${table.widthMarginMm} is null and ${table.heightMarginMm} is null and ${table.proposedLengthMm} is null and ${table.proposedWidthMm} is null and ${table.proposedHeightMm} is null and ${table.engine} is null)`,
    ),
    /** `camera`/`camera_adjusted` sempre sabem qual motor mediu — nunca proposta sem autor. */
    check(
      'nfe_package_box_measurements_camera_engine_check',
      sql`${table.source} in ('typed', 'replicated') or ${table.engine} is not null`,
    ),
    check(
      'nfe_package_box_measurements_warnings_domain_check',
      sql`${table.warnings} <@ ARRAY[${sql.join(
        PACKAGE_BOX_MEASUREMENT_WARNINGS.map((warning) => sql`${warning}`),
        sql`, `,
      )}]::varchar(32)[]`,
    ),
    /** Historico e o export (T5) leem por empresa + caixa, mais recente primeiro. */
    index('nfe_package_box_measurements_company_package_box_idx').on(
      table.companyId,
      table.packageBoxId,
      table.createdAt.desc(),
    ),
    /** O export (T5) pagina pelo período, por empresa, sem filtrar por caixa. */
    index('nfe_package_box_measurements_company_created_idx').on(
      table.companyId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
)

export const nfeProducts = pgTable(
  'nfe_products',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    documentId: uuid('document_id').notNull(),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    code: text().notNull(),
    description: text().notNull(),
    ncm: text().notNull(),
    cfop: text().notNull(),
    commercialUnit: text('commercial_unit').notNull(),
    quantity: decimalColumn('quantity').notNull(),
    unitValue: decimalColumn('unit_value').notNull(),
    totalValue: decimalColumn('total_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfe_products_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_products_values_check',
      sql`${table.ordinal} > 0 and ${table.quantity} >= 0 and ${table.unitValue} >= 0 and ${table.totalValue} >= 0`,
    ),
    index('nfe_products_company_document_idx').on(table.companyId, table.documentId),
  ],
)

export const nfeEvents = pgTable(
  'nfe_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    targetAccessKey: text('target_access_key').notNull(),
    eventType: text('event_type').notNull(),
    eventSequence: bigint('event_sequence', { mode: 'bigint' }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    xmlObjectId: uuid('xml_object_id').notNull(),
    sourceNsu: text('source_nsu'),
    environment: text().$type<NfeFiscalEnvironment>(),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    statusCode: varchar('status_code', { length: 3 }),
    protocol: varchar({ length: 20 }),
    correctionText: text('correction_text'),
    importId: uuid('import_id'),
    origin: varchar({ length: 16 }).$type<NfeEventOrigin>(),
    actorUserId: uuid('actor_user_id'),
    requestedByUserId: uuid('requested_by_user_id'),
    documentStatusBefore: varchar('document_status_before', {
      length: 16,
    }).$type<NfeDocumentStatus>(),
    documentStatusAfter: varchar('document_status_after', {
      length: 16,
    }).$type<NfeDocumentStatus>(),
  },
  (table) => [
    unique('nfe_events_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_events_company_access_key_type_sequence_unique').on(
      table.companyId,
      table.targetAccessKey,
      table.eventType,
      table.eventSequence,
    ),
    uniqueIndex('nfe_events_company_environment_source_nsu_unique')
      .on(table.companyId, table.environment, table.sourceNsu)
      .where(sql`${table.sourceNsu} is not null`),
    foreignKey({
      columns: [table.companyId, table.xmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfe_events_company_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_events_access_key_check',
      sql`${table.targetAccessKey} ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'`,
    ),
    check('nfe_events_sequence_check', sql`${table.eventSequence} > 0`),
    check(
      'nfe_events_distribution_source_presence_check',
      sql`(${table.sourceNsu} is null) = (${table.environment} is null)`,
    ),
    check(
      'nfe_events_source_nsu_check',
      sql`${table.sourceNsu} is null or ${table.sourceNsu} ~ '^[0-9]{15}$'`,
    ),
    check(
      'nfe_events_environment_check',
      sql`${table.environment} is null or ${table.environment} in ('homologation', 'production')`,
    ),
    foreignKey({
      columns: [table.companyId, table.importId],
      foreignColumns: [nfeImports.companyId, nfeImports.id],
      name: 'nfe_events_company_import_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_events_status_code_check',
      sql`${table.statusCode} is null or ${table.statusCode} ~ '^[0-9]{3}$'`,
    ),
    // Sem retEvento o nProt é o da NF-e, não o do evento; regex aqui derrubaria a importação.
    check(
      'nfe_events_protocol_check',
      sql`${table.protocol} is null or ${table.statusCode} is not null`,
    ),
    check(
      'nfe_events_correction_text_check',
      sql`${table.correctionText} is null or (${table.eventType} = '110110' and char_length(${table.correctionText}) between 1 and 1000)`,
    ),
    check(
      'nfe_events_origin_check',
      sql`${table.origin} is null or ${table.origin} in ('manual', 'automatic')`,
    ),
    check(
      'nfe_events_origin_actor_check',
      sql`(${table.origin} is null and ${table.actorUserId} is null and ${table.requestedByUserId} is null) or (${table.origin} = 'manual' and ${table.actorUserId} is not null and ${table.requestedByUserId} is null) or (${table.origin} = 'automatic' and ${table.actorUserId} is null)`,
    ),
    check(
      'nfe_events_origin_import_check',
      sql`(${table.origin} is null) = (${table.importId} is null)`,
    ),
    check(
      'nfe_events_document_status_check',
      sql`(${table.documentStatusBefore} is null or ${table.documentStatusBefore} in ('authorized', 'cancelled', 'denied', 'unsigned')) and (${table.documentStatusAfter} is null or ${table.documentStatusAfter} in ('authorized', 'cancelled', 'denied', 'unsigned'))`,
    ),
    check(
      'nfe_events_document_status_pair_check',
      sql`(${table.documentStatusBefore} is null) = (${table.documentStatusAfter} is null)`,
    ),
    check(
      'nfe_events_document_status_transition_check',
      sql`${table.documentStatusBefore} is null or ${table.documentStatusBefore} = ${table.documentStatusAfter} or (${table.documentStatusBefore}, ${table.documentStatusAfter}) in (('authorized', 'cancelled'), ('unsigned', 'cancelled'), ('unsigned', 'denied'))`,
    ),
  ],
)

// Ator e solicitante sem FK: o vínculo é apagado fisicamente e a trilha não pode travar nem sumir.
export const nfeDocumentStatusChanges = pgTable(
  'nfe_document_status_changes',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    documentId: uuid('document_id').notNull(),
    statusBefore: varchar('status_before', { length: 16 }).$type<NfeDocumentStatus>().notNull(),
    statusAfter: varchar('status_after', { length: 16 }).$type<NfeDocumentStatus>().notNull(),
    cause: varchar({ length: 16 }).$type<NfeDocumentStatusChangeCause>().notNull(),
    eventId: uuid('event_id'),
    importId: uuid('import_id'),
    origin: varchar({ length: 16 }).$type<NfeEventOrigin>(),
    actorUserId: uuid('actor_user_id'),
    requestedByUserId: uuid('requested_by_user_id'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_document_status_changes_company_id_id_unique').on(table.companyId, table.id),
    // Destinos terminais e sem rebaixamento: cada destino só é alcançado uma vez (D7).
    unique('nfe_document_status_changes_document_target_unique').on(
      table.companyId,
      table.documentId,
      table.statusAfter,
    ),
    index('nfe_document_status_changes_company_document_changed_id_idx').on(
      table.companyId,
      table.documentId,
      table.changedAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfe_document_status_changes_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.eventId],
      foreignColumns: [nfeEvents.companyId, nfeEvents.id],
      name: 'nfe_document_status_changes_company_event_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.importId],
      foreignColumns: [nfeImports.companyId, nfeImports.id],
      name: 'nfe_document_status_changes_company_import_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_document_status_changes_status_check',
      sql`${table.statusBefore} in ('authorized', 'cancelled', 'denied', 'unsigned') and ${table.statusAfter} in ('authorized', 'cancelled', 'denied', 'unsigned')`,
    ),
    check(
      'nfe_document_status_changes_transition_check',
      sql`(${table.statusBefore}, ${table.statusAfter}) in (('authorized', 'cancelled'), ('unsigned', 'cancelled'), ('unsigned', 'denied'))`,
    ),
    check(
      'nfe_document_status_changes_cause_check',
      sql`${table.cause} in ('event', 'summary', 'document_insert')`,
    ),
    check(
      'nfe_document_status_changes_event_presence_check',
      sql`(${table.cause} = 'summary') = (${table.eventId} is null)`,
    ),
    check(
      'nfe_document_status_changes_origin_check',
      sql`${table.origin} is null or ${table.origin} in ('manual', 'automatic')`,
    ),
    check(
      'nfe_document_status_changes_origin_actor_check',
      sql`(${table.origin} is null and ${table.actorUserId} is null and ${table.requestedByUserId} is null) or (${table.origin} = 'manual' and ${table.actorUserId} is not null and ${table.requestedByUserId} is null) or (${table.origin} = 'automatic' and ${table.actorUserId} is null)`,
    ),
    check(
      'nfe_document_status_changes_origin_import_check',
      sql`(${table.origin} is null) = (${table.importId} is null)`,
    ),
  ],
)

export const nfeDistributionCursors = pgTable(
  'nfe_distribution_cursors',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    environment: text().$type<NfeFiscalEnvironment>().notNull(),
    ultNsu: text('ult_nsu').notNull().default('000000000000000'),
    maxNsu: text('max_nsu').notNull().default('000000000000000'),
    nextAllowedAt: timestamp('next_allowed_at', { withTimezone: true }),
    consecutiveRateLimits: integer('consecutive_rate_limits').notNull().default(0),
    lastSkippedFromNsu: text('last_skipped_from_nsu'),
    lastSkippedToNsu: text('last_skipped_to_nsu'),
    lastSkippedAt: timestamp('last_skipped_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.environment],
      name: 'nfe_distribution_cursors_company_environment_pk',
    }),
    check(
      'nfe_distribution_cursors_environment_check',
      sql`${table.environment} in ('homologation', 'production')`,
    ),
    check('nfe_distribution_cursors_ult_nsu_check', sql`${table.ultNsu} ~ '^[0-9]{15}$'`),
    check('nfe_distribution_cursors_max_nsu_check', sql`${table.maxNsu} ~ '^[0-9]{15}$'`),
    check(
      'nfe_distribution_cursors_monotonic_check',
      sql`${table.ultNsu}::numeric <= ${table.maxNsu}::numeric`,
    ),
    check('nfe_distribution_cursors_version_check', sql`${table.version} > 0`),
    check(
      'nfe_distribution_cursors_lease_check',
      sql`(${table.leaseOwner} is null) = (${table.leaseExpiresAt} is null)`,
    ),
  ],
)
