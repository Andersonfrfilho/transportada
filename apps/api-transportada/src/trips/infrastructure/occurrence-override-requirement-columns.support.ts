/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (D-a, T2.4), spec 247 (D8): as colunas de exigência das duas tabelas de exceção — `note_mode`,
 * `signature_mode`, `items_mode`, `photo_minimum_count`, `items_minimum_count`, `reference_number_mode`
 * e `declared_amount_mode`, todas **nulas e sem
 * padrão** (nulo herda do tipo). A leitura devolve o que está gravado; a escrita distingue três
 * estados: **ausente** (não mexa), **nulo** (herda) e **valor**.
 */
import { violatedCheckConstraint } from '../../database/postgres-error.support.js'
import { OCCURRENCE_OVERRIDE_ITEMS_MINIMUM_SHAPE_CHECKS } from '../../shared/trip-occurrence.constant.js'
import {
  OPTIONAL_PROOF_FIELD_MODE,
  REQUIRED_PROOF_FIELD_MODE,
} from '../domain/delivery-event.constant.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import { OccurrenceTypeItemsMinimumRequiresRequiredError } from '../domain/trip.error.js'

export type OccurrenceOverrideRequirementFields = {
  readonly declaredAmountMode?: DeliveryProofFieldMode | null | undefined
  readonly itemsMinimumCount?: null | number | undefined
  readonly itemsMode?: DeliveryProofFieldMode | null | undefined
  readonly noteMode?: DeliveryProofFieldMode | null | undefined
  readonly photoMinimumCount?: null | number | undefined
  readonly referenceNumberMode?: DeliveryProofFieldMode | null | undefined
  readonly signatureMode?: DeliveryProofFieldMode | null | undefined
}

type OverrideWriteInput = OccurrenceOverrideRequirementFields & {
  readonly attachmentMode: DeliveryProofFieldMode
}

/**
 * ⚠️ Linha **nova** sem `noteMode` (o painel anterior à 246 adiciona exceção sem conhecer o campo):
 * a observação segue a foto da exceção — a regra da 179 que a migration tirou do código e pôs no
 * dado. Nulo explícito é "herda do tipo" e nunca passa por aqui.
 */
function resolveNewRowNoteMode(input: OverrideWriteInput): DeliveryProofFieldMode | null {
  if (input.noteMode !== undefined) return input.noteMode
  return input.attachmentMode === REQUIRED_PROOF_FIELD_MODE
    ? REQUIRED_PROOF_FIELD_MODE
    : OPTIONAL_PROOF_FIELD_MODE
}

/** Os valores do `INSERT`: ausente vira nulo (herda), salvo a observação, que segue a foto. */
export function toOverrideRequirementInsert(input: OverrideWriteInput) {
  return {
    attachmentMode: input.attachmentMode,
    declaredAmountMode: input.declaredAmountMode ?? null,
    itemsMinimumCount: input.itemsMinimumCount ?? null,
    itemsMode: input.itemsMode ?? null,
    noteMode: resolveNewRowNoteMode(input),
    photoMinimumCount: input.photoMinimumCount ?? null,
    referenceNumberMode: input.referenceNumberMode ?? null,
    signatureMode: input.signatureMode ?? null,
  }
}

/**
 * O `SET` do conflito: só o que veio — ausente deixa a coluna como está, de propósito. Reescrever
 * tudo com `?? 'x'` apagaria, num `PUT` de painel antigo, o que a transportadora configurou depois.
 */
export function toOverrideRequirementUpdate(input: OverrideWriteInput) {
  return {
    attachmentMode: input.attachmentMode,
    ...toItemsMinimumCountUpdate(input),
    ...(input.declaredAmountMode === undefined
      ? {}
      : { declaredAmountMode: input.declaredAmountMode }),
    ...(input.referenceNumberMode === undefined
      ? {}
      : { referenceNumberMode: input.referenceNumberMode }),
    ...(input.itemsMode === undefined ? {} : { itemsMode: input.itemsMode }),
    ...(input.noteMode === undefined ? {} : { noteMode: input.noteMode }),
    ...(input.photoMinimumCount === undefined
      ? {}
      : { photoMinimumCount: input.photoMinimumCount }),
    ...(input.signatureMode === undefined ? {} : { signatureMode: input.signatureMode }),
    updatedAt: new Date(),
  }
}

/**
 * ⚠️ Trocar o modo de produtos para outro que não `required` (ou para nulo) sem mandar o mínimo
 * **zera o mínimo**: o mínimo gravado antes só vale com `required`, e deixá-lo estouraria a CHECK do
 * par (500). Mínimo ausente com o modo ausente segue "não mexa".
 */
function toItemsMinimumCountUpdate(input: OverrideWriteInput): {
  readonly itemsMinimumCount?: null | number
} {
  if (input.itemsMinimumCount !== undefined) return { itemsMinimumCount: input.itemsMinimumCount }
  const isLeavingRequired =
    input.itemsMode !== undefined && input.itemsMode !== REQUIRED_PROOF_FIELD_MODE
  return isLeavingRequired ? { itemsMinimumCount: null } : {}
}

/** Um mínimo sem `required` no estado resultante é 422 do domínio; qualquer outra violação propaga. */
export function rethrowOverrideShapeViolation(error: unknown): never {
  const violated = violatedCheckConstraint(error)
  if (violated !== undefined && OCCURRENCE_OVERRIDE_ITEMS_MINIMUM_SHAPE_CHECKS.includes(violated)) {
    throw new OccurrenceTypeItemsMinimumRequiresRequiredError()
  }
  throw error
}
