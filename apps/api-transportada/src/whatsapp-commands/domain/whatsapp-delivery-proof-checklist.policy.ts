/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15 (desenho 3.4): **o que falta para a entrega fechar pelo WhatsApp.** Decisão pura, sem
 * banco: recebe a configuração do comprovante já resolvida para a nota (a mesma do app,
 * `resolveProofFieldSettings`: geral + exceção da contratante + exceção do destinatário) e o que o
 * motorista já mandou, e devolve a próxima pergunta, o que ainda é obrigatório e o que só o app colhe.
 *
 * Regras (Anderson, 04/11):
 * - **o bot só exige o que a configuração exigir**: `off` nunca é pedido; `optional` é oferecido uma
 *   vez e aceita "pular"; `required` insiste;
 * - a localização é só oferecida (nenhuma configuração a exige) e nunca segura a entrega;
 * - a assinatura não existe no WhatsApp: obrigatória, a entrega fica em preparo e o aviso manda
 *   completar no app;
 * - "quem recebeu" e o nome de quem recebeu moram no comprovante do canhoto (spec 193 D4): sem canhoto
 *   (desligado, ou opcional e pulado) não há onde gravá-los, então não são pedidos.
 */
import type { DeliveryProofFieldSettings } from '../../trips/domain/delivery-proof-settings.policy.js'

export const DELIVERY_PROOF_ITEM = {
  cargo: 'cargo',
  location: 'location',
  photo: 'photo',
  receivedBy: 'received_by',
  receiverName: 'receiver_name',
} as const

export type DeliveryProofItem = (typeof DELIVERY_PROOF_ITEM)[keyof typeof DELIVERY_PROOF_ITEM]

/** A ordem das perguntas: a localização primeiro (vale para o momento da entrega), depois as fotos. */
export const DELIVERY_PROOF_ITEM_ORDER: readonly DeliveryProofItem[] = [
  DELIVERY_PROOF_ITEM.location,
  DELIVERY_PROOF_ITEM.photo,
  DELIVERY_PROOF_ITEM.cargo,
  DELIVERY_PROOF_ITEM.receivedBy,
  DELIVERY_PROOF_ITEM.receiverName,
]

export function isDeliveryProofItem(value: unknown): value is DeliveryProofItem {
  return typeof value === 'string' && DELIVERY_PROOF_ITEM_ORDER.includes(value as DeliveryProofItem)
}

/** O que a preparação já tem. `skipped` são os opcionais pulados (ou já oferecidos, no caso da localização). */
export type CollectedDeliveryProof = {
  readonly cargoCount: number
  readonly hasLocation: boolean
  readonly hasReceivedBy: boolean
  readonly hasReceiverName: boolean
  readonly photoCount: number
  readonly skipped: ReadonlySet<string>
}

export type DeliveryProofQuestion = {
  readonly item: DeliveryProofItem
  /** `true` aceita "pular". */
  readonly optional: boolean
  /** Só para `cargo`: quantas fotos ainda faltam para o mínimo (0 quando é opcional). */
  readonly remaining: number
}

export type MissingDeliveryProof = {
  readonly item: Exclude<DeliveryProofItem, 'location'>
  /** `cargo`: quantas fotos ainda faltam. */
  readonly remaining: number
}

export type DeliveryProofChecklist = {
  /** O que a configuração exige e o WhatsApp não colhe: hoje só a assinatura. */
  readonly appOnly: readonly 'signature'[]
  /** Os obrigatórios que ainda não chegaram, na ordem das perguntas. */
  readonly missing: readonly MissingDeliveryProof[]
  /** A próxima pergunta, ou `null` quando não há mais nada a perguntar. */
  readonly next: DeliveryProofQuestion | null
  /** Tudo o que a configuração exige chegou e não há opcional por oferecer: pode confirmar. */
  readonly ready: boolean
}

export function resolveDeliveryProofChecklist(input: {
  readonly collected: CollectedDeliveryProof
  readonly settings: DeliveryProofFieldSettings
}): DeliveryProofChecklist {
  const { collected, settings } = input
  const skipped = collected.skipped
  const cargoMinimum = settings.cargo === 'required' ? Math.max(1, settings.cargoMinimumCount) : 0
  const photoAbandoned =
    settings.photo === 'off' || (collected.photoCount === 0 && skipped.has('photo'))
  const personFieldsApply = collected.photoCount > 0 || !photoAbandoned

  const status = (item: DeliveryProofItem): DeliveryProofQuestion | null => {
    switch (item) {
      case DELIVERY_PROOF_ITEM.location:
        return collected.hasLocation || skipped.has(item)
          ? null
          : { item, optional: true, remaining: 0 }
      case DELIVERY_PROOF_ITEM.photo:
        return pending(settings.photo, collected.photoCount > 0, skipped.has(item), item)
      case DELIVERY_PROOF_ITEM.cargo: {
        if (settings.cargo === 'off') return null
        if (settings.cargo === 'required') {
          const remaining = Math.max(0, cargoMinimum - collected.cargoCount)
          return remaining === 0 ? null : { item, optional: false, remaining }
        }
        return collected.cargoCount > 0 || skipped.has(item)
          ? null
          : { item, optional: true, remaining: 0 }
      }
      case DELIVERY_PROOF_ITEM.receivedBy:
        return personFieldsApply
          ? pending(settings.receivedBy, collected.hasReceivedBy, skipped.has(item), item)
          : null
      case DELIVERY_PROOF_ITEM.receiverName:
        return personFieldsApply
          ? pending(settings.receiverName, collected.hasReceiverName, skipped.has(item), item)
          : null
    }
  }

  const open = DELIVERY_PROOF_ITEM_ORDER.map(status).filter(
    (question): question is DeliveryProofQuestion => question !== null,
  )
  const missing = open
    .filter((question) => !question.optional && question.item !== DELIVERY_PROOF_ITEM.location)
    .map((question) => ({
      item: question.item as MissingDeliveryProof['item'],
      remaining: question.remaining,
    }))
  const appOnly = settings.signature === 'required' ? (['signature'] as const) : []
  const next = open[0] ?? null

  return { appOnly, missing, next, ready: next === null && appOnly.length === 0 }
}

function pending(
  mode: DeliveryProofFieldSettings['photo'],
  present: boolean,
  skipped: boolean,
  item: DeliveryProofItem,
): DeliveryProofQuestion | null {
  if (mode === 'off' || present) return null
  if (mode === 'optional') return skipped ? null : { item, optional: true, remaining: 0 }
  return { item, optional: false, remaining: 0 }
}
