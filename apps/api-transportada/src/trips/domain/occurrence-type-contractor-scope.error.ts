/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (ADR-0107): as recusas do escopo de contratantes do tipo de ocorrência. A recusa de
 * registro não leva a lista de contratantes do tipo — só o que o cliente já sabe.
 */
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'

const DOCUMENT_IDS_FIELD = 'documentIds'

/** `listed` sem nenhuma contratante: lista vazia viraria "ninguém" ou, pior, "todos" em silêncio. */
export class OccurrenceTypeContractorScopeEmptyError extends ApiError {
  public constructor(details?: readonly ApiErrorDetail[]) {
    super({
      code: 'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_EMPTY',
      ...(details === undefined ? {} : { details }),
      message: 'A listed occurrence type needs at least one contractor.',
      status: 400,
    })
  }
}

/** A parada não tem contratante: tipo só de parada não pode ser restrito (RF5). */
export class OccurrenceTypeContractorScopeNeedsDocumentError extends ApiError {
  public constructor(details?: readonly ApiErrorDetail[]) {
    super({
      code: 'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_NEEDS_DOCUMENT',
      ...(details === undefined ? {} : { details }),
      message: 'An occurrence type that only exists on a stop cannot be limited to contractors.',
      status: 400,
    })
  }
}

/** Par incompleto (`contractorScope` sem `contractorIds` ou o contrário) ou `all` com lista. */
export class OccurrenceTypeContractorScopeInvalidError extends ApiError {
  public constructor(details?: readonly ApiErrorDetail[]) {
    super({
      code: 'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_INVALID',
      ...(details === undefined ? {} : { details }),
      message: 'Send the contractor scope and the contractor ids together; "all" takes no list.',
      status: 400,
    })
  }
}

/** Registro com nota numa contratante que o tipo não atende (RF6). O lote leva só os ids das notas recusadas. */
export class OccurrenceTypeNotAvailableForContractorError extends ApiError {
  public constructor(documentIds: readonly string[] = []) {
    super({
      code: 'OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR',
      ...(documentIds.length === 0
        ? {}
        : {
            details: documentIds.map((documentId) => ({
              field: DOCUMENT_IDS_FIELD,
              message: documentId,
            })),
          }),
      message: 'This occurrence type is not available for the contractor of this document.',
      status: 422,
    })
  }
}
