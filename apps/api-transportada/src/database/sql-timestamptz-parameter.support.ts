/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

/**
 * Numa comparação em SQL cru (`sql\`coalesce(a, b) >= ${data}\``) não há coluna para o drizzle
 * tipar o parâmetro, e o cliente da API (`prepare: false`) converteria a `Date` interpolada direto
 * com `String()` — formato que o Postgres recusa com `22007` (ver `database-parameter.policy.ts`).
 * Aqui o valor sai como texto ISO com cast explícito `::timestamptz`, que também documenta a
 * intenção da comparação para quem lê a consulta.
 */
export function timestamptzParameter(value: Date): SQL {
  return sql`${value.toISOString()}::timestamptz`
}
