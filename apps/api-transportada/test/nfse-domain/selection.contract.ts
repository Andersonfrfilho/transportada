/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  type CteBatchProjectionDocument,
  projectCteBatchCharges,
} from '../../src/cte-batches/domain/cte-batch-projection.service.js'
import type { ChargeComponentDefinition } from '../../src/cte-profiles/domain/charge-composition.service.js'
import type { FreightRuleSnapshot } from '../../src/freight-calculations/domain/freight-calculation-engine.service.js'
import { projectNfseInvoices } from '../../src/nfse-invoices/domain/nfse-projection.service.js'
import {
  NFSE_SELECTION_BLOCK_REASON,
  type NfseSelectionDocument,
  type NfseSelectionProfile,
  selectNfseCandidates,
} from '../../src/nfse-invoices/domain/nfse-selection.policy.js'
import type { NfsePartyAddress } from '../../src/nfse-invoices/domain/nfse-taker-address.policy.js'

const ISSUED_AT = '2026-08-01T12:00:00.000Z'
const SENDER_TAX_ID = '11111111000191'
const RECIPIENT_TAX_ID = '22222222000191'
const OTHER_RECIPIENT_TAX_ID = '33333333000191'

const RULE_SNAPSHOT: FreightRuleSnapshot = {
  freightRuleId: 'rule-1',
  freightRuleVersionId: 'rule-version-1',
  maximumAmount: null,
  minimumAmount: null,
  percentage: '0.100000',
  ruleVersion: '1',
  type: 'percentage_of_invoice_total',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
}

const COMPONENTS: readonly ChargeComponentDefinition[] = [
  {
    amount: null,
    calculationType: 'percentage_of_freight',
    label: 'GRIS',
    ordinal: 1n,
    rate: '0.050000',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  },
  {
    amount: '12.5000',
    calculationType: 'fixed_amount',
    label: 'Pedágio',
    ordinal: 2n,
    rate: null,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  },
]

const PROFILE: NfseSelectionProfile = {
  chargeComponentLabel: 'Frete',
  components: COMPONENTS,
  id: 'profile-1',
  issRate: '0.020000',
  ruleSnapshot: RULE_SNAPSHOT,
  taker: '3',
}

const RECIPIENT_ADDRESS: NfsePartyAddress = {
  city: 'Ribeirão Preto',
  complement: 'Sala 12',
  district: 'Centro',
  number: '1500',
  phone: '1633334444',
  postalCode: '14010100',
  state: 'SP',
  street: 'Avenida Nove de Julho',
}

const SENDER_ADDRESS: NfsePartyAddress = {
  city: 'São Paulo',
  complement: null,
  district: 'Brás',
  number: '210',
  phone: null,
  postalCode: '03042000',
  state: 'SP',
  street: 'Rua do Depósito',
}

function buildDocument(
  overrides: Partial<NfseSelectionDocument> & { readonly documentId: string },
): NfseSelectionDocument {
  return {
    accessKey: `3526${overrides.documentId.padStart(40, '0')}`,
    grossWeight: '120.0000',
    issuedAt: ISSUED_AT,
    number: '1',
    recipientAddress: RECIPIENT_ADDRESS,
    recipientCity: 'Ribeirão Preto',
    recipientLegalName: 'Comércio Destinatário LTDA',
    recipientState: 'SP',
    recipientTaxId: RECIPIENT_TAX_ID,
    senderAddress: SENDER_ADDRESS,
    senderCity: 'São Paulo',
    senderLegalName: 'Indústria Remetente LTDA',
    senderState: 'SP',
    senderTaxId: SENDER_TAX_ID,
    series: '1',
    status: 'authorized',
    totalAmount: '1000.0000',
    variant: 'complete',
    ...overrides,
  }
}

