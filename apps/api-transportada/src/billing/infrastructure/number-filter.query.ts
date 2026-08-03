/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, gte, inArray, lte, or, type SQL, type SQLWrapper } from 'drizzle-orm'

type NumberFilterInput = {
  readonly column: SQLWrapper
  readonly from: string | null
  readonly list: readonly string[] | null
  readonly to: string | null
  readonly toComparable: (value: string) => bigint | string
}

/**
 * Lista e faixa são alternativas do mesmo domínio, não restrições que se somam: em `and`, uma seleção
 * disjunta (`3,7` mais `10-40`) devolveria zero linha.
 */
export function buildNumberFilter(input: NumberFilterInput): SQL | undefined {
  const list =
    input.list === null ? undefined : inArray(input.column, input.list.map(input.toComparable))
  const range =
    input.from === null || input.to === null
      ? undefined
      : and(
          gte(input.column, input.toComparable(input.from)),
          lte(input.column, input.toComparable(input.to)),
        )
  if (list === undefined) return range
  if (range === undefined) return list
  return or(list, range)
}
