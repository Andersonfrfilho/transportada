/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { index, integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core'

/**
 * Spec 150 T406: o balde do limitador de taxa com estado compartilhado entre réplicas. Uma linha por
 * `(escopo, sujeito, início da janela)`; o `INSERT … ON CONFLICT` soma `hits` atomicamente. Sem
 * `company_id` próprio: o sujeito já é `companyId:userId`, e a linha não é dado de negócio de
 * ninguém. As janelas vencidas saem pela rotina `rate-limit.window.purge` do worker — o índice em
 * `window_start` é dela.
 */
export const rateLimitWindows = pgTable(
  'rate_limit_windows',
  {
    scope: varchar({ length: 60 }).notNull(),
    subjectKey: varchar('subject_key', { length: 120 }).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    hits: integer().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.subjectKey, table.windowStart],
      name: 'rate_limit_windows_pkey',
    }),
    index('rate_limit_windows_window_start_idx').on(table.windowStart),
  ],
)
