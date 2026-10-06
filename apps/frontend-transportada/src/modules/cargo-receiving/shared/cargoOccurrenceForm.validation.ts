/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoFormIssue } from './cargoArrivalForm.validation'
import {
  CARGO_OCCURRENCE_DEFAULT_UNIT,
  CARGO_OCCURRENCE_FALLBACK_UNITS,
  CARGO_OCCURRENCE_FIELD,
  CARGO_OCCURRENCE_LIMITS,
} from './cargoOccurrence.constant'
import type { CargoDocumentProduct, ReceivingOccurrenceType } from './cargoOccurrence.types'

export type OccurrenceItemDraft = Readonly<{ quantity: string; unit: string }>

export type OccurrenceDraftPhoto = Readonly<{
  id: string
  original: Blob
  thumbnail: Blob | undefined
}>

/** `itemsByCode` guarda a ordem em que o separador marcou: é a ordem em que a lista viaja e se imprime. */
export type OccurrenceDraft = Readonly<{
  itemsByCode: ReadonlyMap<string, OccurrenceItemDraft>
  note: string
  photo: OccurrenceDraftPhoto | undefined
  typeId: string
}>

export type OccurrenceFieldName =
  | 'file'
  | 'note'
  | 'occurrenceTypeId'
  | 'productCodes'
  | 'productQuantities'

export type OccurrenceFormIssues = Partial<Record<OccurrenceFieldName, CargoFormIssue>>

/** O que o servidor aceita (`QUANTITY_PATTERN`) com a vírgula de quem digita e as três casas do banco. */
const QUANTITY_PATTERN = /^\d+([.,]\d{1,3})?$/u
const PHOTO_FILE_NAME = 'avaria.jpg'

export const normalizeOccurrenceQuantity = (quantity: string): string =>
  quantity.trim().replace(',', '.')

/** Vazio é item sem contagem (a contagem nunca é obrigatória); com número, ele precisa ser positivo. */
export function isOccurrenceQuantityValid(quantity: string): boolean {
  const trimmed = quantity.trim()
  if (trimmed === '') return true
  return QUANTITY_PATTERN.test(trimmed) && Number(normalizeOccurrenceQuantity(trimmed)) > 0
}

export function resolveOccurrenceItemDefaultUnit(commercialUnit: string): string {
  const trimmed = commercialUnit.trim()
  return trimmed === '' ? CARGO_OCCURRENCE_DEFAULT_UNIT : trimmed
}

/** A unidade comercial do item primeiro, depois caixa e unidade — sem repetir o par que já é padrão. */
export function resolveOccurrenceItemUnitOptions(commercialUnit: string): readonly string[] {
  const trimmed = commercialUnit.trim()
  const fallback: readonly string[] = CARGO_OCCURRENCE_FALLBACK_UNITS
  return trimmed === '' || fallback.includes(trimmed) ? fallback : [trimmed, ...fallback]
}

export function toggleOccurrenceItem(
  input: Readonly<{
    allowsMultipleItems: boolean
    items: ReadonlyMap<string, OccurrenceItemDraft>
    product: CargoDocumentProduct
  }>,
): ReadonlyMap<string, OccurrenceItemDraft> {
  const { items, product } = input
  if (items.has(product.code)) {
    return new Map([...items].filter(([code]) => code !== product.code))
  }
  const marked: OccurrenceItemDraft = {
    quantity: '',
    unit: resolveOccurrenceItemDefaultUnit(product.commercialUnit),
  }
  return input.allowsMultipleItems
    ? new Map([...items, [product.code, marked]])
    : new Map([[product.code, marked]])
}

/** Sem tipo escolhido ainda vale o padrão do catálogo: vários itens, e o item é pedido. */
const UNCHOSEN_TYPE_RULES: Pick<ReceivingOccurrenceType, 'allowsMultipleItems' | 'itemsMode'> = {
  allowsMultipleItems: true,
  itemsMode: 'optional',
}

