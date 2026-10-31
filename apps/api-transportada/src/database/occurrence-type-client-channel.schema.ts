/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF2): a matriz "Retorno ao cliente" do tipo de ocorrência — uma linha por canal (caixa de marcar), com o
 * modo de envio e a chave do modelo do módulo de notificação (sem FK: a identidade do módulo é versionada, como a
 * `contractor_notification_template_key` da 271). Tabela filha no molde de `company_occurrence_type_moments`: canal
 * novo é linha nova, nunca coluna nova no tipo. `client_channel` continua no tipo, derivado desta tabela.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  OCCURRENCE_CLIENT_CHANNEL_SEND_MODE_DEFAULT,
  OCCURRENCE_CLIENT_CHANNEL_SEND_MODES,
  OCCURRENCE_CLIENT_CHANNEL_TEMPLATE_KEY_MAX_LENGTH,
  OCCURRENCE_CLIENT_CHANNELS,
  type OccurrenceClientChannel,
  type OccurrenceClientChannelSendMode,
} from '../shared/occurrence-client-channel.constant.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { companyOccurrenceTypes } from './trip.schema.js'

export const companyOccurrenceTypeClientChannels = pgTable(
  'company_occurrence_type_client_channels',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceTypeId: uuid('occurrence_type_id').notNull(),
    channel: varchar({ length: 16 }).$type<OccurrenceClientChannel>().notNull(),
    enabled: boolean().notNull().default(false),
    sendMode: varchar('send_mode', { length: 16 })
      .$type<OccurrenceClientChannelSendMode>()
      .notNull()
      .default(OCCURRENCE_CLIENT_CHANNEL_SEND_MODE_DEFAULT),
    templateKey: varchar('template_key', {
      length: OCCURRENCE_CLIENT_CHANNEL_TEMPLATE_KEY_MAX_LENGTH,
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_occurrence_type_client_channels_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceTypeId],
      foreignColumns: [companyOccurrenceTypes.companyId, companyOccurrenceTypes.id],
      name: 'company_occurrence_type_client_channels_type_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('company_occurrence_type_client_channels_unique').on(
      table.companyId,
      table.occurrenceTypeId,
      table.channel,
    ),
    check(
      'company_occurrence_type_client_channels_channel_check',
      sql`${table.channel} in (${sql.raw(inList(OCCURRENCE_CLIENT_CHANNELS))})`,
    ),
    check(
      'company_occurrence_type_client_channels_send_mode_check',
      sql`${table.sendMode} in (${sql.raw(inList(OCCURRENCE_CLIENT_CHANNEL_SEND_MODES))})`,
    ),
    check(
      'company_occurrence_type_client_channels_template_key_check',
      sql`${table.templateKey} is null or length(btrim(${table.templateKey})) > 0`,
    ),
  ],
)
