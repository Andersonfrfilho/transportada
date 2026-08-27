/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/database/delivery-client.schema.ts`, com as colunas
 * que a importação escreve e nada mais. As duas apps não importam código uma da outra, e migration
 * só roda na API. Mudou a tabela lá? confira aqui.
 *
 * O que este worker **escreve** é o cadastro mínimo — janela, taxa e `requires_scheduling` não são
 * escritos aqui, porque o cadastro nasce **sem regra** (ADR-0048 §1) e a criação automática nunca
 * sobrescreve o que gente preencheu. A janela **é lida** desde a spec 058 P2: o roteiro do pool
 * precisa saber a que horas o cliente recebe, e ler não é escrever.
 */
import { bigint, date, pgTable, text, time, timestamp, uuid } from 'drizzle-orm/pg-core'

export const deliveryClients = pgTable('delivery_clients', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  taxId: text('tax_id').notNull(),
  displayName: text('display_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contractors = pgTable('contractors', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  taxId: text('tax_id').notNull(),
  displayName: text('display_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * ⚠️ Spec 058 P2 — leitura, nunca escrita. A janela semanal do cliente de entrega, que o roteirizador
 * usa para propor hora de chegada que a portaria aceita.
 */
export const deliveryClientWindows = pgTable('delivery_client_windows', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  deliveryClientId: uuid('delivery_client_id').notNull(),
  /** 0 domingo … 6 sábado — a numeração de `EXTRACT(dow)`, a mesma da coluna. */
  weekday: bigint({ mode: 'number' }).notNull(),
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
})

export const deliveryClientExceptions = pgTable('delivery_client_exceptions', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  deliveryClientId: uuid('delivery_client_id').notNull(),
  exceptionOn: date('exception_on').notNull(),
  kind: text().notNull(),
  opensAt: time('opens_at'),
  closesAt: time('closes_at'),
})

export const municipalHolidays = pgTable('municipal_holidays', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  cityIbgeCode: text('city_ibge_code').notNull(),
  holidayOn: date('holiday_on').notNull(),
})
