/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve (`cargo-arrival.constant.ts`, `database/trip.schema.ts`). */
export const CARGO_RETURN_STATES = ['none', 'marked', 'returned'] as const
export const CARGO_OCCURRENCE_CASE_STATUSES = [
  'recorded',
  'under_review',
  'returned_to_warehouse',
  'awaiting_contractor',
  'decided',
  'closed',
  'cancelled',
] as const
export const CARGO_OCCURRENCE_ITEMS_MODES = ['required', 'optional', 'off'] as const

/** Concluir a devolução é gesto físico: só com a decisão do contratante (`cargo-arrival-return.policy.ts`). */
export const CARGO_DECIDED_CASE_STATUSES: readonly string[] = ['decided', 'closed']

export const CARGO_RETURN_ACTIONS = ['mark', 'unmark', 'complete'] as const

export const CARGO_OCCURRENCE_LIMITS = {
  /** `OCCURRENCE_NOTE_MAX_LENGTH` da API. */
  noteMaxLength: 500,
  /** `OCCURRENCE_PHOTO_MAX_BYTES` da API: o teto do galpão, 512 KiB. */
  photoMaxBytes: 512 * 1024,
  photoMaxKibibytes: 512,
} as const

export const CARGO_OCCURRENCE_PATHS = {
  types: '/cargo-arrivals/occurrence-types',
} as const

/** Nomes dos campos do multipart: a lista fechada de `parseRegisterOccurrenceMultipartRequest`. */
export const CARGO_OCCURRENCE_FIELD = {
  file: 'file',
  note: 'note',
  occurrenceTypeId: 'occurrenceTypeId',
  productCodes: 'productCodes',
  productQuantities: 'productQuantities',
  productQuantityUnits: 'productQuantityUnits',
  thumbnail: 'thumbnail',
} as const

/** As unidades que a API aceita além da comercial de cada item (`OCCURRENCE_ITEM_QUANTITY_UNIT`). */
export const CARGO_OCCURRENCE_FALLBACK_UNITS = ['box', 'unit'] as const
export const CARGO_OCCURRENCE_DEFAULT_UNIT = 'unit'

export const CARGO_OCCURRENCE_ERROR = {
  windowClosed: 'CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED',
} as const

export const CARGO_OCCURRENCE_QUERY_SEGMENT = {
  occurrences: 'occurrences',
  products: 'products',
  types: 'occurrence-types',
} as const

export const CARGO_OCCURRENCE_IMAGE_MIME_PREFIX = 'image/'
