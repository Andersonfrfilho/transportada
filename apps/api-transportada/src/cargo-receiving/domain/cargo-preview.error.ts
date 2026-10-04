/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: os códigos estáveis da prévia. Os da leitura do arquivo (`PREVIEW_*`) continuam em
 * `CargoPreviewWorkbookError`; aqui ficam os do envio e das ações do operador.
 */
import { ApiError } from '../../shared/api.error.js'

export class CargoPreviewNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'CARGO_PREVIEW_NOT_FOUND', message: 'Cargo preview was not found', status: 404 })
  }
}

export class CargoPreviewItemNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_PREVIEW_ITEM_NOT_FOUND',
      message: 'The item is not part of this cargo preview',
      status: 404,
    })
  }
}

/** Perfil ausente, desligado, sem prévia ligada ou sem mapa de colunas: a prévia não tem leitor. */
export class CargoPreviewNotEnabledError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_PREVIEW_NOT_ENABLED',
      message: 'Cargo previews are not enabled for this contractor',
      status: 422,
    })
  }
}

export class CargoPreviewKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_PREVIEW_KEY_REUSED',
      message: 'This idempotency key was used for a different cargo preview',
      status: 409,
    })
  }
}

/** A prévia ainda não foi lida (ou falhou): não há item para decidir nem chegada para propor. */
export class CargoPreviewNotReadyError extends ApiError {
  public constructor() {
    super({ code: 'CARGO_PREVIEW_NOT_READY', message: 'Cargo preview is not ready', status: 409 })
  }
}

/** O código é o motivo da política (`…_NOT_SUGGESTED`, `…_NOT_LINKED`, `…_ALREADY_LINKED`…). */
export class CargoPreviewItemActionRefusedError extends ApiError {
  public constructor(code: string) {
    super({ code, message: 'This cargo preview item action is not allowed', status: 409 })
  }
}

/** A nota está em outra prévia (1:1, RF5a item 5). */
export class CargoPreviewDocumentAlreadyLinkedError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_PREVIEW_DOCUMENT_ALREADY_LINKED',
      details: [{ field: 'documentId', message: 'The document is linked to another preview' }],
      message: 'The document is already linked to another cargo preview',
      status: 422,
    })
  }
}

/** Nota de outra empresa, de outro emitente ou não autorizada: não é candidata desta prévia. */
export class CargoPreviewDocumentNotCandidateError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_PREVIEW_DOCUMENT_NOT_CANDIDATE',
      details: [
        { field: 'documentId', message: 'The document is not a candidate for this preview' },
      ],
      message: 'The document cannot be linked to this cargo preview',
      status: 422,
    })
  }
}
