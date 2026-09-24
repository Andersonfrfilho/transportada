/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RedeliveryPolicy, TripOccurrenceCaseStatus } from '../../database/trip.schema.js'

/**
 * Spec 164 T2: a política de abertura da tratativa (D1, RF3). Pura — quem grava é o repositório
 * (T4), esta função só decide **se** abre.
 */
export type OccurrenceCaseOpening =
  | { readonly opens: false }
  | { readonly opens: true; readonly status: 'recorded' }

/**
 * `unset` é o produto de hoje: a ocorrência é anotada e o fluxo para ali — nenhuma tratativa nasce,
 * nenhuma tela nova aparece. Só `allowed`/`blocked` abrem `trip_occurrence_cases`, sempre em
 * `recorded` — o CHECK `trip_occurrence_cases_policy_check` (`database/trip.schema.ts`) proíbe
 * `'unset'` de chegar à tabela por qualquer outro caminho.
 */
export function resolveOccurrenceCaseOpening(
  redeliveryPolicy: RedeliveryPolicy,
): OccurrenceCaseOpening {
  if (redeliveryPolicy === 'unset') return { opens: false }
  return { opens: true, status: 'recorded' }
}

/**
 * D5: a fronteira de visibilidade do portal é da consulta, não da tela —
 * `contractor-occurrence.query.ts` (T9) faz `inner join` com `trip_occurrence_cases` filtrando por
 * este conjunto **dentro do SQL**, somado ao recorte de `ContractorScope` que a ADR-0050 §4 já
 * impõe. `recorded`, `under_review`, `returned_to_warehouse` e `cancelled` não existem para o
 * portal — a ocorrência nunca chega a ser vista por ele, não é escondida na renderização.
 */
export const CONTRACTOR_VISIBLE_CASE_STATUSES = [
  'awaiting_contractor',
  'decided',
  'closed',
] as const satisfies readonly TripOccurrenceCaseStatus[]
