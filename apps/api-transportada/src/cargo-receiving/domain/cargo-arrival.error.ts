/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: os códigos estáveis da chegada. Lista de notas vai em `details`, cada uma no seu
 * campo (`documentIds.<posição>`), para a tela apontar todas de uma vez.
 */
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'

const DOCUMENT_IDS_FIELD = 'documentIds'

/** O motivo do lote quando a nota pedida não está nesta chegada. */
export const CARGO_ARRIVAL_DOCUMENT_NOT_FOUND = 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND'

const PENDING_DOCUMENT_IDS_FIELD = 'pendingDocumentIds'
const PENDING_DOCUMENT_MESSAGE = 'The document is not separated yet'

/** O id da nota vai no próprio campo, nunca no texto: `message` é para gente ler (revisão, L7). */
export type PendingDocumentDetail = ApiErrorDetail & { readonly documentId: string }

export function toPendingDocumentDetails(
  documentIds: readonly string[],
): readonly PendingDocumentDetail[] {
  return documentIds.map((documentId, index) => ({
    documentId,
    field: `${PENDING_DOCUMENT_IDS_FIELD}.${index}`,
    message: PENDING_DOCUMENT_MESSAGE,
  }))
}

export function toDocumentDetails(
  items: readonly { readonly index: number; readonly message: string }[],
): readonly ApiErrorDetail[] {
  return items.map((item) => ({
    field: `${DOCUMENT_IDS_FIELD}.${item.index}`,
    message: item.message,
  }))
}

export class CargoArrivalNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'CARGO_ARRIVAL_NOT_FOUND', message: 'Cargo arrival was not found', status: 404 })
  }
}

export class CargoArrivalDocumentNotFoundError extends ApiError {
  public constructor() {
    super({
      code: CARGO_ARRIVAL_DOCUMENT_NOT_FOUND,
      message: 'The document is not part of this cargo arrival',
      status: 404,
    })
  }
}

/** Contratante sem perfil, ou com o perfil desligado, segue o fluxo de hoje (ADR-0048). */
export class CargoReceivingNotEnabledError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_RECEIVING_NOT_ENABLED',
      message: 'Cargo receiving is not enabled for this contractor',
      status: 422,
    })
  }
}

export class CargoArrivalArrivedAtInFutureError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_ARRIVED_AT_IN_FUTURE',
      details: [{ field: 'arrivedAt', message: 'The arrival cannot be in the future' }],
      message: 'The arrival cannot be in the future',
      status: 422,
    })
  }
}

export class CargoArrivalArrivedAtTooOldError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_ARRIVED_AT_TOO_OLD',
      details: [{ field: 'arrivedAt', message: 'The arrival cannot be more than 30 days ago' }],
      message: 'The arrival cannot be more than 30 days ago',
      status: 422,
    })
  }
}

export class CargoArrivalDocumentsRefusedError extends ApiError {
  public constructor(details: readonly ApiErrorDetail[]) {
    super({
      code: 'CARGO_ARRIVAL_DOCUMENTS_REFUSED',
      details,
      message: 'Some documents cannot enter this cargo arrival',
      status: 422,
    })
  }
}

export class CargoArrivalDocumentsNotInArrivalError extends ApiError {
  public constructor(details: readonly ApiErrorDetail[]) {
    super({
      code: 'CARGO_ARRIVAL_DOCUMENTS_NOT_IN_ARRIVAL',
      details,
      message: 'Some documents are not part of this cargo arrival',
      status: 422,
    })
  }
}

/** Mesma chave de idempotência com outro pedido: reuso, não repetição. */
export class CargoArrivalKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_KEY_REUSED',
      message: 'This idempotency key was used for a different cargo arrival',
      status: 409,
    })
  }
}

/** O código é o motivo da política: `CARGO_ARRIVAL_CLOSED`, `…_NOT_RECEIVED` ou `…_NOT_ALLOWED`. */
export class CargoArrivalTransitionRefusedError extends ApiError {
  public constructor(code: string) {
    super({ code, message: 'This cargo arrival transition is not allowed', status: 409 })
  }
}

export class CargoArrivalHasPendingDocumentsError extends ApiError {
  public constructor(details: readonly ApiErrorDetail[]) {
    super({
      code: 'CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS',
      details,
      message: 'Every document must be separated before closing the cargo arrival',
      status: 409,
    })
  }
}

/** O cursor nasceu noutra ordem (coluna ou sentido): andar com ele pularia ou repetiria chegadas. */
export class CargoArrivalCursorOrderMismatchError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH',
      details: [{ field: 'cursor', message: 'The cursor belongs to another sort or direction' }],
      message: 'The cursor belongs to another sort or direction',
      status: 400,
    })
  }
}