/** A projeção de CT-e exige o que a elegibilidade já garante; a fixture nunca chega aqui vazia. */
function toCteDocument(document: NfseSelectionDocument): CteBatchProjectionDocument {
  const { recipientTaxId, senderTaxId, totalAmount } = document
  if (recipientTaxId === null || senderTaxId === null || totalAmount === null) {
    throw new Error('Documento de fixture sem partes ou sem valor.')
  }

  return {
    accessKey: document.accessKey,
    documentId: document.documentId,
    issuedAt: document.issuedAt,
    number: document.number,
    recipientTaxId,
    senderTaxId,
    series: document.series,
    totalAmount,
  }
}

function selectAll(
  documents: readonly NfseSelectionDocument[],
  overrides: {
    readonly cteBatchLinks?: ReadonlyMap<string, string>
    readonly nfseLinks?: ReadonlyMap<string, string>
    readonly profile?: NfseSelectionProfile
  } = {},
): ReturnType<typeof selectNfseCandidates> {
  return selectNfseCandidates({
    cteBatchLinks: overrides.cteBatchLinks ?? new Map(),
    documentIds: documents.map((document) => document.documentId),
    documents,
    nfseLinks: overrides.nfseLinks ?? new Map(),
    profile: overrides.profile ?? PROFILE,
  })
}

