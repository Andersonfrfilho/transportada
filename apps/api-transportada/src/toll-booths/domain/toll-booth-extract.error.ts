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

/** Nenhuma linha em `toll_booth_extracts` para `(dataset, observedOn)` — só extrato registrado recarrega. */
export class TollBoothExtractNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TOLL_BOOTH_EXTRACT_NOT_FOUND',
      message: 'Toll booth extract not registered for this dataset and date',
      status: 404,
    })
  }
}

/** A linha existe e o objeto não está no bucket; a linha ganha `missing_object_observed_at`. */
export class TollBoothExtractObjectMissingError extends ApiError {
  public constructor() {
    super({
      code: 'TOLL_BOOTH_EXTRACT_OBJECT_MISSING',
      message: 'Toll booth extract object is missing from storage',
      status: 409,
    })
  }
}

/** O objeto não é o que a linha registrou: tamanho, sha256 ou forma — nada é gravado no catálogo. */
export class TollBoothExtractIntegrityError extends ApiError {
  public constructor() {
    super({
      code: 'TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH',
      message: 'Toll booth extract object does not match the registered extract',
      status: 409,
    })
  }
}

/** Outra recarga segura a trava do catálogo — a trava é global, não por extrato (RNF3). */
export class TollBoothCatalogReloadInProgressError extends ApiError {
  public constructor() {
    super({
      code: 'TOLL_BOOTH_CATALOG_RELOAD_IN_PROGRESS',
      message: 'Another toll booth catalog reload is in progress',
      status: 409,
    })
  }
}
