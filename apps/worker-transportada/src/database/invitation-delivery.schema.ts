/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia das tabelas que a API versiona (`user_invitations`, `identity_user_profiles`,
 * `company_fiscal_profiles`, `invitation_delivery_outbox`). Migration só roda na API — mudou lá, mude aqui. Só as colunas que
 * a entrega lê estão declaradas.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const identityUserProfiles = pgTable('identity_user_profiles', {
  userId: uuid('user_id').primaryKey(),
  /** Quem recebe o código. Vai no cabeçalho do e-mail, ao lado da foto quando ela existe. */
  name: text().notNull(),
  contactAddress: text('contact_address').notNull(),
  contactChannel: text('contact_channel').notNull(),
})

/**
 * Só o endereço público da foto: o `public_token` é o link **e** a credencial dele, girado a cada
 * troca de imagem. Os bytes ficam na API — o e-mail carrega URL, não anexo.
 *
 * ⚠️ Cópia da tabela que a API versiona; migration só roda lá.
 */
export const identityUserPictures = pgTable('identity_user_pictures', {
  userId: uuid('user_id').primaryKey(),
  publicToken: text('public_token'),
})

/** Só a coluna do canal: a empresa decide por onde o código sai, o perfil só diz para onde. */
export const companyFiscalProfiles = pgTable('company_fiscal_profiles', {
  companyId: uuid('company_id').primaryKey(),
  activationChannel: text('activation_channel').notNull(),
})

export const userInvitations = pgTable('user_invitations', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: text().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  sealedCode: jsonb('sealed_code'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const invitationDeliveryOutbox = pgTable('invitation_delivery_outbox', {
  id: uuid().primaryKey(),
  eventId: uuid('event_id').notNull(),
  companyId: uuid('company_id').notNull(),
  invitationId: uuid('invitation_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  attempt: bigint({ mode: 'bigint' }).notNull(),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
