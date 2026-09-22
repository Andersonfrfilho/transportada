/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T17 (RF25): a ponte entre o acerto por item (`trip_occurrence_item_settlements`) e a
 * cobrança que ele gera em `delivery_charges`. Pura, sem I/O — molde de
 * `delivery-charge-state.policy.ts`, que `occurrence-case-state.policy.ts` já citava como o lado que
 * esta política encostaria.
 *
 * O discriminador da cobrança de ocorrência é `charge_type: 'returned_goods'` + `occurrence_id`,
 * **nunca** `origin` — `origin: 'occurrence'` já existe e é da ocorrência de parada (spec 060), fora
 * de escopo aqui. O CHECK do banco (`delivery_charges_returned_goods_origin_check`) amarra os dois.
 */
import type { DeliveryChargeStatus } from '../../database/delivery-client.schema.js'

/**
 * ADR-0048 §5 aplicado aqui: a cobrança de ocorrência nasce direto em `recorded` — o acerto já é
 * gente conferindo o prejuízo, não uma sugestão automática que precisa de confirmação separada.
 */
export const OCCURRENCE_CHARGE_INITIAL_STATUS: DeliveryChargeStatus = 'recorded'

/**
 * RF25: regravar o acerto atualiza a mesma linha **enquanto ela estiver `recorded`**. A partir de
 * `submitted` o valor já foi ao contratante — a linha é imutável por este caminho, e quem chama
 * recusa com `DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED` (409), a mesma máquina de
 * `delivery-charge-state.policy.ts`.
 */
export function isOccurrenceChargeWritable(status: DeliveryChargeStatus): boolean {
  return status === OCCURRENCE_CHARGE_INITIAL_STATUS
}
