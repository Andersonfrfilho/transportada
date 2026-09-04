/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  resolveOccurrenceStage,
  TRIP_OCCURRENCE_STAGE,
} from '../../shared/trip-occurrence.constant.js'
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'

/**
 * Spec 079 T020: quem pode registrar cada ocorrência.
 *
 * ⚠️ **A permissão sai do tipo, não da rota.** Uma rota só, autorizada por `trip.manage` e aceitando
 * qualquer tipo no corpo, deixaria quem trabalha no galpão registrar `recusa_total` — ocorrência de
 * rua — sem nunca ter estado lá. O separador tem `trip.manage` e **não** tem `trip.report`, e é
 * essa diferença que a política precisa preservar.
 *
 * A linha entre barracão e rua é a mesma da ADR-0043, que já a traçou para separar/carregar contra
 * devolver/entregar. Repeti-la aqui mantém as duas coerentes em vez de criar um segundo critério.
 *
 * `null` para tipo fora do catálogo: cair num padrão — o mais frouxo ou o mais estrito — seria
 * decidir autorização por omissão.
 */
export function resolveOccurrencePermission(type: string): null | 'trip.manage' | 'trip.report' {
  const stage = resolveOccurrenceStage(type)
  if (stage === null) return null

  return stage === TRIP_OCCURRENCE_STAGE.separation ? 'trip.manage' : 'trip.report'
}

/**
 * A rota do galpão não grava ocorrência de rua, e vice-versa. Sem esta guarda, `POST
 * .../occurrences/separation` — autorizada por `trip.manage` — aceitaria `recusa_total` no corpo e
 * daria a quem separa a capacidade que `trip.report` existe para reservar.
 */
export function acceptsOccurrenceType(input: {
  readonly stage: TripOccurrenceStage
  readonly type: string
}): boolean {
  return resolveOccurrenceStage(input.type) === input.stage
}
