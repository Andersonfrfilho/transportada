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
  varchar,
} from 'drizzle-orm/pg-core'

import {
  DELIVERY_CLIENT_CONTACT_CHANNEL,
  DELIVERY_CLIENT_CONTACT_CHANNEL_DEFAULT,
  DELIVERY_CLIENT_CONTACT_CHANNELS,
  DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_ADDRESS_PATTERN,
  DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS,
  DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_PURPOSES,
  DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN,
  type DeliveryClientContactChannel,
  type DeliveryClientEmailAuthorKind,
  type DeliveryClientEmailPurpose,
} from '../shared/delivery-client-email.constant.js'
import { deliveryClients } from './delivery-client.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * Spec 279 D1 + spec 281 D12: os contatos do cliente de entrega, **por tipo** (`purpose`) e **por canal** (`channel`:
 * e-mail ou WhatsApp). Nasceu `delivery_client_emails` na 279 e foi renomeada pela 281; as linhas antigas são todas
 * `email`. Um mesmo endereço pode estar em mais de um tipo; no mesmo tipo, nunca duas vezes (sem distinguir caixa) — um
 * e-mail e um número E.164 nunca se confundem, por isso o único não precisa do canal.
 *
 * ⚠️ Enquanto a visão `delivery_client_emails` existir (compatibilidade do deploy, migration
 * `20261027180000_delivery_client_contacts`), quem lê e-mail filtra `channel = 'email'` aqui, nunca lê a visão.
 *
 * ⚠️ `address` em claro só aqui e no corpo do POST: resposta, log e evento levam a forma mascarada
 * (`maskEmailAddress`). O limite de 10 por tipo (D2) é da API, não do banco.
 */
export const deliveryClientContacts = pgTable(
  'delivery_client_contacts',
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
    /** Spec 281 D12: `email` (padrão, todas as linhas da 279) ou `whatsapp` (número E.164). */
    channel: varchar('channel', { length: 16 })
      .$type<DeliveryClientContactChannel>()
      .notNull()
      .default(DELIVERY_CLIENT_CONTACT_CHANNEL_DEFAULT),
    /**
     * Spec 281 D13: a ocorrência em que o contato foi informado; nula quando veio do cadastro do cliente. Referência,
     * não FK, como `created_by_user_id`: a ocorrência é de nota ou de parada, e o contato sobrevive a ela.
     */
    sourceOccurrenceId: uuid('source_occurrence_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.taxId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.taxId],
      name: 'delivery_client_contacts_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    uniqueIndex('delivery_client_contacts_client_purpose_address_unique').on(
      table.companyId,
      table.taxId,
      table.purpose,
      sql`lower(${table.address})`,
    ),
    index('delivery_client_contacts_client_purpose_idx').on(
      table.companyId,
      table.taxId,
      table.purpose,
    ),
    check(
      'delivery_client_contacts_purpose_check',
      sql`${table.purpose} in (${sql.raw(inList(DELIVERY_CLIENT_EMAIL_PURPOSES))})`,
    ),
    check(
      'delivery_client_contacts_channel_check',
      sql`${table.channel} in (${sql.raw(inList(DELIVERY_CLIENT_CONTACT_CHANNELS))})`,
    ),
    check(
      'delivery_client_contacts_address_check',
      sql`(${table.channel} = ${sql.raw(`'${DELIVERY_CLIENT_CONTACT_CHANNEL.EMAIL}'`)} and length(${table.address}) <= ${sql.raw(String(DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH))} and ${table.address} ~ ${sql.raw(`'${DELIVERY_CLIENT_EMAIL_ADDRESS_PATTERN}'`)}) or (${table.channel} = ${sql.raw(`'${DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP}'`)} and ${table.address} ~ ${sql.raw(`'${DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN}'`)})`,
    ),
    check(
      'delivery_client_contacts_label_check',
      sql`length(${table.label}) <= ${sql.raw(String(DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH))}`,
    ),
    check(
      'delivery_client_contacts_created_by_kind_check',
      sql`${table.createdByKind} in (${sql.raw(inList(DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS))})`,
    ),
  ],
)