function validateItems(
  input: Readonly<{
    draft: OccurrenceDraft
    type: Pick<ReceivingOccurrenceType, 'allowsMultipleItems' | 'itemsMode'>
  }>,
): OccurrenceFormIssues {
  const { draft, type } = input
  if (type.itemsMode === 'off') return {}
  if (draft.itemsByCode.size === 0) return { productCodes: { code: 'itemsRequired' } }
  if (!type.allowsMultipleItems && draft.itemsByCode.size > 1) {
    return { productCodes: { code: 'singleItem' } }
  }
  const hasInvalidQuantity = [...draft.itemsByCode.values()].some(
    (item) => !isOccurrenceQuantityValid(item.quantity),
  )
  return hasInvalidQuantity ? { productQuantities: { code: 'quantityInvalid' } } : {}
}

function validatePhoto(photo: OccurrenceDraftPhoto | undefined): OccurrenceFormIssues {
  if (photo === undefined) return { file: { code: 'photoRequired' } }
  if (photo.original.size > CARGO_OCCURRENCE_LIMITS.photoMaxBytes) {
    return { file: { code: 'photoTooLarge', max: CARGO_OCCURRENCE_LIMITS.photoMaxKibibytes } }
  }
  return {}
}

/** Espelha o que o servidor recusa: o operador descobre no campo, não depois de a rede ir e voltar. */
export function validateOccurrenceDraft(
  input: Readonly<{ draft: OccurrenceDraft; type: ReceivingOccurrenceType | undefined }>,
): OccurrenceFormIssues {
  const { draft, type } = input
  const noteLength = draft.note.trim().length
  return {
    ...(type === undefined || draft.typeId === ''
      ? { occurrenceTypeId: { code: 'required' } }
      : {}),
    ...validateItems({ draft, type: type ?? UNCHOSEN_TYPE_RULES }),
    ...validatePhoto(draft.photo),
    ...(noteLength > CARGO_OCCURRENCE_LIMITS.noteMaxLength
      ? { note: { code: 'tooLong', max: CARGO_OCCURRENCE_LIMITS.noteMaxLength } }
      : {}),
  }
}

/** Listas alinhadas por índice: item sem contagem vai em branco nos DOIS campos, a unidade junto. */
export function buildOccurrenceFormData(input: Readonly<{ draft: OccurrenceDraft }>): FormData {
  const { draft } = input
  const form = new FormData()
  form.append(CARGO_OCCURRENCE_FIELD.occurrenceTypeId, draft.typeId)
  form.append(CARGO_OCCURRENCE_FIELD.note, draft.note.trim())
  for (const [code, item] of draft.itemsByCode) {
    const hasQuantity = item.quantity.trim() !== ''
    form.append(CARGO_OCCURRENCE_FIELD.productCodes, code)
    form.append(
      CARGO_OCCURRENCE_FIELD.productQuantities,
      hasQuantity ? normalizeOccurrenceQuantity(item.quantity) : '',
    )
    form.append(CARGO_OCCURRENCE_FIELD.productQuantityUnits, hasQuantity ? item.unit : '')
  }
  if (draft.photo !== undefined) {
    form.append(CARGO_OCCURRENCE_FIELD.file, draft.photo.original, PHOTO_FILE_NAME)
    if (draft.photo.thumbnail !== undefined) {
      form.append(CARGO_OCCURRENCE_FIELD.thumbnail, draft.photo.thumbnail, PHOTO_FILE_NAME)
    }
  }
  return form
}

/**
 * A chave de idempotência é uma por tentativa: o MESMO envio reaproveita a chave, e outro conteúdo ganha uma
 * nova (o servidor trata a mesma chave com outro pedido como 409 de reuso). A ordem dos itens conta porque o
 * servidor imprime a lista na ordem enviada.
 */
export function buildOccurrenceFingerprint(
  input: Readonly<{ documentId: string; draft: OccurrenceDraft }>,
): string {
  const { documentId, draft } = input
  return JSON.stringify([
    documentId,
    draft.typeId,
    draft.note.trim(),
    [...draft.itemsByCode].map(([code, item]) => [code, item.quantity.trim(), item.unit]),
    draft.photo?.id ?? null,
  ])
}
