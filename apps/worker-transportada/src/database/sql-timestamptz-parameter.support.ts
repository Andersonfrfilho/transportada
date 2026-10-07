/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `api-transportada/src/database/sql-timestamptz-parameter.support.ts` (o worker
 * não importa código da API). Em SQL cru não há coluna para o drizzle tipar o parâmetro, e a `Date`
 * interpolada seria convertida com `String()` — formato que o Postgres recusa com `22007`. Aqui o
 * valor sai como texto ISO com `::timestamptz` explícito.
 */
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

export function timestamptzParameter(value: Date): SQL {
  return sql`${value.toISOString()}::timestamptz`
}
