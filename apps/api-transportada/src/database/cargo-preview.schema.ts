/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_PREVIEW_FAILURE_CODES,
  CARGO_PREVIEW_LIMITS,
  CARGO_PREVIEW_SOURCES,
  CARGO_PREVIEW_STATUS,
  CARGO_PREVIEW_STATUSES,
  type CargoPreviewFailureCode,
  type CargoPreviewSource,
  type CargoPreviewStatus,
} from '../shared/cargo-preview.constant.js'
import { cargoArrivals } from './cargo-arrival.schema.js'
import { contractors } from './delivery-client.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const withTimezone = { withTimezone: true } as const

/**
 * Spec 237 Fase 4a (ADR-0094 §3/§7): a planilha de prévia que o contratante manda antes da carga. A
 * API só guarda o arquivo (chave opaca, sem dado pessoal) e enfileira; quem lê e vincula é o worker.
 * `received_at` é o instante em que a prévia chegou ao servidor — o relógio que se compara com o do
 * XML. O mesmo arquivo do mesmo contratante não duplica (`file_sha256`).
 */
export const cargoPreviews = pgTable(
  'cargo_previews',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    source: varchar('source', { length: 16 }).$type<CargoPreviewSource>().notNull(),
    status: varchar('status', { length: 16 })
      .$type<CargoPreviewStatus>()
      .notNull()
      .default(CARGO_PREVIEW_STATUS.queued),
    receivedAt: timestamp('received_at', withTimezone).notNull(),
    fileName: text('file_name').notNull(),
    fileSha256: char('file_sha256', { length: 64 }).notNull(),
    /** O nome do objeto no bucket deriva só deste id e da empresa — nunca do nome do arquivo. */
    fileObjectId: uuid('file_object_id').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    sheetName: text('sheet_name'),
    /** O `RoutingDate` mais frequente da planilha; nulo até a leitura, ou sem data nas linhas. */
    plannedDate: date('planned_date', { mode: 'string' }),
    rowCount: integer('row_count'),
    errorCode: varchar('error_code', { length: 40 }).$type<CargoPreviewFailureCode>(),
    uploadedByUserId: uuid('uploaded_by_user_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    /** sha256 de contratante + arquivo: a mesma chave com outro pedido é reuso, não repetição. */
    requestFingerprint: char('request_fingerprint', { length: 64 }).notNull(),
    /** A chegada registrada a partir desta prévia (RF5b): 1 prévia = 1 chegada. */
    arrivalId: uuid('arrival_id'),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cargo_previews_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'cargo_previews_company_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.uploadedByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cargo_previews_uploaded_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.arrivalId],
      foreignColumns: [cargoArrivals.companyId, cargoArrivals.id],
      name: 'cargo_previews_company_arrival_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_previews_company_id_id_unique').on(table.companyId, table.id),
    unique('cargo_previews_company_contractor_file_unique').on(
      table.companyId,
      table.contractorId,
      table.fileSha256,
    ),
    unique('cargo_previews_company_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    uniqueIndex('cargo_previews_company_arrival_unique')
      .on(table.companyId, table.arrivalId)
      .where(sql`${table.arrivalId} is not null`),
    index('cargo_previews_company_received_idx').on(
      table.companyId,
      table.receivedAt.desc(),
      table.id.desc(),
    ),
    index('cargo_previews_company_contractor_status_idx').on(
      table.companyId,
      table.contractorId,
      table.status,
    ),
    check(
      'cargo_previews_source_check',
      sql`${table.source} in (${raw(inList(CARGO_PREVIEW_SOURCES))})`,
    ),
    check(
      'cargo_previews_status_check',
      sql`${table.status} in (${raw(inList(CARGO_PREVIEW_STATUSES))})`,
    ),
    check(
      'cargo_previews_file_name_check',
      sql`char_length(${table.fileName}) between 1 and ${raw(String(CARGO_PREVIEW_LIMITS.fileNameMaxLength))} and strpos(${table.fileName}, '/') = 0 and strpos(${table.fileName}, chr(92)) = 0`,
    ),
    check('cargo_previews_file_sha256_check', sql`${table.fileSha256} ~ '^[0-9a-f]{64}$'`),
    check('cargo_previews_file_size_bytes_check', sql`${table.fileSizeBytes} > 0`),
    check('cargo_previews_sheet_name_check', sql`char_length(${table.sheetName}) between 1 and 31`),
    check('cargo_previews_row_count_check', sql`${table.rowCount} >= 0`),
    check(
      'cargo_previews_error_code_check',
      sql`${table.errorCode} in (${raw(inList(CARGO_PREVIEW_FAILURE_CODES))})`,
    ),
    /** Falhou ⇔ tem código; e só a prévia lida tem contagem de linhas. */
    check(
      'cargo_previews_failure_shape_check',
      sql`(${table.status} = 'failed') = (${table.errorCode} is not null)`,
    ),
    check(
      'cargo_previews_ready_shape_check',
      sql`(${table.status} = 'ready') = (${table.rowCount} is not null)`,
    ),
    check(
      'cargo_previews_idempotency_key_check',
      sql`char_length(${table.idempotencyKey}) between 16 and 256`,
    ),
    check(
      'cargo_previews_request_fingerprint_check',
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
)
