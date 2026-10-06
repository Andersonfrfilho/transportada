/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF0, T1b.1b, T1b.6): as recusas do cadastro do conjunto de momentos.
 */
import { ApiError } from '../../shared/api.error.js'

/** Spec 246 T1b.6: tipo sem momento nenhum não apareceria para ninguém. */
export class OccurrenceTypeMomentsRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_MOMENTS_REQUIRED',
      message: 'An occurrence type needs at least one moment.',
      status: 422,
    })
  }
}

/**
 * Nota e parada no mesmo tipo: o app do motorista roteia por `flow` e mostraria o tipo duas vezes.
 * Recusado até o app deduplicar por id + momento.
 */
export class OccurrenceTypeMomentsDocumentAndStopError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP',
      message: 'An occurrence type cannot be registered both on a document and on a stop.',
      status: 422,
    })
  }
}

/**
 * O `PUT` sem `moments` mudou `stage`/`flow` de um tipo cujo conjunto o par não consegue dizer —
 * re-derivar apagaria momentos que o operador marcou. A tela manda o conjunto.
 */
export class OccurrenceTypeMomentsStageConflictError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_MOMENTS_STAGE_CONFLICT',
      message: 'This occurrence type has several moments; send them instead of stage and flow.',
      status: 409,
    })
  }
}
