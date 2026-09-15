/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor de `api-transportada/src/database/rate-limit-window.schema.ts` — as apps não
 * importam código-fonte uma da outra e as migrations rodam só na API. O worker só apaga janela
 * vencida (`rate-limit.window.purge`); quem conta é a API. Mudou a tabela lá? confira aqui —
 * `test/rate-limit-window-purge/schema-parity.contract.ts` reprova se divergir.
 */
import { index, integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core'

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
