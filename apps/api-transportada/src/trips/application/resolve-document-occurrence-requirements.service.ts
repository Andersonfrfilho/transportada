/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF5, RF6, D-b): a exigência **efetiva** da nota para um tipo — tipo + exceção do
 * contratante + exceção do destinatário, campo a campo. O contratante e o destinatário são os **da
 * nota**, lidos no servidor (`findReachableDocument`); nunca vêm do corpo do pedido. A resolução é a
 * mesma do snapshot do motorista (`resolveFieldOccurrenceTypeResolutions`), sem segunda implementação.
 */
import { OCCURRENCE_MOMENT } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotReachableError } from '../domain/trip.error.js'
import type { OccurrenceRequirements } from '../domain/occurrence-requirements.policy.js'
import {
  resolveFieldOccurrenceTypeResolutions,
  type FieldOccurrenceTypeOverrides,
} from './list-field-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'

/**
 * As exceções de **um** tipo, numa consulta só. ⚠️ **Obrigatória**: opcional, esquecê-la na
 * composição ou num dublê não dava erro de tipo e a exceção deixava de valer em silêncio. Quem não
 * exercita as exceções injeta um stub explícito que devolve listas vazias.
 */
export type OccurrenceTypeOverridesReadPort = {
  findOccurrenceTypeOverrides(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<FieldOccurrenceTypeOverrides>
}

export type ResolveDocumentOccurrenceRequirementsParams = {
  readonly companyId: string
  readonly document: {
    readonly contractorId?: null | string | undefined
    readonly recipientTaxId?: null | string | undefined
  }
  readonly occurrenceType: OccurrenceTypeRecord
  readonly repository: OccurrenceTypeOverridesReadPort
}

const NO_OVERRIDES: FieldOccurrenceTypeOverrides = {
  contractorOverrides: [],
  recipientOverrides: [],
}

export async function resolveDocumentOccurrenceRequirements(
  params: ResolveDocumentOccurrenceRequirementsParams,
): Promise<OccurrenceRequirements> {
  const contractorId = params.document.contractorId ?? null
  const recipientTaxId = params.document.recipientTaxId ?? null
  const hasSubject = contractorId !== null || (recipientTaxId !== null && recipientTaxId !== '')
  const overrides = hasSubject
    ? await params.repository.findOccurrenceTypeOverrides({
        companyId: params.companyId,
        occurrenceTypeId: params.occurrenceType.id,
      })
    : NO_OVERRIDES

  const [resolution] = resolveFieldOccurrenceTypeResolutions({
    contractorId,
    moment: OCCURRENCE_MOMENT.document,
    overrides,
    recipientTaxId,
    types: [params.occurrenceType],
  })
  if (resolution === undefined) throw new TripDocumentNotReachableError()

  return resolution.requirements
}
