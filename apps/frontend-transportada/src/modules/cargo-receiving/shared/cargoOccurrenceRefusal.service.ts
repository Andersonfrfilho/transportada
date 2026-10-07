/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CARGO_OCCURRENCE_FIELD } from './cargoOccurrence.constant'
import type { RegistrationRefusal, RefusedField } from './cargoReceivingRefusal.service'
import { CargoReceivingRequestError } from './cargoReceivingRequest.service'

/**
 * `web.md` §11.4: o rótulo impresso é o que aparece, nunca o caminho do corpo. O campo que a API usou vira o
 * alvo que existe na tela (a miniatura é da foto; a unidade é da quantidade) — o atalho precisa achar o campo.
 */
const FIELD_TARGET: Readonly<Record<string, string>> = {
  [CARGO_OCCURRENCE_FIELD.productQuantityUnits]: CARGO_OCCURRENCE_FIELD.productQuantities,
  [CARGO_OCCURRENCE_FIELD.thumbnail]: CARGO_OCCURRENCE_FIELD.file,
}

const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  [CARGO_OCCURRENCE_FIELD.file]: 'occurrence.fields.file',
  [CARGO_OCCURRENCE_FIELD.note]: 'occurrence.fields.note',
  [CARGO_OCCURRENCE_FIELD.occurrenceTypeId]: 'occurrence.fields.occurrenceTypeId',
  [CARGO_OCCURRENCE_FIELD.productCodes]: 'occurrence.fields.productCodes',
  [CARGO_OCCURRENCE_FIELD.productQuantities]: 'occurrence.fields.productQuantities',
}

/**
 * Vários códigos da API chegam SEM `details` e ainda assim apontam um campo: a recusa os nomeia mesmo assim,
 * para o aviso não cair no genérico "o servidor recusou".
 */
const CODE_FIELD: Readonly<Record<string, string>> = {
  CARGO_ARRIVAL_OCCURRENCE_ITEMS_REQUIRED: CARGO_OCCURRENCE_FIELD.productCodes,
  CARGO_ARRIVAL_OCCURRENCE_TYPE_NOT_FOUND: CARGO_OCCURRENCE_FIELD.occurrenceTypeId,
  OCCURRENCE_ITEM_QUANTITY_LENGTH_MISMATCH: CARGO_OCCURRENCE_FIELD.productQuantities,
  OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE: CARGO_OCCURRENCE_FIELD.productQuantities,
  OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING: CARGO_OCCURRENCE_FIELD.productQuantities,
  OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN: CARGO_OCCURRENCE_FIELD.productQuantities,
  OCCURRENCE_PHOTO_REQUIRED: CARGO_OCCURRENCE_FIELD.file,
  OCCURRENCE_PRODUCT_DUPLICATE: CARGO_OCCURRENCE_FIELD.productCodes,
  OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT: CARGO_OCCURRENCE_FIELD.productCodes,
  OCCURRENCE_PRODUCT_SELECTION_CONFLICT: CARGO_OCCURRENCE_FIELD.productCodes,
  OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED: CARGO_OCCURRENCE_FIELD.productCodes,
  OCCURRENCE_TYPE_NOT_RECEIVING: CARGO_OCCURRENCE_FIELD.occurrenceTypeId,
  OCCURRENCE_TYPE_SINGLE_ITEM: CARGO_OCCURRENCE_FIELD.productCodes,
}

/** Todos os campos recusados, uma vez cada, na ordem em que o servidor os nomeou; o desconhecido sai cru. */
export function describeOccurrenceRefusal(error: unknown): RegistrationRefusal {
  if (!(error instanceof CargoReceivingRequestError)) {
    return { code: undefined, documents: [], fields: [] }
  }
  const named = error.details.map((detail) => FIELD_TARGET[detail.field] ?? detail.field)
  const implied = CODE_FIELD[error.message]
  const targets = [...new Set(implied === undefined ? named : [...named, implied])]
  const fields: readonly RefusedField[] = targets.map((field) => ({
    field,
    labelKey: FIELD_LABEL_KEYS[field],
  }))
  return { code: error.message, documents: [], fields }
}

/** O texto próprio da avaria vem primeiro (a janela vencida tem o dela); depois o da chegada, e por fim o genérico. */
export function resolveOccurrenceErrorKeys(code: string): string[] {
  return [`occurrence.errors.${code}`, `errors.${code}`, 'errors.unknown']
}
