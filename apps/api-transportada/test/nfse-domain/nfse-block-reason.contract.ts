/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_BLOCK_REASON } from '../../src/cte-batches/domain/cte-batch-eligibility.policy.js'
import { resolveNfseDocumentBlock } from '../../src/nfe-documents/domain/nfse-document-block.policy.js'

/** A 883663/2: autorizada, completa, com partes e municípios, e sem peso nenhum. */
const DOCUMENT = {
  grossWeight: null,
  recipientCity: 'Ribeirão Preto',
  recipientState: 'SP',
  recipientTaxId: '07531737000180',
  senderCity: 'Taubaté',
  senderState: 'SP',
  senderTaxId: '05868574001090',
  status: 'authorized',
  totalAmount: '916.8000',
  variant: 'complete',
} as const

describe('bloqueio de NFS-e por documento', () => {
  /**
   * O motivo do CT-e não pode governar a seleção de NFS-e: era isso que deixava a nota sem peso
   * impossível de marcar na tabela, mesmo com a API aceitando emiti-la como serviço.
   */
  test('a nota sem peso não é bloqueada para NFS-e', () => {
    expect(
      resolveNfseDocumentBlock({
        document: DOCUMENT,
        linkedBatchId: null,
        linkedNfseInvoiceId: null,
      }),
    ).toBeNull()
  })

  test('nota não autorizada é bloqueada nos dois', () => {
    expect(
      resolveNfseDocumentBlock({
        document: { ...DOCUMENT, status: 'cancelled' },
        linkedBatchId: null,
        linkedNfseInvoiceId: null,
      }),
    ).toBe(CTE_BATCH_BLOCK_REASON.notAuthorized)
  })

  test('nota já em lote de CT-e não emite serviço — seria bitributação', () => {
    expect(
      resolveNfseDocumentBlock({
        document: DOCUMENT,
        linkedBatchId: 'batch-1',
        linkedNfseInvoiceId: null,
      }),
    ).toBe(CTE_BATCH_BLOCK_REASON.alreadyLinked)
  })

  test('nota já com NFS-e emitida não entra numa segunda', () => {
    expect(
      resolveNfseDocumentBlock({
        document: DOCUMENT,
        linkedBatchId: null,
        linkedNfseInvoiceId: 'invoice-1',
      }),
    ).toBe(CTE_BATCH_BLOCK_REASON.linkedToNfse)
  })
})
