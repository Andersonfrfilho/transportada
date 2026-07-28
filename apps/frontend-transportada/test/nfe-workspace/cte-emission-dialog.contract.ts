/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  AUTOMATIC_PROFILE_ID,
  CTE_EMISSION_GROUPING_MODES,
  DEFAULT_GROUPING_MODE,
  buildCreateRequest,
  buildPreviewRequest,
  canConfirmEmission,
  defaultBatchName,
  groupBlocksByReason,
  summarizePreview,
  toPercentageLabel,
  type CteEmissionPreview,
} from '../../src/modules/nfe-workspace/shared/cteEmission.service'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000502'
const BLOCKED_ID = '00000000-0000-4000-8000-000000000504'
const OTHER_BLOCKED_ID = '00000000-0000-4000-8000-000000000506'
const PROFILE_ID = '00000000-0000-4000-8000-000000000505'
const BATCH_ID = '00000000-0000-4000-8000-000000000501'

const PREVIEW: CteEmissionPreview = {
  blocked: [
    { batchId: BATCH_ID, documentId: BLOCKED_ID, reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED' },
    { batchId: null, documentId: OTHER_BLOCKED_ID, reason: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT' },
    { batchId: BATCH_ID, documentId: DOCUMENT_ID, reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED' },
  ],
  projections: [
    {
      baseAmount: '958.4800',
      documents: [
        {
          accessKey: '35260761156864000191550010000000022000000022',
          documentId: DOCUMENT_ID,
          number: '000000022',
          series: '001',
          totalAmount: '958.4800',
        },
      ],
      fiscalAmount: '43.13',
      fiscalComponents: [{ amount: '43.13', calculationType: 'main', label: 'Frete' }],
      percentage: '0.045000',
      profile: {
        groupingMode: 'per_invoice',
        id: PROFILE_ID,
        matchedBy: 'sender_tax_id',
        name: 'Perfil Zaragoza',
        resolvedBy: 'auto',
      },
      recipientTaxId: '12345678000199',
      senderTaxId: '61156864000191',
    },
  ],
  summary: { blockedCount: 3, documentCount: 4, projectedCount: 1, totalAmount: '43.13' },
}

const EMPTY_PREVIEW: CteEmissionPreview = {
  blocked: PREVIEW.blocked,
  projections: [],
  summary: { blockedCount: 3, documentCount: 3, projectedCount: 0, totalAmount: '0.00' },
}

describe('CT-e emission dialog request contract', () => {
  test('sends the selected documents once, in selection order', () => {
    expect(
      buildPreviewRequest({
        documentIds: [DOCUMENT_ID, BLOCKED_ID, DOCUMENT_ID],
        emissionProfileId: AUTOMATIC_PROFILE_ID,
        groupingMode: DEFAULT_GROUPING_MODE,
      }),
    ).toEqual({ documentIds: [DOCUMENT_ID, BLOCKED_ID], groupingMode: 'per_invoice' })
  })

  test('omits the profile when resolution is automatic and carries it when chosen by hand', () => {
    expect(
      buildPreviewRequest({
        documentIds: [DOCUMENT_ID],
        emissionProfileId: PROFILE_ID,
        groupingMode: 'sender_recipient',
      }),
    ).toEqual({
      documentIds: [DOCUMENT_ID],
      emissionProfileId: PROFILE_ID,
      groupingMode: 'sender_recipient',
    })
    expect(
      Object.keys(
        buildPreviewRequest({
          documentIds: [DOCUMENT_ID],
          emissionProfileId: AUTOMATIC_PROFILE_ID,
          groupingMode: 'per_invoice',
        }),
      ),
    ).not.toContain('emissionProfileId')
  })

  test('creates the batch with the very parameters that produced the preview', () => {
    const selection = {
      documentIds: [DOCUMENT_ID, BLOCKED_ID],
      emissionProfileId: PROFILE_ID,
      groupingMode: 'sender_recipient' as const,
    }
    const preview = buildPreviewRequest(selection)
    const create = buildCreateRequest({ ...selection, name: 'Lote CT-e julho' })

    expect(create).toEqual({ ...preview, name: 'Lote CT-e julho' })
  })

  test('creates the batch only with the documents that survived the preview', () => {
    expect(
      buildCreateRequest({
        documentIds: summarizePreview(PREVIEW).projectedDocumentIds,
        emissionProfileId: AUTOMATIC_PROFILE_ID,
        groupingMode: 'per_invoice',
        name: 'Lote CT-e julho',
      }),
    ).toEqual({
      documentIds: [DOCUMENT_ID],
      groupingMode: 'per_invoice',
      name: 'Lote CT-e julho',
    })
  })

  test('exposes both grouping modes with per invoice as the default', () => {
    expect(CTE_EMISSION_GROUPING_MODES).toEqual(['per_invoice', 'sender_recipient'])
    expect(DEFAULT_GROUPING_MODE).toBe('per_invoice')
  })

  test('names the batch from the emission day and the CT-e count', () => {
    expect(defaultBatchName({ count: 3, issuedAt: '2026-07-27T18:32:00.000Z' })).toBe(
      'CT-e 2026-07-27 (3)',
    )
  })
})

describe('CT-e emission dialog projection contract', () => {
  test('summarizes each projected CT-e with its notes, base, rate and fiscal total', () => {
    const summary = summarizePreview(PREVIEW)

    expect(summary.blockedCount).toBe(3)
    expect(summary.projectedCount).toBe(1)
    expect(summary.totalAmount).toBe('43.13')
    expect(summary.rows).toHaveLength(1)
    expect(summary.rows[0]).toEqual({
      baseAmount: '958.4800',
      components: [{ amount: '43.13', label: 'Frete' }],
      documentCount: 1,
      documentNumbers: ['000000022'],
      fiscalAmount: '43.13',
      id: DOCUMENT_ID,
      percentageLabel: '4.50',
      profileName: 'Perfil Zaragoza',
      resolvedBy: 'auto',
    })
  })

  test('keys a grouped CT-e by every note it carries so the row survives reordering', () => {
    const grouped: CteEmissionPreview = {
      ...PREVIEW,
      projections: [
        {
          ...PREVIEW.projections[0]!,
          documents: [
            ...PREVIEW.projections[0]!.documents,
            {
              accessKey: '35260761156864000191550010000000023000000023',
              documentId: BLOCKED_ID,
              number: '000000023',
              series: '001',
              totalAmount: '100.0000',
            },
          ],
        },
      ],
    }
    const [row] = summarizePreview(grouped).rows

    expect(row?.id).toBe(`${DOCUMENT_ID}|${BLOCKED_ID}`)
    expect(row?.documentCount).toBe(2)
    expect(row?.documentNumbers).toEqual(['000000022', '000000023'])
  })

  test('converts the stored rate fraction into a percentage without binary float', () => {
    expect(toPercentageLabel('0.045000')).toBe('4.50')
    expect(toPercentageLabel('0.100000')).toBe('10.00')
    expect(toPercentageLabel('0.001250')).toBe('0.125')
    expect(toPercentageLabel('1.000000')).toBe('100.00')
  })

  test('groups blocked notes by reason, preserving first-seen order', () => {
    expect(groupBlocksByReason(PREVIEW.blocked)).toEqual([
      {
        documentIds: [BLOCKED_ID, DOCUMENT_ID],
        reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      },
      { documentIds: [OTHER_BLOCKED_ID], reason: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT' },
    ])
  })
})

describe('CT-e emission dialog confirmation contract', () => {
  test('refuses confirmation while the preview is loading or absent', () => {
    expect(canConfirmEmission({ preview: null, status: 'idle' })).toBe(false)
    expect(canConfirmEmission({ preview: PREVIEW, status: 'loading' })).toBe(false)
    expect(canConfirmEmission({ preview: PREVIEW, status: 'creating' })).toBe(false)
  })

  test('refuses confirmation when every selected note was blocked', () => {
    expect(canConfirmEmission({ preview: EMPTY_PREVIEW, status: 'ready' })).toBe(false)
  })

  test('allows confirmation of the projected notes even when part of the selection is blocked', () => {
    expect(canConfirmEmission({ preview: PREVIEW, status: 'ready' })).toBe(true)
  })
})
