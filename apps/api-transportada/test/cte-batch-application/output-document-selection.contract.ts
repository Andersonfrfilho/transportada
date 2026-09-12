/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { selectCteBatchCandidates } from '../../src/cte-batches/application/cte-batch-selection.service.js'
import type { CteBatchPreviewDocument } from '../../src/cte-batches/application/cte-batch-preview.port.js'
import { CTE_BATCH_BLOCK_REASON } from '../../src/cte-batches/domain/cte-batch-eligibility.policy.js'
import {
  REFERENCE_DOCUMENT,
  REFERENCE_DOCUMENT_ID,
  createProfileFixture,
} from './preview-support.js'

const NFSE_PROFILE_ID = '00000000-0000-4000-8000-000000000a01'

const DOCUMENT: CteBatchPreviewDocument = {
  ...REFERENCE_DOCUMENT,
  recipientCityCode: '3523909',
  senderCityCode: '3554102',
}

function select(profile: ReturnType<typeof createProfileFixture>) {
  return selectCteBatchCandidates({
    catalog: [profile],
    documentIds: [REFERENCE_DOCUMENT_ID],
    documents: [DOCUMENT],
    links: [],
    nfseLinks: [],
  })
}

/**
 * Sem este portão a tela mostraria "vai para NFS-e" e o botão de CT-e continuaria aceitando a nota —
 * a regra fiscal escondida no sentido inverso (spec 144 D3).
 */
describe('seleção do lote de CT-e e o documento de saída do perfil', () => {
  test('recusa a nota cujo perfil manda para NFS-e', () => {
    const result = select(
      createProfileFixture({ nfseEmissionProfileId: NFSE_PROFILE_ID, outputDocument: 'nfse' }),
    )

    expect(result.candidates).toEqual([])
    expect(result.blocked).toEqual([
      {
        batchId: null,
        documentId: REFERENCE_DOCUMENT_ID,
        reason: CTE_BATCH_BLOCK_REASON.outputNfse,
      },
    ])
  })

  /** Com o padrão `cte` nada muda: a mesma nota segue candidata. */
  test('mantém a nota cujo perfil é o padrão cte', () => {
    const result = select(createProfileFixture())

    expect(result.blocked).toEqual([])
    expect(result.candidates).toHaveLength(1)
  })
})
