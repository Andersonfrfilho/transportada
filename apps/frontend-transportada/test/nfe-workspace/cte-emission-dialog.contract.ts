/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  AUTOMATIC_PROFILE_ID,
  CTE_EMISSION_GROUPING_MODES,
  CTE_EMISSION_PREVIEW_QUERY_KEY,
  DEFAULT_GROUPING_MODE,
  buildCreateRequest,
  buildPreviewQueryKey,
  buildPreviewRequest,
  canConfirmEmission,
  defaultBatchName,
  groupBlocksByReason,
  isEmissionFormLocked,
  resolveBatchName,
  resolveEmissionStatus,
  selectEmissionMessageKey,
  shouldRefreshPreviewAfterFailure,
  summarizePreview,
  toPercentageLabel,
  type CteEmissionPreview,
} from '../../src/modules/nfe-workspace/shared/cteEmission.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function collectKeys(value: unknown, prefix: string): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, nested]) =>
    collectKeys(nested, prefix === '' ? key : `${prefix}.${key}`),
  )
}

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
  suggestedName: 'CT-e 2026-07-30 #2',
  summary: { blockedCount: 3, documentCount: 4, projectedCount: 1, totalAmount: '43.13' },
}

const EMPTY_PREVIEW: CteEmissionPreview = {
  blocked: PREVIEW.blocked,
  projections: [],
  suggestedName: PREVIEW.suggestedName,
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

  test('prefers what the operator typed, then the suggestion from the api, then the local fallback', () => {
    const fallbackName = 'CT-e 2026-07-30 (1)'
    const suggestedName = 'CT-e 2026-07-30 #2'

    expect(resolveBatchName({ customName: 'Lote do Spani', fallbackName, suggestedName })).toBe(
      'Lote do Spani',
    )
    // Apagar o campo é escolha do operador — a sugestão não pode voltar por cima.
    expect(resolveBatchName({ customName: '', fallbackName, suggestedName })).toBe('')
    expect(resolveBatchName({ customName: null, fallbackName, suggestedName })).toBe(suggestedName)
    expect(resolveBatchName({ customName: null, fallbackName, suggestedName: '' })).toBe(
      fallbackName,
    )
  })

  test('derives the batch name during render instead of syncing it with an effect', async () => {
    const hook = await readModule('src/modules/nfe-workspace/hooks/useCteEmissionDialog.hook.ts')

    expect(hook).toContain('resolveBatchName')
    expect(hook).not.toContain('useEffect')
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
      matchedBy: 'sender_tax_id',
      percentageLabel: '4.50',
      profileId: PROFILE_ID,
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

describe('CT-e emission dialog failure contract', () => {
  test('keeps the projection failure apart from the creation failure', () => {
    const base = {
      hasPreview: true,
      isCreateError: false,
      isCreating: false,
      isPreviewError: false,
      isPreviewFetching: false,
    }

    expect(resolveEmissionStatus(base)).toBe('ready')
    expect(resolveEmissionStatus({ ...base, isPreviewError: true })).toBe('previewError')
    expect(resolveEmissionStatus({ ...base, isCreateError: true })).toBe('createError')
    expect(resolveEmissionStatus({ ...base, isCreating: true, isCreateError: true })).toBe(
      'creating',
    )
    expect(resolveEmissionStatus({ ...base, hasPreview: false })).toBe('loading')
    expect(resolveEmissionStatus({ ...base, isPreviewFetching: true })).toBe('loading')
  })

  test('names the message by what actually failed, never blaming the projection for a creation error', () => {
    expect(selectEmissionMessageKey({ errorCode: null, status: 'ready' })).toBeNull()
    expect(selectEmissionMessageKey({ errorCode: null, status: 'loading' })).toBeNull()
    expect(
      selectEmissionMessageKey({ errorCode: 'CTE_BATCH_REQUEST_FAILED', status: 'previewError' }),
    ).toBe('cteEmission.errorPreview')
    expect(
      selectEmissionMessageKey({ errorCode: 'CTE_BATCH_NAME_TAKEN', status: 'createError' }),
    ).toBe('cteEmission.errorNameTaken')
    expect(
      selectEmissionMessageKey({ errorCode: 'CTE_BATCH_REQUEST_FAILED', status: 'createError' }),
    ).toBe('cteEmission.errorCreate')
    expect(selectEmissionMessageKey({ errorCode: null, status: 'createError' })).toBe(
      'cteEmission.errorCreate',
    )
  })

  test('says the note went into another CT-e instead of asking for a retry that never works', () => {
    expect(
      selectEmissionMessageKey({
        errorCode: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
        status: 'createError',
      }),
    ).toBe('cteEmission.errorAlreadyLinked')
    // Só a criação erra por vínculo; na projeção a nota já aparece na lista de bloqueadas.
    expect(
      selectEmissionMessageKey({
        errorCode: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
        status: 'previewError',
      }),
    ).toBe('cteEmission.errorPreview')
  })

  test('lets the operator retry after a creation failure instead of locking the confirm button', () => {
    expect(canConfirmEmission({ preview: PREVIEW, status: 'createError' })).toBe(true)
    expect(canConfirmEmission({ preview: EMPTY_PREVIEW, status: 'createError' })).toBe(false)
    expect(canConfirmEmission({ preview: PREVIEW, status: 'previewError' })).toBe(false)
  })

  test('renders the projection and the editable name independently of the failure message', async () => {
    const component = await readModule(
      'src/modules/nfe-workspace/components/CteEmissionDialog.component.tsx',
    )

    expect(component).toContain('selectEmissionMessageKey')
    expect(component).toContain('{dialog.summary !== null && (')
    expect(component).not.toContain("t('cteEmission.error')")
    expect(component).not.toContain("dialog.status === 'error'")
    // O nome continua editável depois da falha: só a criação em curso trava o formulário.
    expect(isEmissionFormLocked('createError')).toBe(false)
  })

  test('keeps every failure string in both locales, with matching keys and no orphan message', async () => {
    const [portuguese, english] = await Promise.all([
      readModule('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json').then(
        (raw) => JSON.parse(raw) as Record<string, unknown>,
      ),
      readModule('src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json').then(
        (raw) => JSON.parse(raw) as Record<string, unknown>,
      ),
    ])
    const portugueseKeys = collectKeys(portuguese.cteEmission, '')
    const englishKeys = collectKeys(english.cteEmission, '')

    expect(portugueseKeys).toEqual(englishKeys)
    for (const keys of [portugueseKeys, englishKeys]) {
      expect(keys).toContain('errorPreview')
      expect(keys).toContain('errorNameTaken')
      expect(keys).toContain('errorCreate')
      expect(keys).toContain('errorAlreadyLinked')
      expect(keys).not.toContain('error')
    }
  })
})

describe('CT-e emission dialog projection freshness contract', () => {
  const selection = {
    companyId: '00000000-0000-4000-8000-000000000500',
    documentIds: [DOCUMENT_ID, BLOCKED_ID],
    emissionProfileId: AUTOMATIC_PROFILE_ID,
    groupingMode: DEFAULT_GROUPING_MODE,
  }

  test('keys the projection by the selection that produced it', () => {
    expect(buildPreviewQueryKey(selection)).toEqual([
      CTE_EMISSION_PREVIEW_QUERY_KEY,
      selection.companyId,
      [DOCUMENT_ID, BLOCKED_ID],
      AUTOMATIC_PROFILE_ID,
      'per_invoice',
    ])
    for (const changed of [
      { ...selection, companyId: '00000000-0000-4000-8000-000000000509' },
      { ...selection, documentIds: [DOCUMENT_ID] },
      { ...selection, emissionProfileId: PROFILE_ID },
      { ...selection, groupingMode: 'sender_recipient' as const },
    ]) {
      expect(buildPreviewQueryKey(changed)).not.toEqual(buildPreviewQueryKey(selection))
    }
  })

  test('reuses one cache entry for a selection that produces the same request', () => {
    expect(
      buildPreviewQueryKey({ ...selection, documentIds: [DOCUMENT_ID, BLOCKED_ID, DOCUMENT_ID] }),
    ).toEqual(buildPreviewQueryKey(selection))
  })

  test('recalculates the projection when the api rejects a note already linked elsewhere', () => {
    expect(shouldRefreshPreviewAfterFailure('CTE_BATCH_DOCUMENT_ALREADY_LINKED')).toBe(true)
    // Nome repetido é escolha do operador: a projeção continua válida, refazê-la só cobraria a api.
    expect(shouldRefreshPreviewAfterFailure('CTE_BATCH_NAME_TAKEN')).toBe(false)
    expect(shouldRefreshPreviewAfterFailure('CTE_BATCH_REQUEST_FAILED')).toBe(false)
    expect(shouldRefreshPreviewAfterFailure(null)).toBe(false)
  })

  test('drops every cached projection when a batch is created', async () => {
    const hook = await readModule('src/modules/nfe-workspace/hooks/useCteEmissionDialog.hook.ts')

    expect(hook).toContain('buildPreviewQueryKey')
    expect(hook).toContain('shouldRefreshPreviewAfterFailure')
    // Invalidar só a chave atual deixaria as outras seleções projetando notas já vinculadas.
    expect(hook).toContain('invalidateQueries({ queryKey: [CTE_EMISSION_PREVIEW_QUERY_KEY] })')
    expect(hook).not.toContain("const CTE_EMISSION_PREVIEW_QUERY_KEY = 'cte-emission-preview'")
  })
})

describe('CT-e emission form lock contract', () => {
  test('locks the form only while the batch is being created', () => {
    expect(isEmissionFormLocked('creating')).toBe(true)
    for (const status of ['createError', 'idle', 'loading', 'previewError', 'ready'] as const) {
      expect(isEmissionFormLocked(status)).toBe(false)
    }
  })

  test('derives the lock once, instead of repeating the status check per field', async () => {
    const hook = await readModule('src/modules/nfe-workspace/hooks/useCteEmissionDialog.hook.ts')

    expect(hook).toContain('isEmissionFormLocked')
    expect(hook).toContain('isFormLocked')
  })

  /** Editar durante a criação muda a projeção que o servidor já está gravando. */
  test('freezes every editable control while the batch is being created', async () => {
    const component = await readModule(
      'src/modules/nfe-workspace/components/CteEmissionDialog.component.tsx',
    )

    // Nome, perfil, agrupamento e o atalho de perfis — e só eles: fechar é a saída do operador
    // se a criação demorar, travá-lo o prenderia no diálogo.
    const lockedControls = component.match(/disabled=\{dialog\.isFormLocked\}/g) ?? []
    expect(lockedControls).toHaveLength(4)
    expect(/<input(?:(?!\/>)[\s\S])*disabled=\{dialog\.isFormLocked\}/.test(component)).toBe(true)
  })
})
