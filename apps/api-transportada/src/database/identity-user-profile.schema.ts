/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

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
    /**
     * Identidade da pessoa, independente do canal por onde o convite saiu: quem entra como Fiscal
     * ou Financeiro também tem e-mail, telefone e CPF, e nenhum deles é motorista.
     *
     * O CPF é o mesmo dado de `fleet_drivers.tax_id` e usa o mesmo nome e o mesmo formato de
     * propósito — é por ele que o convite acha a ficha de frota já existente.
     */
    email: text().notNull().default(''),
    phone: text().notNull().default(''),
    taxId: text('tax_id').notNull().default(''),
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
    /**
     * Realm inteiro, não por empresa: a mesma pessoa em duas empresas é um `identity_user` só, e
     * dois CPFs iguais aqui seriam duas identidades para a mesma pessoa. Parcial porque a coluna
     * admite vazio — usuário sem CPF cadastrado não colide com outro.
     */
    uniqueIndex('identity_user_profiles_tax_id_unique')
      .on(table.taxId)
      .where(sql`length(${table.taxId}) > 0`),
    check(
      'identity_user_profiles_tax_id_check',
      sql`length(${table.taxId}) = 0 or ${table.taxId} ~ '^[0-9]{11}$'`,
    ),
  ],
)
