/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — a prévia com fakes: teto sem truncar, o que derrubaria a emissão marcado como
 * bloqueado **na prévia** (endereço do tomador, credencial da Nota RP), as duas perguntas só quando
 * cabem, e o congelamento com o hash do que o usuário viu.
 */
import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_MAX_DOCUMENTS } from '../../src/cte-batches/domain/cte-batch-limits.constant.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { DocumentOutputDescription } from '../../src/nfe-documents/application/nfe-document.types.js'
import type { NfseInvoicePreview } from '../../src/nfse-invoices/application/nfse-invoice-preview.service.js'
import { ApiError } from '../../src/shared/api.error.js'
import type { DocumentSelectionCriterion } from '../../src/whatsapp-commands/application/document-selection.port.js'
import {
  createPreviewDocumentSelectionUseCase,
  type PreviewDocumentSelectionDependencies,
} from '../../src/whatsapp-commands/application/preview-document-selection.use-case.js'
import type { CreateWhatsAppCommandPreviewInput } from '../../src/whatsapp-commands/application/whatsapp-command.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001401'
const USER_ID = '00000000-0000-4000-8000-000000001402'
const REQUEST_ID = '00000000-0000-4000-8000-000000001403'
const CTE_PROFILE_ID = '00000000-0000-4000-8000-000000001404'
const NFSE_PROFILE_ID = '00000000-0000-4000-8000-000000001405'
const CTE_DOC = '00000000-0000-4000-8000-000000001411'
const NFSE_DOC = '00000000-0000-4000-8000-000000001412'
const NOW = new Date('2026-09-11T15:00:00.000Z')

const CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-000000001406',
  permissions: new Set(['cte.submit', 'nfse.issue']),
  roles: ['operator'],
  userId: USER_ID,
}

const CRITERION: DocumentSelectionCriterion = {
  emitterTaxId: '11111111000191',
  firstNumber: 1200,
  kind: 'number_range',
  lastNumber: 1201,
  series: '1',
}

const CTE_DESCRIPTION: DocumentOutputDescription = {
  classification: { output: 'cte' },
  freightAmount: '35.0000',
  number: '1200',
  profile: { id: CTE_PROFILE_ID, takerTaxId: '11111111000191', version: '2' },
}

const NFSE_DESCRIPTION: DocumentOutputDescription = {
  classification: { nfseProfileId: NFSE_PROFILE_ID, output: 'nfse' },
  freightAmount: '10.0000',
  number: '1201',
  profile: { id: CTE_PROFILE_ID, takerTaxId: '11111111000191', version: '2' },
}

const NFSE_PREVIEW: NfseInvoicePreview = {
  blocked: [],
  invoices: [
    {
      calculatedAmount: '12.0000',
      documents: [{ documentId: NFSE_DOC }],
      takerTaxId: '22222222000191',
    } as unknown as NfseInvoicePreview['invoices'][number],
  ],
}

type Harness = {
  readonly created: CreateWhatsAppCommandPreviewInput[]
  readonly deps: PreviewDocumentSelectionDependencies
  readonly described: string[][]
  readonly nfsePreviews: string[][]
}

function buildHarness(
  overrides: Partial<PreviewDocumentSelectionDependencies> & {
    readonly descriptions?: ReadonlyMap<string, DocumentOutputDescription>
    readonly documentIds?: readonly string[]
  } = {},
): Harness {
  const created: CreateWhatsAppCommandPreviewInput[] = []
  const described: string[][] = []
  const nfsePreviews: string[][] = []
  const descriptions =
    overrides.descriptions ??
    new Map([
      [CTE_DOC, CTE_DESCRIPTION],
      [NFSE_DOC, NFSE_DESCRIPTION],
    ])
  const documentIds = overrides.documentIds ?? [CTE_DOC, NFSE_DOC]
  const deps: PreviewDocumentSelectionDependencies = {
    classifier: {
      describeDocumentOutputs: async (input) => {
        expect(input.context.companyId).toBe(COMPANY_ID)
        described.push([...input.documentIds])
        return descriptions
      },
    },
    clock: () => NOW,
    commands: {
      createPreview: async (input) => {
        created.push(input)
        return { id: input.id } as never
      },
    },
    findNfseCredentialGap: async () => undefined,
    generateId: () => REQUEST_ID,
    previewNfseInvoices: async (input) => {
      expect(input.context.companyId).toBe(COMPANY_ID)
      nfsePreviews.push([...input.documentIds])
      return NFSE_PREVIEW
    },
    selection: {
      findNfseProfileVersions: async () => new Map([[NFSE_PROFILE_ID, '5']]),
      resolveSelection: async (input) => {
        expect(input.companyId).toBe(COMPANY_ID)
        expect(input.limit).toBe(CTE_BATCH_MAX_DOCUMENTS)
        return { documentIds, total: documentIds.length }
      },
    },
    ...overrides,
  }
  return { created, deps, described, nfsePreviews }
}

