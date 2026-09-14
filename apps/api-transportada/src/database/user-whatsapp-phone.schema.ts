/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS } from '../whatsapp-commands/domain/whatsapp-phone-verification.constant.js'
import { WHATSAPP_PHONE_PATTERN } from '../whatsapp-commands/domain/whatsapp-phone.policy.js'
import { companies, identityUsers, userCompanyMemberships } from './identity.schema.js'

const WHATSAPP_PHONE_PATTERN_LITERAL = sql.raw(`'${WHATSAPP_PHONE_PATTERN.source}'`)

/**
 * O número como credencial, e não `login_identifiers`: aquela é projeção reconstruída por delete +
 * insert a cada gravação da ficha, e o `verified_at` sumiria na próxima edição (spec 144 D1, A1).
 *
 * Sem `company_id`: a instalação é de uma transportadora (ADR-0021) e o número identifica a pessoa,
 * não o vínculo — quem decide a empresa é o canal que recebeu a mensagem.
 */
export const userWhatsAppPhones = pgTable(
  'user_whatsapp_phones',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    phone: text().notNull(),
    /**
     * Spec 144 T005b B3: `55` + DDD + os oito últimos dígitos — as duas grafias do nono dígito numa
     * chave só. Mesma conta de `toWhatsAppPhoneKey`, que o limitador do despachante usa.
     */
    phoneKey: text('phone_key')
      .notNull()
      .generatedAlwaysAs(sql`left("phone", 4) || right("phone", 8)`),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [identityUsers.id],
      name: 'user_whatsapp_phones_user_id_identity_users_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('user_whatsapp_phones_user_id_unique').on(table.userId),
    /** Declarado não é credencial: só o verificado precisa ser de uma pessoa só — nas duas grafias. */
    uniqueIndex('user_whatsapp_phones_phone_key_verified_unique')
      .on(table.phoneKey)
      .where(sql`${table.verifiedAt} is not null`),
    check(
      'user_whatsapp_phones_phone_check',
      sql`${table.phone} ~ ${WHATSAPP_PHONE_PATTERN_LITERAL}`,
    ),
  ],
)

/**
 * Molde de `password_reset_requests`, **sem** unique de `code_hash`: seis dígitos são um milhão de
 * códigos, e lá o unique existe porque a rota é anônima. Aqui a confirmação chega pelo `from` da
 * mensagem, e a busca é pelo pedido vivo daquele número dentro da empresa do canal.
 *
 * Sem coluna de situação: vivo é `consumed_at` nulo, e `expires_at` a policy confere.
 */
export const whatsAppPhoneVerificationRequests = pgTable(
  'whatsapp_phone_verification_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    /** O número declarado no painel, canônico. É contra ele que o `from` é comparado. */
    phone: text().notNull(),
    /** SHA-256 do código em hexadecimal. O código em claro nunca é persistido. */
    codeHash: text('code_hash').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_phone_verification_requests_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.userId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'whatsapp_phone_verification_requests_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    uniqueIndex('whatsapp_phone_verification_requests_company_id_user_id_live_unique')
      .on(table.companyId, table.userId)
      .where(sql`${table.consumedAt} is null`),
    index('whatsapp_phone_verification_requests_company_id_phone_live_idx')
      .on(table.companyId, table.phone)
      .where(sql`${table.consumedAt} is null`),
    check(
      'whatsapp_phone_verification_requests_phone_check',
      sql`${table.phone} ~ ${WHATSAPP_PHONE_PATTERN_LITERAL}`,
    ),
    check(
      'whatsapp_phone_verification_requests_code_hash_check',
      sql`${table.codeHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'whatsapp_phone_verification_requests_attempt_count_check',
      sql`${table.attemptCount} between 0 and ${sql.raw(String(WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS))}`,
    ),
    check(
      'whatsapp_phone_verification_requests_expires_at_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
)
