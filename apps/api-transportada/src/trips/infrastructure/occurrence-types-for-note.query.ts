/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (ADR-0107, R3): o catálogo que os fluxos do WhatsApp oferecem para a nota da conversa — o
 * mesmo filtro de escopo da lista do app, lido uma vez. Sem nota (ou com nota que não é da empresa),
 * só os tipos `all`: um tipo restrito nunca aparece por falta de contexto.
 */
import type { OccurrenceTypeRecord } from '../application/register-trip-occurrence.use-case.js'
import { isOccurrenceTypeAvailableForNotes } from '../domain/occurrence-type-contractor-scope.policy.js'
import { listOccurrenceTypes } from './delivery-proof-read.support.js'
import { findDocumentContractorIds } from './document-occurrence-subject.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function listOccurrenceTypesForNote(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentId?: string | undefined },
): Promise<readonly OccurrenceTypeRecord[]> {
  const types = await listOccurrenceTypes(queryable, { companyId: input.companyId })
  const contractorsByDocument = await findDocumentContractorIds(queryable, {
    companyId: input.companyId,
    documentIds: input.documentId === undefined ? [] : [input.documentId],
  })
  const contractorId =
    input.documentId === undefined ? null : (contractorsByDocument.get(input.documentId) ?? null)
  return types.filter((type) =>
    isOccurrenceTypeAvailableForNotes({ noteContractorIds: [contractorId], type }),
  )
}
