/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 182 D3: espelha `TRIP_DELIVERY_PROOF_CARGO_LIMIT` da API — a sexta foto de carga é recusada
 * lá (422 `TRIP_DELIVERY_PROOF_CARGO_LIMIT`); aqui é o que trava o botão antes de chegar à rede.
 */
export const FIELD_DELIVERY_CARGO_PHOTO_LIMIT = 5

/** A sexta foto não é oferecida — nem pela câmera, nem pelo arquivo. */
export function canAddFieldDeliveryCargoPhoto(
  photoCount: number,
  limit: number = FIELD_DELIVERY_CARGO_PHOTO_LIMIT,
): boolean {
  return photoCount < limit
}

export type FieldDeliveryCargoPhotoSelectionInput = Readonly<{
  currentCount: number
  limit?: number
  selectedCount: number
}>

/**
 * Escolher mais arquivos do que cabe não é erro — só entram os que cabem, e o resto vira aviso na
 * tela (nunca falha silenciosa nem recusa a seleção inteira).
 */
export function splitFieldDeliveryCargoPhotoSelection(
  input: FieldDeliveryCargoPhotoSelectionInput,
): Readonly<{ accepted: number; overflow: number }> {
  const limit = input.limit ?? FIELD_DELIVERY_CARGO_PHOTO_LIMIT
  const remaining = Math.max(0, limit - input.currentCount)
  const accepted = Math.min(remaining, input.selectedCount)
  return { accepted, overflow: input.selectedCount - accepted }
}