describe('NFS-e selection contract', () => {
  test('groups the whole selection under the recipient when the profile takes it', () => {
    const documents = [
      buildDocument({ documentId: '1' }),
      buildDocument({ documentId: '2', totalAmount: '500.0000' }),
      buildDocument({
        documentId: '3',
        recipientLegalName: 'Outro Destinatário LTDA',
        recipientTaxId: OTHER_RECIPIENT_TAX_ID,
      }),
    ]
    const selection = selectAll(documents)
    expect(selection.blocked).toEqual([])

    const projections = projectNfseInvoices(selection.candidates)
    expect(projections.map((projection) => projection.takerTaxId)).toEqual([
      RECIPIENT_TAX_ID,
      OTHER_RECIPIENT_TAX_ID,
    ])
    expect(projections[0]?.documents.map((document) => document.documentId)).toEqual(['1', '2'])
    expect(projections[0]?.takerLegalName).toBe('Comércio Destinatário LTDA')
    expect(projections[1]?.documents.map((document) => document.documentId)).toEqual(['3'])
  })

  test('groups under the sender when the profile takes the sender instead', () => {
    const documents = [
      buildDocument({ documentId: '1' }),
      buildDocument({
        documentId: '2',
        recipientTaxId: OTHER_RECIPIENT_TAX_ID,
        totalAmount: '500.0000',
      }),
    ]
    const selection = selectAll(documents, { profile: { ...PROFILE, taker: '0' } })

    const projections = projectNfseInvoices(selection.candidates)
    expect(projections).toHaveLength(1)
    expect(projections[0]?.takerTaxId).toBe(SENDER_TAX_ID)
    expect(projections[0]?.takerLegalName).toBe('Indústria Remetente LTDA')
  })

  test('prices the service exactly like the CT-e projection of the same selection', () => {
    const documents = [
      buildDocument({ documentId: '1' }),
      buildDocument({ documentId: '2', totalAmount: '500.0000' }),
    ]
    const selection = selectAll(documents)
    const [nfse] = projectNfseInvoices(selection.candidates)

    const [cte] = projectCteBatchCharges(
      documents.map((document) => ({
        document: toCteDocument(document),
        groupingMode: 'sender_recipient',
        profile: {
          chargeComponentLabel: PROFILE.chargeComponentLabel,
          components: PROFILE.components,
          id: PROFILE.id,
          matchedBy: 'default',
          name: 'Perfil',
          resolvedBy: 'manual',
          ruleSnapshot: PROFILE.ruleSnapshot,
        },
      })),
    )

    // O serviço é o mesmo frete: mudar o documento fiscal não pode mudar o preço.
    expect(nfse?.serviceAmount).toBe(cte?.fiscalAmount ?? '')
    expect(nfse?.fiscalComponents).toEqual(cte?.fiscalComponents ?? [])
    expect(nfse?.baseAmount).toBe(cte?.baseAmount ?? '')
    expect(nfse?.serviceAmount).toBe('170.00')
    // ISS é fração do serviço, não do valor da carga.
    expect(nfse?.issAmount).toBe('3.40')
  })

  test('refuses a note already linked to an open CT-e batch', () => {
    const documents = [buildDocument({ documentId: '1' })]
    const selection = selectAll(documents, { cteBatchLinks: new Map([['1', 'batch-1']]) })

    expect(selection.candidates).toEqual([])
    expect(selection.blocked).toEqual([
      { documentId: '1', reason: NFSE_SELECTION_BLOCK_REASON.linkedToCteBatch },
    ])
  })

  test('refuses a note already linked to a live service invoice', () => {
    const documents = [buildDocument({ documentId: '1' })]
    const selection = selectAll(documents, { nfseLinks: new Map([['1', 'invoice-1']]) })

    expect(selection.blocked).toEqual([
      { documentId: '1', reason: NFSE_SELECTION_BLOCK_REASON.alreadyLinked },
    ])
  })

  test('refuses a taker without a legal name, which the city requires', () => {
    const documents = [buildDocument({ documentId: '1', recipientLegalName: null })]
    const selection = selectAll(documents)

    expect(selection.blocked).toEqual([
      { documentId: '1', reason: NFSE_SELECTION_BLOCK_REASON.missingTakerName },
    ])
  })

  /**
   * O endereço do tomador é o que a prefeitura recusou em produção. Bloquear na prévia é o que
   * separa "esta nota não pode entrar" de uma nota emitida, rejeitada e presa: reemitir retransmite
   * o mesmo RPS congelado, então a falta descoberta lá custa descarte e nova emissão.
   */
  test('refuses a taker without a complete address, which the city requires', () => {
    const documents = [
      buildDocument({
        documentId: '1',
        recipientAddress: { ...RECIPIENT_ADDRESS, postalCode: null },
      }),
    ]
    const selection = selectAll(documents)

    expect(selection.candidates).toEqual([])
    expect(selection.blocked).toEqual([
      { documentId: '1', reason: NFSE_SELECTION_BLOCK_REASON.missingTakerAddress },
    ])
  })

  /** O endereço que viaja é o do tomador que o perfil escolheu, não o da outra ponta da carga. */
  test('carries the address of the taker the profile picks', () => {
    const documents = [buildDocument({ documentId: '1' })]

    const recipientTaker = selectAll(documents)
    expect(recipientTaker.candidates[0]?.document.takerAddress).toEqual({
      city: 'Ribeirão Preto',
      complement: 'Sala 12',
      district: 'Centro',
      number: '1500',
      phone: '1633334444',
      postalCode: '14010100',
      state: 'SP',
      street: 'Avenida Nove de Julho',
    })

    const senderTaker = selectAll(documents, { profile: { ...PROFILE, taker: '0' } })
    expect(senderTaker.candidates[0]?.document.takerAddress).toEqual({
      city: 'São Paulo',
      complement: '',
      district: 'Brás',
      number: '210',
      phone: '',
      postalCode: '03042000',
      state: 'SP',
      street: 'Rua do Depósito',
    })
  })

  test('reports ineligibility in the same vocabulary the CT-e selection uses', () => {
    const documents = [buildDocument({ documentId: '1', status: 'draft' })]
    const selection = selectAll(documents)

    expect(selection.blocked).toEqual([
      { documentId: '1', reason: 'CTE_BATCH_DOCUMENT_NOT_AUTHORIZED' },
    ])
  })

  test('refuses a repeated or unknown document in the selection', () => {
    const documents = [buildDocument({ documentId: '1' })]
    const selection = selectNfseCandidates({
      cteBatchLinks: new Map(),
      documentIds: ['1', '1', '9'],
      documents,
      nfseLinks: new Map(),
      profile: PROFILE,
    })

    expect(selection.blocked).toEqual([
      { documentId: '1', reason: NFSE_SELECTION_BLOCK_REASON.duplicated },
      { documentId: '9', reason: NFSE_SELECTION_BLOCK_REASON.notFound },
    ])
  })
})
