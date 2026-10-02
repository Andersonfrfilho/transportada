/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 RF-A1: a fronteira de `GET /trips/:id/delivery-proofs`. Chave desconhecida é recusa
 * (molde de `readListQuery`) — em particular `companyId`: a empresa só vem do contexto autenticado.
 */
import {
  invalidRequest,
  parseUuidPathIdentifier,
  readListQuery,
} from '../../http/request-parsing.service.js'
import { DELIVERY_PROOF_BATCH_MAX_DOCUMENT_IDS } from '../domain/delivery-proof-batch.constant.js'

const ALLOWED_KEYS = new Set(['documentIds'])
const DOCUMENT_IDS_SEPARATOR = ','

export function parseTripDeliveryProofsQuery(url: URL): {
  readonly documentIds: readonly string[] | undefined
} {
  const value = readListQuery(url, ALLOWED_KEYS).get('documentIds')
  if (value === null) return { documentIds: undefined }

  const parts = value.split(DOCUMENT_IDS_SEPARATOR)
  if (parts.length > DELIVERY_PROOF_BATCH_MAX_DOCUMENT_IDS) throw invalidRequest()

  return { documentIds: [...new Set(parts.map(parseUuidPathIdentifier))] }
}