async function preview(
  harness: Harness,
  input: { readonly dueDays?: number | undefined; readonly period?: string | undefined } = {},
) {
  return createPreviewDocumentSelectionUseCase(harness.deps)({
    context: CONTEXT,
    criterion: CRITERION,
    dueDays: 'dueDays' in input ? input.dueDays : 15,
    period: 'period' in input ? input.period : '',
  })
}

describe('prévia da seleção (spec 144 T012)', () => {
  test('acima do teto recusa com o número achado, sem truncar e sem classificar', async () => {
    const harness = buildHarness({
      selection: {
        findNfseProfileVersions: async () => new Map(),
        resolveSelection: async () => ({ documentIds: [], total: CTE_BATCH_MAX_DOCUMENTS + 1 }),
      },
    })
    expect(await preview(harness)).toEqual({
      found: CTE_BATCH_MAX_DOCUMENTS + 1,
      kind: 'too_many',
      limit: CTE_BATCH_MAX_DOCUMENTS,
    })
    expect(harness.described).toHaveLength(0)
    expect(harness.created).toHaveLength(0)
  })

  test('nenhuma nota no critério é seleção vazia, não prévia', async () => {
    const harness = buildHarness({ documentIds: [] })
    expect(await preview(harness)).toEqual({ kind: 'empty' })
    expect(harness.created).toHaveLength(0)
  })

  test('com CT-e e sem vencimento, pergunta o vencimento antes de congelar', async () => {
    const harness = buildHarness()
    expect(await preview(harness, { dueDays: undefined })).toEqual({ kind: 'needs_due_date' })
    expect(harness.created).toHaveLength(0)
  })

  test('sem CT-e, o vencimento não é perguntado', async () => {
    const harness = buildHarness({
      descriptions: new Map([[NFSE_DOC, NFSE_DESCRIPTION]]),
      documentIds: [NFSE_DOC],
    })
    const outcome = await preview(harness, { dueDays: undefined })
    expect(outcome.kind).toBe('previewed')
    expect(harness.created[0]?.dueDate).toBeUndefined()
  })

  test('com NFS-e e sem período, pergunta o período; sem NFS-e, não pergunta', async () => {
    expect(await preview(buildHarness(), { period: undefined })).toEqual({ kind: 'needs_period' })

    const cteOnly = buildHarness({
      descriptions: new Map([[CTE_DOC, CTE_DESCRIPTION]]),
      documentIds: [CTE_DOC],
    })
    expect((await preview(cteOnly, { period: undefined })).kind).toBe('previewed')
    expect(cteOnly.created[0]?.period).toBeUndefined()
  })

  test('endereço do tomador faltando bloqueia a nota na prévia, com o motivo da própria NFS-e', async () => {
    const harness = buildHarness({
      previewNfseInvoices: async () => ({
        blocked: [
          {
            documentId: NFSE_DOC,
            number: '1201',
            reason: 'NFSE_DOCUMENT_MISSING_TAKER_ADDRESS',
            series: '1',
          },
        ],
        invoices: [],
      }),
    })
    const outcome = await preview(harness)
    expect(outcome.kind).toBe('previewed')
    const frozen = harness.created[0]?.classification.find((entry) => entry.documentId === NFSE_DOC)
    expect(frozen?.classification).toEqual({
      output: 'blocked',
      reason: 'NFSE_DOCUMENT_MISSING_TAKER_ADDRESS',
    })
    if (outcome.kind === 'previewed') {
      expect(outcome.volumetry.nfse).toBe(0)
      expect(outcome.volumetry.blockedCount).toBe(1)
    }
  })

  test('sem credencial da Nota RP, toda nota de NFS-e sai bloqueada e a NFS-e nem é projetada', async () => {
    const harness = buildHarness({ findNfseCredentialGap: async () => 'NFSE_CREDENTIAL_MISSING' })
    await preview(harness)
    expect(harness.nfsePreviews).toHaveLength(0)
    const frozen = harness.created[0]?.classification.find((entry) => entry.documentId === NFSE_DOC)
    expect(frozen?.classification).toEqual({ output: 'blocked', reason: 'NFSE_CREDENTIAL_MISSING' })
  })

  test('erro de domínio do perfil NFS-e vira bloqueio das notas daquele perfil, não erro da prévia', async () => {
    const harness = buildHarness({
      previewNfseInvoices: async () => {
        throw new ApiError({
          code: 'NFSE_FREIGHT_RULE_VERSION_MISSING',
          message: 'no version',
          status: 422,
        })
      },
    })
    await preview(harness)
    const frozen = harness.created[0]?.classification.find((entry) => entry.documentId === NFSE_DOC)
    expect(frozen?.classification).toEqual({
      output: 'blocked',
      reason: 'NFSE_FREIGHT_RULE_VERSION_MISSING',
    })
  })

  test('congela o pedido: id gerado, 15 minutos, vencimento em data, período em branco omitido', async () => {
    const harness = buildHarness()
    const outcome = await preview(harness)
    expect(outcome).toMatchObject({
      expiresAt: new Date('2026-09-11T15:15:00.000Z'),
      kind: 'previewed',
      requestId: REQUEST_ID,
    })
    const [created] = harness.created
    expect(created).toMatchObject({
      actorUserId: USER_ID,
      companyId: COMPANY_ID,
      dueDate: '2026-09-26',
      expiresAt: new Date('2026-09-11T15:15:00.000Z'),
      id: REQUEST_ID,
      kind: 'document_issuance',
      selection: [CTE_DOC, NFSE_DOC],
    })
    expect(created?.period).toBeUndefined()
    expect(created?.previewSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(created?.classification).toEqual([
      { classification: { output: 'cte' }, documentId: CTE_DOC },
      { classification: { nfseProfileId: NFSE_PROFILE_ID, output: 'nfse' }, documentId: NFSE_DOC },
    ])
  })

  test('o período digitado entra no pedido e no hash', async () => {
    const blank = buildHarness()
    await preview(blank)
    const typed = buildHarness()
    await preview(typed, { period: '  setembro/2026 ' })
    expect(typed.created[0]?.period).toBe('setembro/2026')
    expect(typed.created[0]?.previewSha256).not.toBe(blank.created[0]?.previewSha256)
  })

  test('o valor calculado entra no hash: mesmos ids, outro frete, outro hash', async () => {
    const original = buildHarness()
    await preview(original)
    const repriced = buildHarness({
      descriptions: new Map([
        [CTE_DOC, { ...CTE_DESCRIPTION, freightAmount: '36.0000' }],
        [NFSE_DOC, NFSE_DESCRIPTION],
      ]),
    })
    await preview(repriced)
    expect(repriced.created[0]?.previewSha256).not.toBe(original.created[0]?.previewSha256)
  })

  test('nota que a porta não devolveu (outra empresa) não entra na prévia', async () => {
    const harness = buildHarness({
      descriptions: new Map([[CTE_DOC, CTE_DESCRIPTION]]),
      documentIds: [CTE_DOC, NFSE_DOC],
    })
    await preview(harness)
    expect(harness.created[0]?.selection).toEqual([CTE_DOC])
  })

  test('tudo bloqueado não congela nada: não há o que confirmar', async () => {
    const harness = buildHarness({
      descriptions: new Map([
        [
          CTE_DOC,
          {
            ...CTE_DESCRIPTION,
            classification: { output: 'blocked', reason: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT' },
          },
        ],
      ]),
      documentIds: [CTE_DOC],
    })
    const outcome = await preview(harness)
    expect(outcome.kind).toBe('nothing_to_issue')
    expect(harness.created).toHaveLength(0)
  })

  test('sem membership o pedido não nasce, e a prévia diz isso', async () => {
    const harness = buildHarness({ commands: { createPreview: async () => undefined } })
    expect(await preview(harness)).toEqual({ kind: 'no_membership' })
  })
})
