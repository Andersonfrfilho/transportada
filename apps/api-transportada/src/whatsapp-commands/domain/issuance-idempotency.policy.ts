/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN } from '../../database/whatsapp-command.schema.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'

/**
 * D5: a chave de idempotência dos casos de uso sai do **pedido**, nunca da mensagem — é isso que faz
 * o segundo toque em ✅ Confirmar convergir. A confirmação (T013) usa estas mesmas funções; a prévia
 * as monta antes de congelar para recusar um pedido cuja chave as rotas não aceitariam.
 */
export function buildCteBatchIdempotencyKey(input: {
  readonly profileId: string
  readonly requestId: string
}): string {
  return `whatsapp:${input.requestId}:cte:${input.profileId}`
}

/** O `issue` tem chave própria: a do `create` já é do lote, e as duas digitais são diferentes. */
export function buildCteIssueIdempotencyKey(input: {
  readonly profileId: string
  readonly requestId: string
}): string {
  return `whatsapp:${input.requestId}:cte-issue:${input.profileId}`
}

/** O `group_key` do diário para a NFS-e: uma por perfil NFS-e e tomador. */
export function buildNfseGroupKey(input: {
  readonly nfseProfileId: string
  readonly takerTaxId: string
}): string {
  return `${input.nfseProfileId}:${normalizeTaxId(input.takerTaxId)}`
}

export function buildNfseInvoiceIdempotencyKey(input: {
  readonly nfseProfileId: string
  readonly requestId: string
  readonly takerTaxId: string
}): string {
  return `whatsapp:${input.requestId}:nfse:${buildNfseGroupKey(input)}`
}

/** A fatura da liquidação (T014): uma por tomador, e o tomador sai do grupo congelado na prévia. */
export function buildBillingInvoiceIdempotencyKey(input: {
  readonly requestId: string
  readonly takerTaxId: string
}): string {
  return `whatsapp:${input.requestId}:billing:${normalizeTaxId(input.takerTaxId)}`
}

export class WhatsAppCommandIdempotencyKeyInvalidError extends Error {
  public constructor() {
    super('WHATSAPP_COMMAND_IDEMPOTENCY_KEY_INVALID')
    this.name = 'WhatsAppCommandIdempotencyKeyInvalidError'
  }
}

export function assertIdempotencyKeys(keys: readonly string[]): void {
  for (const key of keys) {
    if (!WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new WhatsAppCommandIdempotencyKeyInvalidError()
    }
  }
}
