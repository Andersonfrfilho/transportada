/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 222 RF-A1: o teto de notas de `GET /trips/:id/delivery-proofs?documentIds=`. É o teto do
 * diálogo do maço (RNF5), não custo de assinatura — a URL sai por HMAC local, ~0,5 ms cada. Acima
 * dele a rota recusa em vez de truncar: lista cortada em silêncio parece um maço inteiro.
 */
export const DELIVERY_PROOF_BATCH_MAX_DOCUMENT_IDS = 100
