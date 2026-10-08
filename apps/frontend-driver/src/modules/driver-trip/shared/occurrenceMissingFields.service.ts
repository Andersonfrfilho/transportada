/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeclaredAmountScope, OccurrenceRequirements } from './occurrenceRequirements.service'
import { OCCURRENCE_AMOUNT_SCOPE, OCCURRENCE_FIELD_MODE } from './occurrenceValues.constant'

/**
 * `photoMinimum` é a foto que já existe, mas não chega ao mínimo — o texto diz quantas faltam. Spec 247:
 * `productsMinimum` são os produtos marcados abaixo do mínimo, `productQuantity` uma linha marcada sem
 * quantidade válida, e `declaredAmount`/`itemDeclaredAmount`/`referenceNumber` os dois campos novos.
 */
export type OccurrenceMissingField =
  | 'declaredAmount'
  | 'itemDeclaredAmount'
  | 'note'
  | 'photo'
  | 'photoMinimum'
  | 'productQuantity'
  | 'products'
  | 'productsMinimum'
  | 'referenceNumber'
  | 'referenceNumberInvalid'
  | 'signature'

/**
 * Spec 247: o que o aparelho já sabe dos produtos, do número e do valor pago. Quem o monta é
 * `evaluateOccurrenceValues`; aqui só se cobra, com as mesmas regras do servidor
 * (`occurrence-requirement-guard.policy.ts`, `occurrence-items-mode.policy.ts`).
 */
export type OccurrenceValuesFacts = Readonly<{
  /** O valor pago da ocorrência, digitado — `"0"` é digitado. */
  hasDeclaredAmount: boolean
  /** Uma linha marcada sem quantidade válida (vazia, zero ou acima da nota). */
  hasInvalidItemQuantity: boolean
  /** O número do documento tem caractere ou tamanho que a API recusa — o campo guarda o texto e se marca. */
  hasInvalidReferenceNumber: boolean
  hasReferenceNumber: boolean
  /** Linhas a que falta o valor pago exigido (o tipo o exige, ou o preço varia na nota). */
  lineAmountMissingCount: number
  itemsSelectedCount: number
  /** Quantos produtos a nota traz; zero é a nota sem lista (só "A nota inteira"). */
  itemsTotalCount: number
}>

/** Fato não informado vale "nada digitado e nenhum produto" — o gate nunca presume o que ninguém conferiu. */
const NO_VALUES_FACTS: OccurrenceValuesFacts = {
  hasDeclaredAmount: false,
  hasInvalidItemQuantity: false,
  hasInvalidReferenceNumber: false,
  hasReferenceNumber: false,
  itemsSelectedCount: 0,
  itemsTotalCount: 0,
  lineAmountMissingCount: 0,
}

export type OccurrenceDraftFacts = Readonly<{
  hasNote: boolean
  hasProducts: boolean
  hasSignature: boolean
  photoCount: number
  values?: OccurrenceValuesFacts
}>

/**
 * Espelho de `resolveDeclaredAmountTarget` (API): escopo `item` sem linha marcada, ou com Produtos
 * desligado, cai na ocorrência — só o lugar muda, o modo é o mesmo. Produtos obrigatórios e nenhuma
 * linha marcada ainda é "falta marcar", e o valor pago espera as linhas aparecerem.
 */
export function resolveDeclaredAmountTarget(input: {
  readonly itemsSelectedCount: number
  readonly itemsTotalCount: number
  readonly requirements: OccurrenceRequirements
}): DeclaredAmountScope {
  const { itemsSelectedCount, itemsTotalCount, requirements } = input
  if (requirements.declaredAmountScope !== OCCURRENCE_AMOUNT_SCOPE.item)
    return requirements.declaredAmountScope
  const isWaitingForLines =
    requirements.itemsMode === OCCURRENCE_FIELD_MODE.required &&
    itemsTotalCount > 0 &&
    itemsSelectedCount === 0
  if (isWaitingForLines) return OCCURRENCE_AMOUNT_SCOPE.item
  const hasNoLine = itemsSelectedCount === 0 || requirements.itemsMode === OCCURRENCE_FIELD_MODE.off
  return hasNoLine ? OCCURRENCE_AMOUNT_SCOPE.occurrence : OCCURRENCE_AMOUNT_SCOPE.item
}

