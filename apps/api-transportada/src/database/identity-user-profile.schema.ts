/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { identityUsers } from './identity.schema.js'

/**
 * Nome e contato do usuário não cabem em `identity_users` nem em `user_invitations` — as duas
 * tabelas têm a lista de colunas travada por teste de contrato. Tabela nova e aditiva guarda o
 * que a listagem de administração precisa mostrar (nome, contato mascarado) sem tocar nelas.
 */
export const CONTACT_CHANNELS = ['email', 'sms', 'whatsapp'] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]

const CONTACT_CHANNEL_LIST = sql.raw(CONTACT_CHANNELS.map((channel) => `'${channel}'`).join(', '))

export const identityUserProfiles = pgTable(
  'identity_user_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => identityUsers.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    name: text().notNull(),
    /** O login que a pessoa digita. Nasce igual ao `user_id` e o administrador pode trocar. */
    username: text().notNull(),
    contactChannel: text('contact_channel').$type<ContactChannel>().notNull(),
    contactAddress: text('contact_address').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'identity_user_profiles_contact_channel_check',
      sql`${table.contactChannel} in (${CONTACT_CHANNEL_LIST})`,
    ),
    check('identity_user_profiles_name_not_blank_check', sql`length(trim(${table.name})) > 0`),
    check(
      'identity_user_profiles_contact_address_not_blank_check',
      sql`length(trim(${table.contactAddress})) > 0`,
    ),
    /** Unicidade no realm inteiro, como no Keycloak: o login não é por empresa. */
    unique('identity_user_profiles_username_key').on(table.username),
  ],
)
