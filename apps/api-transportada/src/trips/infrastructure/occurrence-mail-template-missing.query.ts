/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 (ADR-0106, D8): o aviso "Tipo sem modelo de notificação" do feed e do detalhe. O servidor calcula;
 * o painel não recalcula. Só a ocorrência de nota, com contratante conhecida, de tipo que avisa a contratante
 * (`emails_contractor`) e sem modelo efetivo — o do tipo ou o da exceção da contratante da nota.
 *
 * Uma leitura fixa por página, só das exceções dos tipos que ainda estão sem modelo: nunca por linha.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { companyOccurrenceTypeContractorOverrides } from '../../database/trip.schema.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { resolveEffectiveOccurrenceMailTemplateId } from '../domain/occurrence-mail-template.policy.js'
import { readFailureCode } from './occurrence-type-items-read.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

export const OCCURRENCE_MAIL_TEMPLATE_MISSING_READ_FAILED_MESSAGE =
  'occurrence_mail_template_missing_read_failed'

export type MailTemplateCandidate = {
  readonly contractorId: null | string
  readonly emailsContractor: boolean
  readonly id: string
  readonly occurrenceTypeId: null | string
  readonly source: 'document' | 'stop'
  readonly typeMailTemplateId: null | string
}

function pairKey(occurrenceTypeId: string, contractorId: string): string {
  return `${occurrenceTypeId}:${contractorId}`
}

export async function listMissingNotificationTemplates(
  queryable: TripQueryable,
  params: { readonly candidates: readonly MailTemplateCandidate[]; readonly companyId: string },
): Promise<ReadonlySet<string>> {
  const pending = params.candidates.filter(
    (candidate) =>
      candidate.source === 'document' &&
      candidate.emailsContractor &&
      candidate.contractorId !== null &&
      candidate.occurrenceTypeId !== null &&
      candidate.typeMailTemplateId === null,
  )
  if (pending.length === 0) return new Set()

  const exceptions = await queryable
    .select({
      contractorId: companyOccurrenceTypeContractorOverrides.contractorId,
      occurrenceTypeId: companyOccurrenceTypeContractorOverrides.occurrenceTypeId,
      templateId: companyOccurrenceTypeContractorOverrides.contractorMailTemplateId,
    })
    .from(companyOccurrenceTypeContractorOverrides)
    .where(
      and(
        eq(companyOccurrenceTypeContractorOverrides.companyId, params.companyId),
        inArray(companyOccurrenceTypeContractorOverrides.occurrenceTypeId, [
          ...new Set(pending.map((candidate) => candidate.occurrenceTypeId as string)),
        ]),
        inArray(companyOccurrenceTypeContractorOverrides.contractorId, [
          ...new Set(pending.map((candidate) => candidate.contractorId as string)),
        ]),
      ),
    )
  const chosen = new Map(
    exceptions.map((row) => [pairKey(row.occurrenceTypeId, row.contractorId), row.templateId]),
  )
  return new Set(
    pending
      .filter(
        (candidate) =>
          resolveEffectiveOccurrenceMailTemplateId({
            contractorOverride: chosen.get(
              pairKey(candidate.occurrenceTypeId as string, candidate.contractorId as string),
            ),
            general: candidate.typeMailTemplateId,
          }) === null,
      )
      .map((candidate) => candidate.id),
  )
}

/**
 * ⚠️ É refinamento: o painel só mostra um selo, então a falha desta leitura vira "ninguém sem modelo" —
 * registrada, sem parâmetro nem dado — em vez de derrubar o feed, o detalhe e o envio, que já funcionavam sem
 * ela. Sem `logger` a falha propaga: dentro de transação o `.catch` esconderia a causa e o próximo comando
 * morreria com `25P02`.
 */
export function listMissingNotificationTemplatesOrEmpty(
  queryable: TripQueryable,
  params: {
    readonly candidates: readonly MailTemplateCandidate[]
    readonly companyId: string
    readonly logger?: ApiLogger
  },
): Promise<ReadonlySet<string>> {
  const { logger, ...readParams } = params
  const read = listMissingNotificationTemplates(queryable, readParams)
  if (logger === undefined) return read
  return read.catch((error: unknown) => {
    safeLogWarn({
      logger,
      message: OCCURRENCE_MAIL_TEMPLATE_MISSING_READ_FAILED_MESSAGE,
      metadata: { code: readFailureCode(error) },
    })
    return new Set<string>()
  })
}
