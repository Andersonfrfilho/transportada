/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 247: os modos de um campo do tipo (o mesmo vocabulário do servidor) e onde o valor pago se digita. */
export const OCCURRENCE_FIELD_MODE = {
  off: 'off',
  optional: 'optional',
  required: 'required',
} as const

export const OCCURRENCE_AMOUNT_SCOPE = { item: 'item', occurrence: 'occurrence' } as const

export const OCCURRENCE_QUANTITY_PROBLEM = {
  aboveNote: 'above-note',
  missing: 'missing',
  tooManyDecimals: 'too-many-decimals',
  tooManyDigits: 'too-many-digits',
} as const
