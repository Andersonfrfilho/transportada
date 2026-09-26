/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T903 (achado C2): "a ocorrência está encerrada" como fragmento de SQL, para quem precisa
 * filtrar por isso sem conhecer a tratativa — a conversa da ocorrência usa para dizer qual conversa
 * ainda está aberta. Mora aqui porque a tratativa é de `trips` (spec 164), e a conversa nunca a toca
 * (D4, `conversation-never-decides.contract.ts`). Só leitura.
 *
 * Encerrada = a tratativa chegou a estado terminal (`OCCURRENCE_CASE_TERMINAL_STATUSES`), a mesma
 * definição de "aberta" da linha do tempo da spec 183 (T206). Ocorrência de parada não tem
 * tratativa: nunca está encerrada por aqui.
 */
import { and, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm'

import { tripOccurrenceCases } from '../../database/trip.schema.js'
import { OCCURRENCE_CASE_TERMINAL_STATUSES } from '../domain/occurrence-case-state.policy.js'

export function terminalOccurrenceCaseExists(input: {
  readonly companyId: SQLWrapper
  readonly isDocumentOccurrence: SQL
  readonly occurrenceId: SQLWrapper
}): SQL {
  return sql`exists (
    select 1 from ${tripOccurrenceCases}
    where ${and(
      input.isDocumentOccurrence,
      eq(tripOccurrenceCases.companyId, input.companyId),
      eq(tripOccurrenceCases.occurrenceId, input.occurrenceId),
      inArray(tripOccurrenceCases.status, [...OCCURRENCE_CASE_TERMINAL_STATUSES]),
    )}
  )`
}