function listMissingPhotoField(input: {
  readonly photoCount: number
  readonly requirements: OccurrenceRequirements
}): readonly OccurrenceMissingField[] {
  const { photoCount, requirements } = input
  if (requirements.photoMode !== OCCURRENCE_FIELD_MODE.required) return []
  if (photoCount === 0) return ['photo']
  return photoCount < requirements.photoMinimumCount ? ['photoMinimum'] : []
}

/** O mínimo nunca passa do total da nota (exigir dois itens de uma nota de um só a tornaria impossível). */
export function resolveRequiredItemsCount(input: {
  readonly itemsMinimumCount: number | null
  readonly itemsTotalCount: number
}): number {
  const wanted = input.itemsMinimumCount ?? input.itemsTotalCount
  return wanted < input.itemsTotalCount ? wanted : input.itemsTotalCount
}

function listMissingItemsField(input: {
  readonly facts: OccurrenceDraftFacts
  readonly requirements: OccurrenceRequirements
}): readonly OccurrenceMissingField[] {
  const { facts, requirements } = input
  if (requirements.itemsMode !== OCCURRENCE_FIELD_MODE.required) return []
  const values = facts.values ?? NO_VALUES_FACTS
  if (values.itemsTotalCount === 0) return facts.hasProducts ? [] : ['products']
  if (values.itemsSelectedCount === 0) return ['products']
  const requiredCount = resolveRequiredItemsCount({
    itemsMinimumCount: requirements.itemsMinimumCount,
    itemsTotalCount: values.itemsTotalCount,
  })
  return values.itemsSelectedCount < requiredCount ? ['productsMinimum'] : []
}

function listMissingAmountField(input: {
  readonly requirements: OccurrenceRequirements
  readonly values: OccurrenceValuesFacts
}): readonly OccurrenceMissingField[] {
  const { requirements, values } = input
  if (requirements.declaredAmountMode === OCCURRENCE_FIELD_MODE.off) return []
  const target = resolveDeclaredAmountTarget({
    itemsSelectedCount: values.itemsSelectedCount,
    itemsTotalCount: values.itemsTotalCount,
    requirements,
  })
  if (target === OCCURRENCE_AMOUNT_SCOPE.item)
    return values.lineAmountMissingCount > 0 ? ['itemDeclaredAmount'] : []
  const isRequired = requirements.declaredAmountMode === OCCURRENCE_FIELD_MODE.required
  return isRequired && !values.hasDeclaredAmount ? ['declaredAmount'] : []
}

function listMissingReferenceNumberField(input: {
  readonly requirements: OccurrenceRequirements
  readonly values: OccurrenceValuesFacts
}): readonly OccurrenceMissingField[] {
  const { requirements, values } = input
  if (values.hasInvalidReferenceNumber) return ['referenceNumberInvalid']
  const isMissing =
    requirements.referenceNumberMode === OCCURRENCE_FIELD_MODE.required &&
    !values.hasReferenceNumber
  return isMissing ? ['referenceNumber'] : []
}

/** Quem falta, na ordem em que o formulário pergunta. `off` e `optional` nunca faltam. */
export function listMissingOccurrenceRequirements(input: {
  readonly facts: OccurrenceDraftFacts
  readonly requirements: OccurrenceRequirements
}): readonly OccurrenceMissingField[] {
  const { facts, requirements } = input
  const values = facts.values ?? NO_VALUES_FACTS
  return [
    ...listMissingItemsField({ facts, requirements }),
    ...(values.hasInvalidItemQuantity ? (['productQuantity'] as const) : []),
    ...listMissingAmountField({ requirements, values }),
    ...listMissingReferenceNumberField({ requirements, values }),
    ...(requirements.noteMode === OCCURRENCE_FIELD_MODE.required && !facts.hasNote
      ? (['note'] as const)
      : []),
    ...listMissingPhotoField({ photoCount: facts.photoCount, requirements }),
    ...(requirements.signatureMode === OCCURRENCE_FIELD_MODE.required && !facts.hasSignature
      ? (['signature'] as const)
      : []),
  ]
}

/**
 * Spec 246 (RF1c): a foto escolhida entra na lista. Com limite 1 (o que o app sempre fez) ela
 * **substitui**; com mais de uma, acrescenta até o teto — a lista cheia não aceita a próxima.
 */
export function addOccurrencePhoto<TPhoto>(input: {
  readonly current: readonly TPhoto[]
  readonly limit: number
  readonly photo: TPhoto
}): readonly TPhoto[] {
  if (input.limit <= 1) return [input.photo]
  if (input.current.length >= input.limit) return input.current
  return [...input.current, input.photo]
}
