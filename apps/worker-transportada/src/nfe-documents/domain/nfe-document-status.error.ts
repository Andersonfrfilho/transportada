/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { NFE_DOCUMENT_STATUS_INVARIANT_BROKEN } from './nfe-document-status.constant.js'

type NfeDocumentStatusInvariantContext = {
  readonly companyId: string
  readonly step: 'apply-status-change' | 'find-event-id'
}

/**
 * Sob o lock da chave, o `UPDATE` guardado e a releitura do evento não têm como falhar: se falham, o
 * banco mudou por fora do lock. A transação desfaz e a mensagem volta à fila. O código vai na
 * mensagem, como no resto do worker; a chave de acesso nunca.
 */
export class NfeDocumentStatusInvariantError extends Error {
  public override readonly name = 'NfeDocumentStatusInvariantError'
  public readonly code = NFE_DOCUMENT_STATUS_INVARIANT_BROKEN
  public readonly context: NfeDocumentStatusInvariantContext

  public constructor(context: NfeDocumentStatusInvariantContext) {
    super(`${NFE_DOCUMENT_STATUS_INVARIANT_BROKEN} ${JSON.stringify(context)}`)
    this.context = context
  }
}
