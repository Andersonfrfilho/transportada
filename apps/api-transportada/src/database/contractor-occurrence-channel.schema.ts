/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { WHATSAPP_PHONE_PATTERN } from '../whatsapp-commands/domain/whatsapp-phone.policy.js'
import { contractors } from './delivery-client.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/** Spec 318: por onde o aviso automático da ocorrência chega à contratante. `email` é o padrão de hoje. */
export const CONTRACTOR_OCCURRENCE_CHANNELS = ['email', 'whatsapp_group'] as const
export type ContractorOccurrenceChannel = (typeof CONTRACTOR_OCCURRENCE_CHANNELS)[number]

const OCCURRENCE_PHONE_PATTERN_LITERAL = sql.raw(`'${WHATSAPP_PHONE_PATTERN.source}'`)

/**
 * Canal do aviso de ocorrência por contratante (spec 318, RF1). Sem linha, a contratante segue por
 * e-mail como sempre. A linha só sobrepõe o **canal**: quais tipos avisam a contratante e o texto
 * continuam no tipo da ocorrência. `group_jid` e `mention_phone` ficam vazios até a configuração.
 *
 * Um grupo pertence a no máximo uma contratante da empresa; a unicidade contra o grupo de motorista
 * (`fleet_driver_whatsapp_groups`) é cobrada na API (RF5), pois atravessa duas tabelas.
 */
export const contractorOccurrenceChannels = pgTable(
  'contractor_occurrence_channels',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    channel: text('channel').$type<ContractorOccurrenceChannel>().notNull().default('email'),
    groupJid: text('group_jid'),
    groupName: text('group_name').notNull().default(''),
    mentionPhone: text('mention_phone'),
    emailFallback: boolean('email_fallback').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_occurrence_channels_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'contractor_occurrence_channels_company_contractor_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('contractor_occurrence_channels_company_contractor_unique').on(
      table.companyId,
      table.contractorId,
    ),
    unique('contractor_occurrence_channels_company_group_unique').on(
      table.companyId,
      table.groupJid,
    ),
    check(
      'contractor_occurrence_channels_channel_check',
      sql`${table.channel} in (${sql.raw(inList(CONTRACTOR_OCCURRENCE_CHANNELS))})`,
    ),
    check(
      'contractor_occurrence_channels_group_jid_check',
      sql`${table.groupJid} is null or ${table.groupJid} ~ '^[0-9]+(-[0-9]+)?@g\\.us$'`,
    ),
    check(
      'contractor_occurrence_channels_mention_phone_check',
      sql`${table.mentionPhone} is null or ${table.mentionPhone} ~ ${OCCURRENCE_PHONE_PATTERN_LITERAL}`,
    ),
    /** Canal de grupo sem grupo e sem número não tem para onde enviar. */
    check(
      'contractor_occurrence_channels_group_complete_check',
      sql`${table.channel} <> 'whatsapp_group' or (${table.groupJid} is not null and ${table.mentionPhone} is not null)`,
    ),
  ],
)
