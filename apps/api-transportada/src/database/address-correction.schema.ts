/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { contractors } from './delivery-client.schema.js'
import { contractorMailThreads } from './contractor-mail.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * Spec 150 (RF1/RF2): o pedido de correção de endereço à contratante. **Um pedido, não uma edição
 * da nota** — `nfe_addresses` e o XML original continuam intactos, e esta tabela guarda o endereço
 * **como veio** (copiado do banco, nunca do cliente) ao lado do **proposto** e do **motivo** da
 * suspeita, para o e-mail (RF11) e para o relatório poderem mostrar os dois lado a lado.
 *
 * `status` acompanha o envio: `draft` enquanto o operador ainda edita, `sent` depois do e-mail
 * (T304). Um rascunho por endereço — salvar de novo **atualiza** o rascunho existente, nunca cria
 * outro, por isso o único parcial é `where status = 'draft'` em vez de cobrir a chave inteira.
 */
export const ADDRESS_CORRECTION_REQUEST_STATUSES = ['draft', 'sent'] as const
export type AddressCorrectionRequestStatus = (typeof ADDRESS_CORRECTION_REQUEST_STATUSES)[number]

export const addressCorrectionRequests = pgTable(
  'address_correction_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    /** Resolvido no servidor pelo CNPJ do emitente (RF4), nunca pelo payload do cliente. */
    contractorId: uuid('contractor_id').notNull(),
    /** A mesma chave do relatório: `cityCode|postalCode|number`. */
    addressKey: varchar('address_key', { length: 255 }).notNull(),

    /** O endereço **como veio** na nota — copiado do banco no momento do rascunho (RF2). */
    reportedStreet: varchar('reported_street', { length: 255 }).notNull(),
    reportedNumber: varchar('reported_number', { length: 20 }).notNull(),
    reportedComplement: varchar('reported_complement', { length: 255 }),
    reportedDistrict: varchar('reported_district', { length: 255 }),
    reportedCityCode: varchar('reported_city_code', { length: 7 }).notNull(),
    reportedCity: varchar('reported_city', { length: 255 }).notNull(),
    reportedState: varchar('reported_state', { length: 2 }).notNull(),
    reportedPostalCode: varchar('reported_postal_code', { length: 8 }).notNull(),

    /** O endereço **proposto** pelo operador (RF1/RF3), validado na fronteira antes de chegar aqui. */
    proposedStreet: varchar('proposed_street', { length: 255 }).notNull(),
    proposedNumber: varchar('proposed_number', { length: 20 }).notNull(),
    proposedComplement: varchar('proposed_complement', { length: 255 }),
    proposedDistrict: varchar('proposed_district', { length: 255 }),
    proposedCityCode: varchar('proposed_city_code', { length: 7 }).notNull(),
    proposedCity: varchar('proposed_city', { length: 255 }).notNull(),
    proposedState: varchar('proposed_state', { length: 2 }).notNull(),
    proposedPostalCode: varchar('proposed_postal_code', { length: 8 }).notNull(),

    /** O motivo da suspeita (RF2/RF11), lido do relatório no momento do rascunho. */
    reasonMatchLevel: varchar('reason_match_level', { length: 32 }).notNull(),
    reasonDistanceMetres: numeric('reason_distance_metres', { precision: 12, scale: 2 }),

    /** RF11: nome do destinatário da nota mais recente da chave, para o e-mail nomear o bloco. */
    recipientName: varchar('recipient_name', { length: 255 }),

    status: varchar({ length: 16 })
      .$type<AddressCorrectionRequestStatus>()
      .notNull()
      .default('draft'),
    /** A conversa do envio (RF6), só existe depois do `POST /address-correction-requests/mail`. */
    threadId: uuid('thread_id'),
    actorUserId: uuid('actor_user_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'address_correction_requests_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'address_correction_requests_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.threadId],
      foreignColumns: [contractorMailThreads.companyId, contractorMailThreads.id],
      name: 'address_correction_requests_thread_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** Um rascunho por endereço — salvar de novo atualiza este, nunca cria outro (RF2). */
    uniqueIndex('address_correction_requests_company_address_draft_unique')
      .on(table.companyId, table.addressKey)
      .where(sql`${table.status} = 'draft'`),
    index('address_correction_requests_company_contractor_status_idx').on(
      table.companyId,
      table.contractorId,
      table.status,
    ),
    check(
      'address_correction_requests_status_check',
      sql`${table.status} in (${sql.raw(inList(ADDRESS_CORRECTION_REQUEST_STATUSES))})`,
    ),
    check(
      'address_correction_requests_distance_check',
      sql`${table.reasonDistanceMetres} is null or ${table.reasonDistanceMetres} >= 0`,
    ),
  ],
)
