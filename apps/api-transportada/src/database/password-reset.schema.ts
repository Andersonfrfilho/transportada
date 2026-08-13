/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'

/**
 * Tabela própria, e não um `kind` em `user_invitations`: aquela carrega `superseded`/`revoked` e a
 * semântica de *primeira* senha. Compartilhá-la deixaria um pedido de recuperação capaz de
 * ressuscitar convite revogado — ADR-0030.
 *
 * Não há coluna de situação. O pedido está vivo enquanto `consumed_at` é nulo e `expires_at` não
 * passou; um `status` ao lado seria uma terceira verdade, e as três discordariam no primeiro
 * caminho que esquecesse de atualizá-la.
 */
export const passwordResetRequests = pgTable(
  'password_reset_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    /** SHA-256 do código em hexadecimal. O código em claro nunca é persistido. */
    codeHash: text('code_hash').notNull(),
    /**
     * Envelope de `@adatechnology/secret-envelope` com o código, AAD
     * `transportada:password-reset:v1:${companyId}:${requestId}`. O hash acima é o que valida a
     * tentativa; isto existe só para o worker poder entregar o código, já que hash não se desfaz.
     */
    sealedCode: jsonb('sealed_code').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'password_reset_requests_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    // O alvo é um vínculo daquela empresa por construção: o banco recusa pedido para usuário de
    // outro tenant, sem depender de a query lembrar do filtro.
    foreignKey({
      columns: [table.userId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'password_reset_requests_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('password_reset_requests_company_id_id_unique').on(table.companyId, table.id),
    // A rota de confirmação não é autenticada e não tem empresa no contexto: ela chega ao pedido
    // pelo hash, então o hash precisa ser determinístico no banco inteiro.
    unique('password_reset_requests_code_hash_unique').on(table.codeHash),
    // Pedido novo invalida o anterior — a regra vive no banco, não só no domínio.
    uniqueIndex('password_reset_requests_company_id_user_id_live_unique')
      .on(table.companyId, table.userId)
      .where(sql`${table.consumedAt} is null`),
    index('password_reset_requests_expires_at_idx').on(table.expiresAt),
    check('password_reset_requests_code_hash_check', sql`${table.codeHash} ~ '^[0-9a-f]{64}$'`),
    check('password_reset_requests_attempt_count_check', sql`${table.attemptCount} >= 0`),
    check('password_reset_requests_expires_at_check', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
)

export const PASSWORD_RESET_DELIVERY_EVENT_TYPES = [
  'transportada.identity.password-reset.code.requested',
] as const

const PASSWORD_RESET_DELIVERY_EVENT_TYPE_LIST = sql.raw(
  PASSWORD_RESET_DELIVERY_EVENT_TYPES.map((eventType) => `'${eventType}'`).join(', '),
)

/**
 * Trilho próprio, como o do convite: a `invitation_delivery_outbox` tem FK para `user_invitations`
 * e é outbox de um trilho só.
 *
 * Sem `actor_user_id`: quem pede recuperação não está autenticado, e inventar um ator seria
 * registrar coisa que não aconteceu. O payload carrega **referência** — `requestId` e `userId`; o
 * código vai selado na linha do pedido, nunca no broker (`security.md` §6).
 */
export const passwordResetDeliveryOutbox = pgTable(
  'password_reset_delivery_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    requestId: uuid('request_id').notNull(),
    eventType: text('event_type')
      .$type<(typeof PASSWORD_RESET_DELIVERY_EVENT_TYPES)[number]>()
      .notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'password_reset_delivery_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.requestId, table.companyId],
      foreignColumns: [passwordResetRequests.id, passwordResetRequests.companyId],
      name: 'password_reset_delivery_outbox_request_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('password_reset_delivery_outbox_company_id_event_id_unique').on(
      table.companyId,
      table.eventId,
    ),
    index('password_reset_delivery_outbox_pending_idx').on(
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check('password_reset_delivery_outbox_attempt_check', sql`${table.attempt} >= 0`),
    check('password_reset_delivery_outbox_event_version_check', sql`${table.eventVersion} > 0`),
    check(
      'password_reset_delivery_outbox_event_type_check',
      sql`${table.eventType} in (${PASSWORD_RESET_DELIVERY_EVENT_TYPE_LIST})`,
    ),
    check(
      'password_reset_delivery_outbox_claim_check',
      sql`(${table.claimOwner} is null) = (${table.claimExpiresAt} is null)`,
    ),
  ],
)
