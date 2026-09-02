/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T020: o que houve com um item da carga.
 *
 * ⚠️ **O grupo não é enfeite — é ele que decide a permissão.** Ocorrência de separação acontece no
 * galpão e é `trip.manage`; a de entrega acontece na rua e é `trip.report`. É a mesma linha que a
 * ADR-0043 já traçou entre trabalho de barracão e trabalho de rua, e repeti-la aqui mantém as duas
 * coerentes em vez de criar um segundo critério ao lado.
 *
 * ⚠️ **Cópia por valor no frontend** (`trip/shared/occurrence.constant.ts`), como `FUEL_TYPES` e
 * `VEHICLE_TYPES` — o bundle não carrega código da API. Mudou tipo ou grupo de um lado? mude do
 * outro; `test/trip-occurrence/catalog.contract.ts` e o gêmeo no frontend guardam a paridade.
 */

export const TRIP_OCCURRENCE_STAGE = {
  /** No caminhão, na rua: quem responde é quem dirige. */
  delivery: 'delivery',
  /** No galpão, antes de a carga sair: quem responde é quem separa. */
  separation: 'separation',
} as const

export type TripOccurrenceStage = (typeof TRIP_OCCURRENCE_STAGE)[keyof typeof TRIP_OCCURRENCE_STAGE]

/**
 * A ordem é a do fluxo — o que acontece no galpão vem antes do que acontece na rua —, e ela faz
 * parte do contrato: a tela lista nesta ordem, e trocá-la muda o que aparece primeiro para quem
 * está com a caixa na mão.
 */
export const TRIP_OCCURRENCE_TYPES = [
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'item_faltante' },
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'item_avariado' },
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'divergencia_quantidade' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'recusa_total' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'recusa_parcial' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'avaria_transporte' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'destinatario_ausente' },
] as const

export type TripOccurrenceType = (typeof TRIP_OCCURRENCE_TYPES)[number]['type']

const STAGE_BY_TYPE = new Map<string, TripOccurrenceStage>(
  TRIP_OCCURRENCE_TYPES.map((entry) => [entry.type, entry.stage]),
)

/** `null` para tipo fora do catálogo: ausência, nunca um palpite de grupo. */
export function resolveOccurrenceStage(type: string): null | TripOccurrenceStage {
  return STAGE_BY_TYPE.get(type) ?? null
}
