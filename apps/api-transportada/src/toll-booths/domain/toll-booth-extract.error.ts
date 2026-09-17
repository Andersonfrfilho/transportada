/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** `(dataset, observedOn)` já registrado — a linha nunca é sobrescrita (spec 154 aceite 8). */
export class TollBoothExtractDuplicateError extends ApiError {
  public constructor() {
    super({
      code: 'TOLL_BOOTH_EXTRACT_DUPLICATE',
      message: 'Toll booth extract already registered for this dataset and date',
      status: 409,
    })
  }
}

/**
 * O `put` é `create-only`: a chave já existe no bucket com conteúdo diferente do enviado agora.
 * Nunca sobrescreve — quem sobe de novo tem de escolher outro `dataset`/`observedOn`.
 */
export class TollBoothExtractObjectConflictError extends ApiError {
  public constructor() {
    super({
      code: 'TOLL_BOOTH_EXTRACT_OBJECT_CONFLICT',
      message: 'An object already exists at this key with different content',
      status: 409,
    })
  }
}
