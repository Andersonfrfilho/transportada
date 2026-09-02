/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { inArray, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import {
  resolvePhysicalDestination,
  PHYSICAL_DESTINATION_ORIGINS,
  type PhysicalDestinationCandidate,
} from '../domain/physical-destination.policy.js'

/**
 * Spec 073 RF3: o endereço físico se resolve **na mesma consulta**, nunca com um segundo `select`
 * por nota — os consumidores são listagens e o N+1 aqui é caro (`code-standart.md` §15).
 *
 * A junção traz os **dois** papéis de destino e a escolha acontece em memória, sobre as linhas que
 * já vieram. O caminho alternativo — `coalesce` entre dois `left join`, escolhendo em SQL — exigiria
 * reescrever `normalizePostalCode` como expressão do Postgres, e passariam a existir duas
 * definições de "endereço utilizável" livres para divergir. Uma só, em TypeScript, é o ponto.
 */
export function destinationRolesFilter(roleColumn: PgColumn): SQL {
  return inArray(roleColumn, [...PHYSICAL_DESTINATION_ORIGINS])
}

/**
 * Colapsa as (no máximo duas) linhas de destino de cada nota numa só, aplicando a precedência de
 * `<entrega>` sobre `<enderDest>`. Nota sem linha alguma simplesmente não aparece no mapa — é
 * ausência, como antes desta spec, nunca erro.
 */
export function pickPhysicalDestinationByDocument<
  TRow extends PhysicalDestinationCandidate & { readonly documentId: string },
>(rows: readonly TRow[]): Map<string, TRow> {
  const byDocument = new Map<string, TRow[]>()
  for (const row of rows) {
    const current = byDocument.get(row.documentId)
    if (current === undefined) byDocument.set(row.documentId, [row])
    else current.push(row)
  }

  const chosen = new Map<string, TRow>()
  for (const [documentId, candidates] of byDocument) {
    const winner = resolvePhysicalDestination(candidates)
    if (winner !== null) chosen.set(documentId, winner)
  }
  return chosen
}
