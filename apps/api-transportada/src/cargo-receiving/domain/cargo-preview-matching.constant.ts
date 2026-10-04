/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (T4.3): os estados, as evidências e os tetos do vínculo linha ↔ nota.
 */

export const CARGO_PREVIEW_MATCH_STATES = [
  'matched',
  'ambiguous',
  'suggested',
  'awaiting_xml',
] as const
export type CargoPreviewMatchState = (typeof CARGO_PREVIEW_MATCH_STATES)[number]

/** Na ordem em que saem no resultado — a mais forte primeiro. */
export const CARGO_PREVIEW_MATCH_EVIDENCE = [
  'route_load',
  'recipient_alias',
  'postal_code',
  'recipient_name',
  'value',
  'weight',
  'sum',
] as const
export type CargoPreviewMatchEvidence = (typeof CARGO_PREVIEW_MATCH_EVIDENCE)[number]

/**
 * Teto da partição por cliente: 6 linhas são 63 subconjuntos. O medido foi ≤ 3 (FR-24-09 e
 * FR-28-09). Acima dele só se tenta 1 linha ↔ 1 nota; o que dependeria de soma fica para o operador.
 */
export const MAX_PARTITION_LINES = 6

/** Nós da busca por cliente; passou, as linhas com candidata viram `ambiguous` — nunca trava. */
export const MAX_PARTITION_SEARCH_NODES = 5_000

/** O `infCpl` é texto de terceiro: o padrão do perfil só roda sobre os primeiros 2 000 caracteres. */
export const LOAD_REFERENCE_INPUT_MAX_LENGTH = 2_000

export const MONEY_DECIMALS = 2
export const WEIGHT_DECIMALS = 3
/** Tolerância em centésimos de ponto percentual: `numeric(5,2)` do perfil, sem float na conta. */
export const TOLERANCE_HUNDREDTHS_PER_PERCENT = 100
export const TOLERANCE_DENOMINATOR = 10_000n
