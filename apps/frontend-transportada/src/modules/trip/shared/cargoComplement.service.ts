/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isOverEarlierDeliveryBox, OVER_EARLIER_DELIVERY_REASON } from './cargoOverEarlier.service'

/**
 * Spec 120: os dois motivos que marcam uma caixa como "do complemento" — ela entrou fora do mapa
 * recomendado, funda demais para a mão de quem descarrega de pé no piso (`outOfReach`) ou furando a
 * ordem de descarga, obrigando alguém a remanejar outra entrega para chegar nela
 * (`needsRehandling`). Caixa sem nenhum dos dois é "do mapa recomendado".
 */
export const CARGO_COMPLEMENT_KINDS = [
  'needsRehandling',
  'outOfReach',
  OVER_EARLIER_DELIVERY_REASON,
] as const
export type CargoComplementKind = (typeof CARGO_COMPLEMENT_KINDS)[number]

type ComplementBox = Readonly<{ reasons: readonly string[] }>

/**
 * Classifica a caixa pelo motivo mais forte.
 *
 * ⚠️ **Uma caixa pode carregar os dois motivos ao mesmo tempo, e `needsRehandling` vence** — é o
 * aviso mais grave, e desenhar as duas marcas juntas não ajudaria quem carrega a decidir nada.
 *
 * Spec 148 D5: `overEarlierDelivery` vem sempre com `needsRehandling` e vence os dois — a caixa está
 * por cima de entrega que desce antes, e tem marca própria no desenho.
 */
export function resolveCargoComplement(box: ComplementBox): CargoComplementKind | null {
  if (isOverEarlierDeliveryBox(box)) return OVER_EARLIER_DELIVERY_REASON
  if (box.reasons.includes('needsRehandling')) return 'needsRehandling'
  if (box.reasons.includes('outOfReach')) return 'outOfReach'
  return null
}

export function isComplementBox(box: ComplementBox): boolean {
  return resolveCargoComplement(box) !== null
}
