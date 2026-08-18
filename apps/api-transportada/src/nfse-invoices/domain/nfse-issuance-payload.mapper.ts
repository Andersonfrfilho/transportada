/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  NfseFrozenIssuancePayload,
  NfseLastIssuancePayload,
} from '../application/nfse-invoice.port.js'

type FrozenPayloadShape = {
  readonly cnaeCode: string
  readonly description: string
  readonly documents: readonly unknown[]
  readonly issAmount: string
  readonly issExigibility: string
  readonly issRate: string
  readonly issWithheld: boolean
  readonly municipalTaxationCode: string
  readonly municipalityIbgeCode: string
  readonly nbsCode: string
  readonly serviceAmount: string
  readonly serviceListItem: string
  readonly taker: { readonly legalName: string; readonly taxId: string }
}

/**
 * O mesmo objeto que `freezeNfseIssuancePayload` gravou, achatado nos campos que o diálogo de
 * reemissão do frontend usa para pré-preencher os nove corrigíveis e mostrar o resumo
 * somente-leitura — sem recalcular nada aqui.
 */
export function extractLastIssuancePayload(
  frozen: NfseFrozenIssuancePayload,
): NfseLastIssuancePayload {
  const payload = frozen.payload as unknown as FrozenPayloadShape

  return {
    cnaeCode: payload.cnaeCode,
    description: payload.description,
    documentCount: payload.documents.length,
    issAmount: payload.issAmount,
    issExigibility: payload.issExigibility,
    issRate: payload.issRate,
    issWithheld: payload.issWithheld,
    municipalTaxationCode: payload.municipalTaxationCode,
    municipalityIbgeCode: payload.municipalityIbgeCode,
    nbsCode: payload.nbsCode,
    serviceAmount: payload.serviceAmount,
    serviceListItem: payload.serviceListItem,
    takerLegalName: payload.taker.legalName,
    takerTaxId: payload.taker.taxId,
  }
}
