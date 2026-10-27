/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_ADDRESS_PATTERN,
  DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS,
  DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_PURPOSES,
  type DeliveryClientEmailAuthorKind,
  type DeliveryClientEmailPurpose,
} from '../shared/delivery-client-email.constant.js'
import { deliveryClients } from './delivery-client.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * Spec 279 D1: os e-mails do cliente de entrega, **por tipo** (`purpose`). Tabela genérica — o boleto é
 * só o primeiro tipo lido por um envio; os outros tipos de ocorrência apontam para o tipo que lhes cabe,
 * sem tabela nova. Um mesmo endereço pode estar em mais de um tipo; no mesmo tipo, nunca duas vezes
 * (sem distinguir caixa).
 *
 * ⚠️ `address` em claro só aqui e no corpo do POST: resposta, log e evento levam a forma mascarada
 * (`maskEmailAddress`). O limite de 10 por tipo (D2) é da API, não do banco.
 */
export const deliveryClientEmails = pgTable(
  'delivery_client_emails',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: text('tax_id').notNull(),
    purpose: text().$type<DeliveryClientEmailPurpose>().notNull(),
    address: text().notNull(),
    label: text().notNull().default(''),
    createdByKind: text('created_by_kind').$type<DeliveryClientEmailAuthorKind>().notNull(),
    /** Referência, não FK: o motorista e o operador são usuários, e o cadastro sobrevive a quem o fez. */
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.taxId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.taxId],
      name: 'delivery_client_emails_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    uniqueIndex('delivery_client_emails_client_purpose_address_unique').on(
      table.companyId,
      table.taxId,
      table.purpose,
      sql`lower(${table.address})`,
    ),
    index('delivery_client_emails_client_purpose_idx').on(
      table.companyId,
      table.taxId,
      table.purpose,
    ),
    check(
      'delivery_client_emails_purpose_check',
      sql`${table.purpose} in (${sql.raw(inList(DELIVERY_CLIENT_EMAIL_PURPOSES))})`,
    ),
    check(
      'delivery_client_emails_address_check',
      sql`length(${table.address}) <= ${sql.raw(String(DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH))} and ${table.address} ~ ${sql.raw(`'${DELIVERY_CLIENT_EMAIL_ADDRESS_PATTERN}'`)}`,
    ),
    check(
      'delivery_client_emails_label_check',
      sql`length(${table.label}) <= ${sql.raw(String(DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH))}`,
    ),
    check(
      'delivery_client_emails_created_by_kind_check',
      sql`${table.createdByKind} in (${sql.raw(inList(DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS))})`,
    ),
  ],
)
