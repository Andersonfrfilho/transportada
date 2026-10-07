/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T4.4): a linha da NF-e como a porta do registro do motorista a lê — com unidade, ordem,
 * quantidade e valor unitário. Os dublês que só precisam do código usam estes valores neutros.
 */
export const NEUTRAL_DOCUMENT_PRODUCT_LINE = {
  commercialUnit: 'UN',
  ordinal: 1,
  quantity: '1.0000',
  unitValue: '1.0000',
} as const
