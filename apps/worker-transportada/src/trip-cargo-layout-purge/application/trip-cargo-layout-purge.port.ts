/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type PurgeStaleCargoLayoutPreviewsInput = {
  /** Prévia sem viagem com `updated_at` anterior a este instante é apagada. */
  readonly before: Date
  readonly limit: number
}

export type PurgeStaleCargoLayoutPreviewsResult = {
  readonly deleted: number
  readonly deletedOutbox: number
}

/**
 * Apaga **um lote** de prévias vencidas numa transação só: primeiro a outbox delas (a FK é
 * `ON DELETE RESTRICT`), depois as prévias. A planta que ganhou `trip_id` nunca entra.
 */
export type PurgeStaleCargoLayoutPreviews = (
  input: PurgeStaleCargoLayoutPreviewsInput,
) => Promise<PurgeStaleCargoLayoutPreviewsResult>
