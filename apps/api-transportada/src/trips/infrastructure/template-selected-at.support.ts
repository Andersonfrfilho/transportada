/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (D2): o carimbo do momento em que o modelo do e-mail à contratante foi escolhido no tipo.
 */
import { sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

/**
 * O momento da escolha (decisão de 2026-10-17): troca para um valor diferente carimba `now()`, o mesmo valor
 * mantém o carimbo e `null` o limpa. Só vale em UPDATE, onde a coluna do lado direito é o valor antigo.
 * Serve a uuid (modelo da 269) e a varchar (chave do módulo de notificação, 271): o parâmetro herda o tipo da coluna.
 */
export function buildTemplateSelectedAtChange(params: {
  readonly selectedAtColumn: PgColumn
  readonly value: null | string
  readonly valueColumn: PgColumn
}): SQL | null {
  if (params.value === null) return null
  return sql`case when ${params.valueColumn} is distinct from ${params.value} then now() else ${params.selectedAtColumn} end`
}
