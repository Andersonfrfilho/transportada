/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14b: `POST /trip-occurrences/:id/case/redelivery-application` (RF18/RF19) — o caso de
 * uso só resolve o `caseId` a partir da ocorrência (mesmo molde das outras rotas de
 * `occurrence-case.routes.ts`) e delega ao repositório, que executa e registra numa única
 * transação (`DrizzleRedeliveryApplicationRepository`). Nenhuma lógica de negócio aqui: a proposta
 * é recalculada **dentro** da transação, sobre a linha travada de `trips` — este caso de uso não
 * decide nada, só encaminha.
 */
import type { TripOccurrenceCaseRedeliveryApplication } from '../../database/trip.schema.js'
import { OccurrenceCaseNotFoundError } from '../domain/trip.error.js'

export type RedeliveryApplicationResult = {
  readonly application: TripOccurrenceCaseRedeliveryApplication
}

export type RedeliveryApplicationPort = {
  applyRedeliveryApplication(input: {
    readonly actorUserId: string
    readonly caseId: string
    readonly companyId: string
  }): Promise<RedeliveryApplicationResult>
}

export type ApplyRedeliveryApplicationInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly findCaseIdByOccurrenceId: (input: {
    readonly companyId: string
    readonly occurrenceId: string
  }) => Promise<string | null>
  readonly occurrenceId: string
  readonly repository: RedeliveryApplicationPort
}

export async function applyRedeliveryApplication(
  input: ApplyRedeliveryApplicationInput,
): Promise<RedeliveryApplicationResult> {
  const caseId = await input.findCaseIdByOccurrenceId({
    companyId: input.companyId,
    occurrenceId: input.occurrenceId,
  })
  if (caseId === null) throw new OccurrenceCaseNotFoundError()

  return input.repository.applyRedeliveryApplication({
    actorUserId: input.actorUserId,
    caseId,
    companyId: input.companyId,
  })
}
