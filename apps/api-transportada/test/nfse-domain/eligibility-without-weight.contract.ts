/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH_BLOCK_REASON,
  checkDocumentEligibility,
} from '../../src/cte-batches/domain/cte-batch-eligibility.policy.js'
import {
  type NfseSelectionBlockReason,
  type NfseSelectionDocument,
  type NfseSelectionProfile,
  selectNfseCandidates,
} from '../../src/nfse-invoices/domain/nfse-selection.policy.js'
import type { NfsePartyAddress } from '../../src/nfse-invoices/domain/nfse-taker-address.policy.js'

const SENDER_ADDRESS: NfsePartyAddress = {
  city: 'Taubaté',
  complement: null,
  district: 'Jardim Baronesa',
  number: '6707',
  phone: '2430768250',
  postalCode: '12091000',
  state: 'SP',
  street: 'Avenida Dom Pedro I',
}

const RECIPIENT_ADDRESS: NfsePartyAddress = {
  city: 'Ribeirão Preto',
  complement: null,
  district: 'Parque Residencial Lagoinha',
  number: '432',
  phone: '1640094800',
  postalCode: '14095120',
  state: 'SP',
  street: 'Rua Marechal Mascarenhas de Morais',
}

const PROFILE: NfseSelectionProfile = {
  chargeComponentLabel: 'Frete',
  components: [],
  id: 'profile-1',
  issRate: '0.020000',
  ruleSnapshot: {
    freightRuleId: 'rule-1',
    freightRuleVersionId: 'rule-version-1',
    maximumAmount: null,
    minimumAmount: null,
    percentage: '0.100000',
    ruleVersion: '1',
    type: 'percentage_of_invoice_total',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  },
  taker: '3',
}

/**
 * Caso real: NF-e 883663/2 da Zaragoza, autorizada em 28/08/2026, com `qVol` 20 e `pesoB` 0.000.
 * O emitente declarou os volumes e não declarou a massa — nada que a transportadora corrija na
 * origem, e o XML é preservado.
 */
const ZARAGOZA_883663 = {
  accessKey: '35260805868574001090550020008836631872096574',
  documentId: 'document-883663',
  issuedAt: '2026-08-29T01:21:42.000Z',
  number: '883663',
  recipientAddress: RECIPIENT_ADDRESS,
  recipientCity: 'Ribeirão Preto',
  recipientLegalName: 'Rede 10 Dist Atac de P Alimenticios LTDA',
  recipientState: 'SP',
  recipientTaxId: '07531737000180',
  senderAddress: SENDER_ADDRESS,
  senderCity: 'Taubaté',
  senderLegalName: 'Comercial Zaragoza Imp Exp LTDA',
  senderState: 'SP',
  senderTaxId: '05868574001090',
  series: '2',
  status: 'authorized',
  totalAmount: '916.8000',
  variant: 'complete',
} satisfies NfseSelectionDocument

describe('elegibilidade de NFS-e sem peso da carga', () => {
  test('a nota com peso zerado pelo emitente é elegível para NFS-e', () => {
    const selection = selectNfseCandidates({
      cteBatchLinks: new Map(),
      documentIds: [ZARAGOZA_883663.documentId],
      documents: [ZARAGOZA_883663],
      nfseLinks: new Map(),
      profile: PROFILE,
    })

    expect(selection.blocked).toEqual([])
    expect(selection.candidates).toHaveLength(1)
  })

  /**
   * A assimetria é o ponto da feature: o RPS não declara massa, o CT-e declara. Se este teste
   * cair junto com o de cima, alguém tirou o gate dos dois de uma vez.
   */
  test('a mesma nota segue inelegível para CT-e, por falta de peso', () => {
    const eligibility = checkDocumentEligibility({ ...ZARAGOZA_883663, grossWeight: '0.0000' })

    expect(eligibility.reason).toBe(CTE_BATCH_BLOCK_REASON.missingWeight)
  })

  test('o vocabulário de bloqueio da NFS-e não admite o motivo de peso', () => {
    const weightReason: string = CTE_BATCH_BLOCK_REASON.missingWeight
    const nfseReasons: readonly NfseSelectionBlockReason[] = [
      'NFSE_DOCUMENT_ALREADY_LINKED',
      'NFSE_DOCUMENT_DUPLICATED',
      'NFSE_DOCUMENT_LINKED_TO_CTE_BATCH',
      'NFSE_DOCUMENT_MISSING_TAKER_ADDRESS',
      'NFSE_DOCUMENT_MISSING_TAKER_NAME',
      'NFSE_DOCUMENT_NOT_FOUND',
      CTE_BATCH_BLOCK_REASON.missingMunicipality,
      CTE_BATCH_BLOCK_REASON.missingParty,
      CTE_BATCH_BLOCK_REASON.missingTotal,
      CTE_BATCH_BLOCK_REASON.notAuthorized,
      CTE_BATCH_BLOCK_REASON.summaryOnly,
    ]

    expect(nfseReasons).not.toContain(weightReason)
  })
})
