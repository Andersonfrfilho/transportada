/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Teto da rota por usuário, entre réplicas; quem protege o orçamento da SEFAZ é o do worker. */
export const NFE_ACCESS_KEY_LOOKUP_REQUEST_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'nfe-access-key-lookups-request',
  store: 'postgres',
  windowSeconds: 60,
} as const

export const NFE_DOCUMENT_ACCESS_KEY_CHECK_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'nfe-document-access-key-checks',
  store: 'postgres',
  windowSeconds: 60,
} as const
