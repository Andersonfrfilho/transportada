/* Copyright (c) 2026 Ada Technology. MIT License. */
/** ⚠️ Cópia por valor do que a API devolve (`apps/api-transportada/src/cargo-receiving/domain/cargo-preview-trip-draft.types.ts`). */
export const CARGO_TRIP_DRAFT_CANNOT_PROPOSE_REASONS = [
  'no_linked_documents',
  'none_routable',
] as const

/** O teto de notas por proposta do roteirizador (`MAX_STOPS_PER_SUGGESTION` da API): acima dele a API recusa com 400. */
export const CARGO_TRIP_DRAFT_SOLVER_DOCUMENT_LIMIT = 500

/** A recomendação aberta e o roteiro escolhido moram na URL (`web.md` §7), ao lado dos filtros do detalhe. */
export const CARGO_TRIP_DRAFT_URL_PARAMETERS = {
  open: 'recommend',
  routeName: 'draftRoute',
} as const
export const CARGO_TRIP_DRAFT_OPEN_VALUE = '1'

/** Os motivos, na ordem do aviso "notas que ficam de fora"; o estado é o do filtro do detalhe a que o atalho leva. */
export const CARGO_TRIP_DRAFT_OUTSIDE_KINDS = [
  'in_live_trip',
  'awaiting_xml',
  'suggested',
  'ambiguous',
  'invalid',
] as const
