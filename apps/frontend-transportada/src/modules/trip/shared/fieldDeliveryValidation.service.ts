/* Copyright (c) 2026 Ada Technology. MIT License. */

export const FIELD_DELIVERY_DELIVERED_AT_ERROR = {
  IN_FUTURE: 'DELIVERED_AT_IN_FUTURE',
  BEFORE_DISPATCH: 'DELIVERED_AT_BEFORE_DISPATCH',
} as const

export type FieldDeliveryDeliveredAtError =
  (typeof FIELD_DELIVERY_DELIVERED_AT_ERROR)[keyof typeof FIELD_DELIVERY_DELIVERED_AT_ERROR]

export type ValidateFieldDeliveryDeliveredAtParams = Readonly<{
  deliveredAt: string
  dispatchedAt: null | string
  now: Date
}>

/**
 * Spec 156 D4/plan.md item 4: espelha a régua da API (`deliveredAt` não aceita hora futura nem
 * anterior ao despacho da viagem) para a tela recusar antes da viagem de rede — a API continua
 * sendo quem decide de fato, e responde 400 quando esta função, por algum motivo, discordar dela.
 */
export function validateFieldDeliveryDeliveredAt({
  deliveredAt,
  dispatchedAt,
  now,
}: ValidateFieldDeliveryDeliveredAtParams): FieldDeliveryDeliveredAtError | undefined {
  const deliveredAtTime = new Date(deliveredAt).getTime()
  if (Number.isNaN(deliveredAtTime) || deliveredAtTime > now.getTime()) {
    return FIELD_DELIVERY_DELIVERED_AT_ERROR.IN_FUTURE
  }
  if (dispatchedAt === null) return undefined

  const dispatchedAtTime = new Date(dispatchedAt).getTime()
  if (!Number.isNaN(dispatchedAtTime) && deliveredAtTime < dispatchedAtTime) {
    return FIELD_DELIVERY_DELIVERED_AT_ERROR.BEFORE_DISPATCH
  }
  return undefined
}
