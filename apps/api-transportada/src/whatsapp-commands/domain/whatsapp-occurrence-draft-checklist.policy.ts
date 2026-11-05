/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15 (desenho 3.4): **o que falta para a ocorrência ser registrada pelo WhatsApp.** Decisão
 * pura, sem banco: recebe a exigência efetiva do tipo para a nota (a mesma do app,
 * `resolveDocumentOccurrenceRequirements`: tipo + exceção da contratante + exceção do destinatário,
 * campo a campo) e o que o motorista já mandou.
 *
 * - O WhatsApp colhe **foto** (com o mínimo do tipo), **número do documento do cliente** e **valor pago
 *   da ocorrência**. A observação já é colhida pelo fluxo antes de chegar aqui.
 * - **Assinatura**, **produtos** e o valor pago **por item** só existem no app: obrigatórios, a
 *   ocorrência não abre coleta e segue a recusa de sempre ("registre pelo aplicativo").
 * - `off` nunca é pedido; `optional` é oferecido uma vez e aceita "pular"; `required` insiste.
 */
import {
  OCCURRENCE_DECLARED_AMOUNT_SCOPE,
  OCCURRENCE_PHOTO_MINIMUM_COUNT,
} from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceRequirements } from '../../trips/domain/occurrence-requirements.policy.js'

export const OCCURRENCE_DRAFT_ITEM = {
  declaredAmount: 'declared_amount',
  photo: 'photo',
  referenceNumber: 'reference_number',
} as const

export type OccurrenceDraftItem = (typeof OCCURRENCE_DRAFT_ITEM)[keyof typeof OCCURRENCE_DRAFT_ITEM]

export const OCCURRENCE_DRAFT_ITEM_ORDER: readonly OccurrenceDraftItem[] = [
  OCCURRENCE_DRAFT_ITEM.photo,
  OCCURRENCE_DRAFT_ITEM.referenceNumber,
  OCCURRENCE_DRAFT_ITEM.declaredAmount,
]

/** O teto de fotos de uma ocorrência (o mesmo da rota do app). */
export const OCCURRENCE_DRAFT_PHOTO_LIMIT = OCCURRENCE_PHOTO_MINIMUM_COUNT.max

export type OccurrenceAppOnlyField = 'declared_amount' | 'items' | 'signature'

export type CollectedOccurrenceDraft = {
  readonly hasDeclaredAmount: boolean
  readonly hasReferenceNumber: boolean
  readonly photoCount: number
  readonly skipped: ReadonlySet<string>
}

export type OccurrenceDraftQuestion = {
  readonly item: OccurrenceDraftItem
  readonly optional: boolean
  /** Só para `photo`: quantas ainda faltam para o mínimo (0 quando é opcional). */
  readonly remaining: number
}

export type OccurrenceDraftChecklist = {
  /** O obrigatório que o WhatsApp não colhe: com algum, não há coleta. */
  readonly appOnly: readonly OccurrenceAppOnlyField[]
  /** O que a exigência deixa o WhatsApp pedir (obrigatório ou opcional), mesmo já respondido. */
  readonly asks: readonly OccurrenceDraftItem[]
  readonly missing: readonly OccurrenceDraftQuestion[]
  readonly next: OccurrenceDraftQuestion | null
  readonly ready: boolean
}

export function resolveOccurrenceDraftChecklist(input: {
  readonly collected: CollectedOccurrenceDraft
  readonly requirements: OccurrenceRequirements
}): OccurrenceDraftChecklist {
  const { collected, requirements } = input
  const amountByItem = requirements.declaredAmountScope === OCCURRENCE_DECLARED_AMOUNT_SCOPE.item
  const appOnly: OccurrenceAppOnlyField[] = []
  if (requirements.signatureMode === 'required') appOnly.push('signature')
  if (requirements.itemsMode === 'required') appOnly.push('items')
  if (amountByItem && requirements.declaredAmountMode === 'required')
    appOnly.push('declared_amount')

  const modeOf = (item: OccurrenceDraftItem) => {
    switch (item) {
      case OCCURRENCE_DRAFT_ITEM.photo:
        return requirements.photoMode
      case OCCURRENCE_DRAFT_ITEM.referenceNumber:
        return requirements.referenceNumberMode
      case OCCURRENCE_DRAFT_ITEM.declaredAmount:
        return amountByItem ? 'off' : requirements.declaredAmountMode
    }
  }

  const status = (item: OccurrenceDraftItem): OccurrenceDraftQuestion | null => {
    const mode = modeOf(item)
    if (mode === 'off') return null
    if (item === OCCURRENCE_DRAFT_ITEM.photo) {
      if (mode === 'required') {
        const minimum = Math.min(
          OCCURRENCE_DRAFT_PHOTO_LIMIT,
          Math.max(1, requirements.photoMinimumCount),
        )
        const remaining = Math.max(0, minimum - collected.photoCount)
        return remaining === 0 ? null : { item, optional: false, remaining }
      }
      return collected.photoCount > 0 || collected.skipped.has(item)
        ? null
        : { item, optional: true, remaining: 0 }
    }
    const present =
      item === OCCURRENCE_DRAFT_ITEM.referenceNumber
        ? collected.hasReferenceNumber
        : collected.hasDeclaredAmount
    if (present) return null
    if (mode === 'optional') {
      return collected.skipped.has(item) ? null : { item, optional: true, remaining: 0 }
    }
    return { item, optional: false, remaining: 0 }
  }

  const asks = OCCURRENCE_DRAFT_ITEM_ORDER.filter((item) => modeOf(item) !== 'off')
  const open = OCCURRENCE_DRAFT_ITEM_ORDER.map(status).filter(
    (question): question is OccurrenceDraftQuestion => question !== null,
  )
  const next = open[0] ?? null
  return {
    appOnly,
    asks,
    missing: open.filter((question) => !question.optional),
    next,
    ready: next === null && appOnly.length === 0,
  }
}
