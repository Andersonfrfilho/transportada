import { describe, expect, test } from 'bun:test'

import { DOCUMENT_ID, INVOICE_PREVIEW, PROFILE_ID, loadFutureModule } from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const EMISSION_MODULE = '../../src/modules/nfse-invoice/shared/nfseEmission.service'

const ACTION_PATH = 'src/modules/nfse-invoice/components/NfseEmissionAction.component.tsx'
const DIALOG_PATH = 'src/modules/nfse-invoice/components/NfseEmissionDialog.component.tsx'
const HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseEmissionDialog.hook.ts'
const SERVICE_PATH = 'src/modules/nfse-invoice/shared/nfseEmission.service.ts'
const STYLES_PATH = 'src/modules/nfse-invoice/styles/nfseInvoice.module.css'
const TABLE_PATH = 'src/modules/nfe-workspace/components/NfeDocumentTable.component.tsx'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

/** A API aceita `^[A-Za-z0-9._:-]{16,256}$` no cabeçalho — chave fora disso é 400 antes do domínio. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,256}$/

/** Sintético: o segundo tomador existe só para provar que a prévia sai agrupada por tomador. */
const SECOND_TAKER_TAX_ID = '11444777000161'
const SECOND_TAKER_LEGAL_NAME = 'Distribuidora Sintética do Norte S.A.'
const THIRD_DOCUMENT_ID = '8a35c1d2-47b6-4f09-9c81-6e2d0b7a5f14'
const FOURTH_DOCUMENT_ID = '5c78b0e4-19f2-4a63-8d07-2c4e9a6b3d58'

const PROFILE_TEMPLATE = 'Entregas na cidade de {{municipio}} de {{periodo}}.'
/** O período é digitado pelo operador; nada no front o deriva das notas selecionadas. */
const TYPED_PERIOD = '03-08 a 07-08-2026'
const OTHER_PERIOD = '27-07 a 31-07-2026'
const CUSTOM_TEMPLATE =
  'Prestação de serviço de transporte em {{municipio}} — {{quantidadeNotas}} notas.'

const FIRST_INVOICE = INVOICE_PREVIEW.invoices[0]

const READY_STATUS_INPUT = {
  hasPreview: true,
  isCreateError: false,
  isCreating: false,
  isPreviewEnabled: true,
  isPreviewError: false,
  isPreviewFetching: false,
  profileStatus: 'ready',
} as const

const SECOND_INVOICE = {
  ...FIRST_INVOICE,
  description: 'Entregas na cidade de Ribeirão Preto de 03-08-2026 a 07-08-2026.',
  documents: [
    {
      accessKey: '35260800011444777000161550010000000003100000000030',
      documentId: THIRD_DOCUMENT_ID,
      number: '3',
      series: '1',
      totalAmount: '4000.00',
    },
    {
      accessKey: '35260800011444777000161550010000000004100000000041',
      documentId: FOURTH_DOCUMENT_ID,
      number: '4',
      series: '1',
      totalAmount: '4000.00',
    },
  ],
  issAmount: '4.10',
  listedDocuments: 1,
  omittedDocuments: 1,
  serviceAmount: '400.00',
  takerLegalName: SECOND_TAKER_LEGAL_NAME,
  takerTaxId: SECOND_TAKER_TAX_ID,
} as const

const PREVIEW = {
  blocked: [
    ...INVOICE_PREVIEW.blocked,
    {
      documentId: FOURTH_DOCUMENT_ID,
      number: '4',
      reason: 'NFSE_DOCUMENT_MISSING_TAKER_NAME',
      series: '1',
    },
    {
      documentId: THIRD_DOCUMENT_ID,
      number: '3',
      reason: 'NFSE_DOCUMENT_LINKED_TO_CTE_BATCH',
      series: '1',
    },
  ],
  invoices: [SECOND_INVOICE, FIRST_INVOICE],
} as const

const EMPTY_PREVIEW = { blocked: PREVIEW.blocked, invoices: [] } as const

type EmissionSummary = {
  readonly blockedCount: number
  readonly invoiceCount: number
  readonly rows: readonly {
    readonly description: string
    readonly documentCount: number
    readonly documentIds: readonly string[]
    readonly documentNumbers: readonly string[]
    readonly id: string
    readonly issAmount: string
    readonly issRate: string
    readonly omittedDocuments: number
    readonly serviceAmount: string
    readonly takerLegalName: string
    readonly takerTaxId: string
  }[]
  readonly totalIssAmount: string
  readonly totalServiceAmount: string
}

type EmissionStatus =
  | 'createError'
  | 'creating'
  | 'idle'
  | 'loading'
  | 'previewError'
  | 'profileError'
  | 'profileMissing'
  | 'profileUnavailable'
  | 'ready'

type EmissionProfileStatus = 'error' | 'forbidden' | 'loading' | 'missing' | 'ready'

type EmissionModule = {
  readonly NFSE_BLOCK_LABEL_LIMIT: number
  readonly NFSE_DESCRIPTION_VARIABLES: readonly string[]
  readonly NFSE_EMISSION_MAX_VISIBLE_ROWS: number
  readonly NFSE_EMISSION_PREVIEW_QUERY_KEY: string
  readonly buildNfseCreateRequests: (
    input: Readonly<{
      description: string
      period: string
      profileTemplate: string
      summary: EmissionSummary
    }>,
  ) => readonly Record<string, unknown>[]
  readonly buildNfseIdempotencyKeys: (
    input: Readonly<{ count: number; token: string }>,
  ) => readonly string[]
  readonly buildNfsePreviewQueryKey: (
    input: Readonly<{
      companyId?: string
      description: string
      documentIds: readonly string[]
      period: string
      profileId: null | string
      profileTemplate: string
    }>,
  ) => readonly unknown[]
  readonly buildNfsePreviewRequest: (
    input: Readonly<{
      description: string
      documentIds: readonly string[]
      period: string
      profileId: string
      profileTemplate: string
    }>,
  ) => Record<string, unknown>
  readonly buildNfseProfileSelectOptions: (
    profiles: readonly Readonly<{ id: string; name: string }>[],
  ) => readonly Readonly<{ label: string; value: string }>[]
  readonly canConfirmNfseEmission: (
    input: Readonly<{
      canIssue: boolean
      profileId: null | string
      status: EmissionStatus
      summary: EmissionSummary | null
    }>,
  ) => boolean
  readonly canOpenNfseEmission: (permissions: readonly string[]) => boolean
  readonly groupNfseBlocksByReason: (
    blocked: readonly Readonly<{
      documentId: string
      number: null | string
      reason: string
      series: null | string
    }>[],
  ) => readonly Readonly<{ labels: readonly string[]; reason: string; remainingCount: number }>[]
  readonly isNfseEmissionFormLocked: (status: EmissionStatus) => boolean
  readonly resolveNfseDescription: (
    input: Readonly<{ custom: null | string; profileTemplate: string }>,
  ) => string
  readonly resolveNfseEmissionProfileStatus: (
    input: Readonly<{
      canListProfiles: boolean
      isError: boolean
      isLoading: boolean
      profileCount: number
    }>,
  ) => EmissionProfileStatus
  readonly resolveNfseEmissionStatus: (
    input: Readonly<{
      hasPreview: boolean
      isCreateError: boolean
      isCreating: boolean
      isPreviewEnabled: boolean
      isPreviewError: boolean
      isPreviewFetching: boolean
      profileStatus: EmissionProfileStatus
    }>,
  ) => EmissionStatus
  readonly selectNfseEmissionMessageKey: (
    input: Readonly<{ errorCode: null | string; status: EmissionStatus }>,
  ) => null | string
  readonly summarizeNfsePreview: (preview: unknown) => EmissionSummary
}

function loadEmissionModule(): Promise<EmissionModule> {
  return loadFutureModule<EmissionModule>(EMISSION_MODULE)
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function summarize(): Promise<EmissionSummary> {
  const { summarizeNfsePreview } = await loadEmissionModule()
  return summarizeNfsePreview(PREVIEW)
}

/** Sem bloqueio, para isolar dimensões (permissão, status) que não são sobre a nota fora da lista. */
async function summarizeUnblocked(): Promise<EmissionSummary> {
  const { summarizeNfsePreview } = await loadEmissionModule()
  return summarizeNfsePreview({ ...PREVIEW, blocked: [] })
}

function collectKeys(value: unknown, prefix: string): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, nested]) =>
    collectKeys(nested, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('nfse emission action permission contract', () => {
  test('opens the bulk action only for who manages service invoices', async () => {
    const { canOpenNfseEmission } = await loadEmissionModule()

    expect(canOpenNfseEmission(['nfse.manage'])).toBe(true)
    expect(canOpenNfseEmission(['nfse.manage', 'nfse.issue'])).toBe(true)
    expect(canOpenNfseEmission([])).toBe(false)
    expect(canOpenNfseEmission(['cte.manage', 'nfe.read'])).toBe(false)
    // Emitir é outra permissão: quem só lê a nota vê a prévia, não o botão.
    expect(canOpenNfseEmission(['nfse.read'])).toBe(false)
  })

  test('hides the button instead of rendering a dead control', async () => {
    const action = await readApplicationFile(ACTION_PATH)

    expect(action).toContain('canOpenNfseEmission')
    expect(action).toContain('if (!dialog.canOpen) return null')
  })

  test('adds the action to the selection bar of the notes table without a locale of its own', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).toContain('NfseEmissionAction')
    expect(table).toContain('<NfseEmissionAction')
    // A ação carrega a própria tradução e recebe só o estilo do botão da barra de seleção.
    expect(table).not.toContain('emitNfse')
  })

  /** Confirmar é `nfse.issue`; o papel que só administra a nota vê a prévia e para aí. */
  test('refuses confirmation to whoever cannot issue, even with the dialog open', async () => {
    const { canConfirmNfseEmission } = await loadEmissionModule()
    const summary = await summarizeUnblocked()

    expect(
      canConfirmNfseEmission({ canIssue: true, profileId: PROFILE_ID, status: 'ready', summary }),
    ).toBe(true)
    expect(
      canConfirmNfseEmission({ canIssue: false, profileId: PROFILE_ID, status: 'ready', summary }),
    ).toBe(false)
  })
})

describe('nfse emission preview grouping contract', () => {
  test('shows one row per taker, sorted by legal name, with the notes of that taker', async () => {
    const summary = await summarize()

    expect(summary.invoiceCount).toBe(2)
    expect(summary.rows).toHaveLength(2)
    expect(summary.rows.map((row) => row.takerTaxId)).toEqual([
      INVOICE_PREVIEW.invoices[0].takerTaxId,
      SECOND_TAKER_TAX_ID,
    ])
    expect(summary.rows[0]).toEqual({
      description: FIRST_INVOICE.description,
      documentCount: 1,
      documentIds: [DOCUMENT_ID],
      documentNumbers: ['1'],
      id: FIRST_INVOICE.takerTaxId,
      issAmount: '13.44',
      issRate: '0.020000',
      omittedDocuments: 0,
      serviceAmount: '672.22',
      takerLegalName: FIRST_INVOICE.takerLegalName,
      takerTaxId: FIRST_INVOICE.takerTaxId,
    })
  })

  test('carries every note of the taker, not only the ones the description listed', async () => {
    const summary = await summarize()
    const [, second] = summary.rows

    expect(second?.documentCount).toBe(2)
    expect(second?.documentIds).toEqual([THIRD_DOCUMENT_ID, FOURTH_DOCUMENT_ID])
    expect(second?.omittedDocuments).toBe(1)
  })

  test('totals the selection as decimal string, never as binary float', async () => {
    const summary = await summarize()

    expect(summary.totalServiceAmount).toBe('1072.22')
    expect(summary.totalIssAmount).toBe('17.54')
    expect(summary.totalServiceAmount).toBeString()
    expect(summary.totalIssAmount).toBeString()
  })

  test('keeps the money out of the reach of Number and parseFloat', async () => {
    const service = await readApplicationFile(SERVICE_PATH)

    expect(service).toContain('sumScaledAmounts')
    expect(service).not.toContain('parseFloat')
    expect(service).not.toMatch(/Number\(/)
  })

  test('groups the blocked notes by reason, naming each one, preserving first-seen order', async () => {
    const { groupNfseBlocksByReason } = await loadEmissionModule()

    expect(groupNfseBlocksByReason(PREVIEW.blocked)).toEqual([
      {
        labels: ['2/1', '3/1'],
        reason: 'NFSE_DOCUMENT_LINKED_TO_CTE_BATCH',
        remainingCount: 0,
      },
      { labels: ['4/1'], reason: 'NFSE_DOCUMENT_MISSING_TAKER_NAME', remainingCount: 0 },
    ])
    expect(groupNfseBlocksByReason([])).toEqual([])
  })

  /** Bloqueio `notFound` não tem número emitido: o id é o único jeito de apontar a nota. */
  test('falls back to the document id when the block has no document number', async () => {
    const { groupNfseBlocksByReason } = await loadEmissionModule()

    expect(
      groupNfseBlocksByReason([
        {
          documentId: THIRD_DOCUMENT_ID,
          number: null,
          reason: 'NFSE_DOCUMENT_NOT_FOUND',
          series: null,
        },
      ]),
    ).toEqual([
      { labels: [THIRD_DOCUMENT_ID], reason: 'NFSE_DOCUMENT_NOT_FOUND', remainingCount: 0 },
    ])
  })

  test('caps the named notes per reason and counts what stayed out of the list', async () => {
    const { NFSE_BLOCK_LABEL_LIMIT, groupNfseBlocksByReason } = await loadEmissionModule()
    const overflowCount = 3
    const blocks = Array.from({ length: NFSE_BLOCK_LABEL_LIMIT + overflowCount }, (_, index) => ({
      documentId: `${THIRD_DOCUMENT_ID}-${index}`,
      number: String(index + 1),
      reason: 'NFSE_DOCUMENT_LINKED_TO_CTE_BATCH',
      series: '1',
    }))

    const [group] = groupNfseBlocksByReason(blocks)

    expect(group?.labels).toHaveLength(NFSE_BLOCK_LABEL_LIMIT)
    expect(group?.remainingCount).toBe(overflowCount)
  })

  test('renders the blocked reason with the taker rows, not instead of them', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('dialog.blockGroups')
    expect(dialog).toContain('emission.blockReason.')
    expect(dialog).toContain('defaultValue: group.reason')
    expect(dialog).toContain('dialog.visibleRows')
  })

  test('counts the blocked notes so the operator sees what stayed out', async () => {
    const summary = await summarize()

    expect(summary.blockedCount).toBe(3)
  })
})

describe('nfse emission description contract', () => {
  test('seeds the field with the template of the profile and yields to what the operator typed', async () => {
    const { resolveNfseDescription } = await loadEmissionModule()

    expect(resolveNfseDescription({ custom: null, profileTemplate: PROFILE_TEMPLATE })).toBe(
      PROFILE_TEMPLATE,
    )
    expect(
      resolveNfseDescription({ custom: CUSTOM_TEMPLATE, profileTemplate: PROFILE_TEMPLATE }),
    ).toBe(CUSTOM_TEMPLATE)
    // Apagar o campo é escolha do operador: o modelo do perfil não volta por cima.
    expect(resolveNfseDescription({ custom: '', profileTemplate: PROFILE_TEMPLATE })).toBe('')
  })

  test('omits the description when it still is the one the profile already applies', async () => {
    const { buildNfsePreviewRequest } = await loadEmissionModule()
    const request = buildNfsePreviewRequest({
      description: PROFILE_TEMPLATE,
      documentIds: [DOCUMENT_ID],
      period: '',
      profileId: PROFILE_ID,
      profileTemplate: PROFILE_TEMPLATE,
    })

    expect(request).toEqual({ documentIds: [DOCUMENT_ID], profileId: PROFILE_ID })
    expect(Object.keys(request)).not.toContain('descriptionTemplate')
  })

  test('carries the edited description into the preview and into every creation', async () => {
    const { buildNfseCreateRequests, buildNfsePreviewRequest } = await loadEmissionModule()
    const summary = await summarize()

    expect(
      buildNfsePreviewRequest({
        description: CUSTOM_TEMPLATE,
        documentIds: [DOCUMENT_ID],
        period: '',
        profileId: PROFILE_ID,
        profileTemplate: PROFILE_TEMPLATE,
      }).descriptionTemplate,
    ).toBe(CUSTOM_TEMPLATE)

    const requests = buildNfseCreateRequests({
      description: CUSTOM_TEMPLATE,
      period: '',
      profileTemplate: PROFILE_TEMPLATE,
      summary,
    })
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.descriptionTemplate).toBe(CUSTOM_TEMPLATE)
    }
  })

  test('publishes the variables the description engine understands', async () => {
    const { NFSE_DESCRIPTION_VARIABLES } = await loadEmissionModule()

    expect([...NFSE_DESCRIPTION_VARIABLES].sort()).toEqual([
      'municipio',
      'notas',
      'observacoes',
      'periodo',
      'quantidadeNotas',
    ])
  })

  test('offers the description as a textarea the operator can edit until the creation starts', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('<textarea')
    expect(dialog).toContain('dialog.setDescription')
    expect(dialog).toContain('disabled={dialog.isFormLocked}')
  })
})

/**
 * O período é digitado na emissão, não derivado das notas: a data de emissão da NF-e não é a data da
 * prestação, e é a da prestação que a prefeitura lê. Enquanto a regra não existir, o campo vai vazio
 * e quem emite escreve a janela — ver `nfse-description.service.ts` na API.
 */
describe('nfse emission period contract', () => {
  test('carries the typed period into the preview and into every creation', async () => {
    const { buildNfseCreateRequests, buildNfsePreviewRequest } = await loadEmissionModule()
    const summary = await summarize()

    expect(
      buildNfsePreviewRequest({
        description: PROFILE_TEMPLATE,
        documentIds: [DOCUMENT_ID],
        period: TYPED_PERIOD,
        profileId: PROFILE_ID,
        profileTemplate: PROFILE_TEMPLATE,
      }).period,
    ).toBe(TYPED_PERIOD)

    const requests = buildNfseCreateRequests({
      description: PROFILE_TEMPLATE,
      period: TYPED_PERIOD,
      profileTemplate: PROFILE_TEMPLATE,
      summary,
    })
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.period).toBe(TYPED_PERIOD)
    }
  })

  /** Campo em branco não vira `period: ''` no corpo: a API trata ausência e vazio da mesma forma. */
  test('omits the period from the body when the operator typed nothing', async () => {
    const { buildNfseCreateRequests, buildNfsePreviewRequest } = await loadEmissionModule()
    const summary = await summarize()
    const preview = buildNfsePreviewRequest({
      description: PROFILE_TEMPLATE,
      documentIds: [DOCUMENT_ID],
      period: '   ',
      profileId: PROFILE_ID,
      profileTemplate: PROFILE_TEMPLATE,
    })

    expect(Object.keys(preview)).not.toContain('period')
    for (const request of buildNfseCreateRequests({
      description: PROFILE_TEMPLATE,
      period: '',
      profileTemplate: PROFILE_TEMPLATE,
      summary,
    })) {
      expect(Object.keys(request)).not.toContain('period')
    }
  })

  test('opens the field empty and lets the operator type it, without deriving a window', async () => {
    const [dialog, hook, service] = await Promise.all([
      readApplicationFile(DIALOG_PATH),
      readApplicationFile(HOOK_PATH),
      readApplicationFile(SERVICE_PATH),
    ])

    expect(dialog).toContain('dialog.setPeriod')
    expect(dialog).toContain('dialog.period')
    expect(dialog).toContain('emission.period')
    expect(hook).toContain('setPeriod')
    expect(hook).toContain('period,')
    // Nada de janela calculada: nem data de hoje, nem semana anterior, nem `Date` no meio do caminho.
    for (const source of [hook, service]) {
      expect(source).not.toContain('new Date(')
      expect(source).not.toContain('setDate(')
    }
  })

  test('publishes the period label and its hint in both languages', async () => {
    const [portuguese, english] = await Promise.all([
      readApplicationFile(PT_LOCALE_PATH).then((raw) => JSON.parse(raw) as Record<string, unknown>),
      readApplicationFile(EN_LOCALE_PATH).then((raw) => JSON.parse(raw) as Record<string, unknown>),
    ])

    for (const locale of [portuguese, english]) {
      expect(collectKeys(locale.emission, '')).toContain('period')
      expect(collectKeys(locale.emission, '')).toContain('periodHint')
    }
  })
})

/**
 * A criação aceita um tomador só (`NFSE_INVOICE_CREATE_SPANS_MULTIPLE_TAKERS`): a prévia agrupa,
 * e confirmar dispara uma criação por grupo — cada nota é um documento fiscal independente.
 */
describe('nfse emission creation contract', () => {
  test('splits the confirmation into one creation per taker, with the notes of that taker', async () => {
    const { buildNfseCreateRequests } = await loadEmissionModule()
    const summary = await summarize()
    const requests = buildNfseCreateRequests({
      description: PROFILE_TEMPLATE,
      period: '',
      profileTemplate: PROFILE_TEMPLATE,
      summary,
    })

    expect(requests).toEqual([
      { documentIds: [DOCUMENT_ID], profileId: PROFILE_ID },
      { documentIds: [THIRD_DOCUMENT_ID, FOURTH_DOCUMENT_ID], profileId: PROFILE_ID },
    ])
  })

  test('never sends the company in the payload — it comes from the token', async () => {
    const { buildNfseCreateRequests, buildNfsePreviewRequest } = await loadEmissionModule()
    const summary = await summarize()
    const requests = [
      buildNfsePreviewRequest({
        description: CUSTOM_TEMPLATE,
        documentIds: [DOCUMENT_ID],
        period: TYPED_PERIOD,
        profileId: PROFILE_ID,
        profileTemplate: PROFILE_TEMPLATE,
      }),
      ...buildNfseCreateRequests({
        description: CUSTOM_TEMPLATE,
        period: TYPED_PERIOD,
        profileTemplate: PROFILE_TEMPLATE,
        summary,
      }),
    ]

    for (const request of requests) {
      expect(Object.keys(request)).not.toContain('companyId')
      expect(Object.keys(request)).not.toContain('idempotencyKey')
    }
  })

  test('gives each creation its own idempotency key, in the shape the api accepts', async () => {
    const { buildNfseIdempotencyKeys } = await loadEmissionModule()
    const keys = buildNfseIdempotencyKeys({
      count: 2,
      token: '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93',
    })

    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
    for (const key of keys) {
      expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
    }
    // Mesma tentativa, mesma chave: repetir o clique não emite a nota duas vezes.
    expect(
      buildNfseIdempotencyKeys({ count: 2, token: '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93' }),
    ).toEqual(keys)
    expect(
      buildNfseIdempotencyKeys({ count: 2, token: '5d80b2c4-61b3-4a07-8e95-1c7b3d4a6e82' }),
    ).not.toEqual(keys)
  })

  test('sends the key as header and creates the invoices one at a time', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('buildNfseIdempotencyKeys')
    expect(hook).toContain('idempotencyKey')
    expect(hook).toContain('createInvoices')
    // Criações concorrentes do mesmo lote disputariam a linha de cada nota selecionada.
    expect(hook).not.toContain('Promise.all')
  })

  test('drops the note list once the invoices exist, so the table stops offering them', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    // A listagem de notas e as prévias saem juntas pelo efeito do vínculo, não por chave solta aqui.
    expect(hook).toContain('MUTATION_EFFECT.nfeDocumentLink')
    expect(hook).toContain('invalidateMutationEffect')
    expect(hook).not.toContain("'nfe-documents'")
  })
})

describe('nfse emission preview freshness contract', () => {
  test('keys the preview by the selection and by the description that produced it', async () => {
    const { NFSE_EMISSION_PREVIEW_QUERY_KEY, buildNfsePreviewQueryKey } = await loadEmissionModule()
    const selection = {
      companyId: '3f6c9d21-84b7-4e50-9a12-7d5b0e83c467',
      description: PROFILE_TEMPLATE,
      documentIds: [DOCUMENT_ID, THIRD_DOCUMENT_ID],
      period: TYPED_PERIOD,
      profileId: PROFILE_ID,
      profileTemplate: PROFILE_TEMPLATE,
    }

    expect(buildNfsePreviewQueryKey(selection)[0]).toBe(NFSE_EMISSION_PREVIEW_QUERY_KEY)
    for (const changed of [
      { ...selection, companyId: '8b0e5a73-19c4-4d62-8f37-6a2c1b9d4e05' },
      { ...selection, documentIds: [DOCUMENT_ID] },
      { ...selection, profileId: '0c4d7e19-53a8-4b26-9f81-2e6a5c3b7d40' },
      { ...selection, description: CUSTOM_TEMPLATE },
      // O período entra na descrição que a prefeitura lê: mudá-lo é outra prévia, não a mesma.
      { ...selection, period: OTHER_PERIOD },
    ]) {
      expect(buildNfsePreviewQueryKey(changed)).not.toEqual(buildNfsePreviewQueryKey(selection))
    }
  })

  test('reuses one cache entry when the selection produces the same request', async () => {
    const { buildNfsePreviewQueryKey } = await loadEmissionModule()
    const selection = {
      description: PROFILE_TEMPLATE,
      documentIds: [DOCUMENT_ID, THIRD_DOCUMENT_ID],
      period: TYPED_PERIOD,
      profileId: PROFILE_ID,
      profileTemplate: PROFILE_TEMPLATE,
    }

    expect(
      buildNfsePreviewQueryKey({
        ...selection,
        documentIds: [DOCUMENT_ID, THIRD_DOCUMENT_ID, DOCUMENT_ID],
      }),
    ).toEqual(buildNfsePreviewQueryKey(selection))
  })
})

describe('nfse emission status contract', () => {
  test('keeps the preview failure apart from the creation failure', async () => {
    const { resolveNfseEmissionStatus } = await loadEmissionModule()

    expect(resolveNfseEmissionStatus(READY_STATUS_INPUT)).toBe('ready')
    expect(resolveNfseEmissionStatus({ ...READY_STATUS_INPUT, isPreviewError: true })).toBe(
      'previewError',
    )
    expect(resolveNfseEmissionStatus({ ...READY_STATUS_INPUT, isCreateError: true })).toBe(
      'createError',
    )
    expect(
      resolveNfseEmissionStatus({ ...READY_STATUS_INPUT, isCreateError: true, isCreating: true }),
    ).toBe('creating')
    expect(resolveNfseEmissionStatus({ ...READY_STATUS_INPUT, hasPreview: false })).toBe('loading')
    expect(resolveNfseEmissionStatus({ ...READY_STATUS_INPUT, isPreviewFetching: true })).toBe(
      'loading',
    )
  })

  /**
   * Sem perfil não sai requisição de prévia: esperar por ela é esperar para sempre, e foi assim que
   * o diálogo ficou em esqueleto eterno em produção.
   */
  test('never waits on a preview that was never requested', async () => {
    const { resolveNfseEmissionStatus } = await loadEmissionModule()

    expect(
      resolveNfseEmissionStatus({
        ...READY_STATUS_INPUT,
        hasPreview: false,
        isPreviewEnabled: false,
      }),
    ).toBe('idle')
  })

  test('names what is missing when the profile list does not produce a profile', async () => {
    const { resolveNfseEmissionStatus } = await loadEmissionModule()
    const waiting = { ...READY_STATUS_INPUT, hasPreview: false, isPreviewEnabled: false }

    expect(resolveNfseEmissionStatus({ ...waiting, profileStatus: 'missing' })).toBe(
      'profileMissing',
    )
    expect(resolveNfseEmissionStatus({ ...waiting, profileStatus: 'error' })).toBe('profileError')
    expect(resolveNfseEmissionStatus({ ...waiting, profileStatus: 'forbidden' })).toBe(
      'profileUnavailable',
    )
    // Enquanto a lista está em voo o esqueleto é honesto: existe requisição para esperar.
    expect(resolveNfseEmissionStatus({ ...waiting, profileStatus: 'loading' })).toBe('loading')
  })

  test('separates a profile list that is empty, broken, out of reach or still loading', async () => {
    const { resolveNfseEmissionProfileStatus } = await loadEmissionModule()
    const base = { canListProfiles: true, isError: false, isLoading: false, profileCount: 1 }

    expect(resolveNfseEmissionProfileStatus(base)).toBe('ready')
    expect(resolveNfseEmissionProfileStatus({ ...base, profileCount: 0 })).toBe('missing')
    expect(resolveNfseEmissionProfileStatus({ ...base, isLoading: true })).toBe('loading')
    expect(resolveNfseEmissionProfileStatus({ ...base, isError: true })).toBe('error')
    expect(resolveNfseEmissionProfileStatus({ ...base, canListProfiles: false })).toBe('forbidden')
    // Permissão manda em tudo: sem ela a query nem roda, e "carregando" seria mentira.
    expect(
      resolveNfseEmissionProfileStatus({ ...base, canListProfiles: false, isLoading: true }),
    ).toBe('forbidden')
  })

  test('mirrors the preview query enablement instead of guessing it', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('const isPreviewEnabled =')
    expect(hook).toContain('enabled: isPreviewEnabled')
    expect(hook).toContain('isPreviewEnabled,')
    expect(hook).toContain('resolveNfseEmissionProfileStatus')
  })

  test('locks the form only while the invoices are being created', async () => {
    const { isNfseEmissionFormLocked } = await loadEmissionModule()

    expect(isNfseEmissionFormLocked('creating')).toBe(true)
    for (const status of [
      'createError',
      'idle',
      'loading',
      'previewError',
      'profileError',
      'profileMissing',
      'profileUnavailable',
      'ready',
    ] as const) {
      expect(isNfseEmissionFormLocked(status)).toBe(false)
    }
  })

  test('refuses confirmation without a profile, without a preview, with everything blocked or with any block outstanding', async () => {
    const { canConfirmNfseEmission, summarizeNfsePreview } = await loadEmissionModule()
    const summary = await summarizeUnblocked()
    const partiallyBlockedSummary = await summarize()
    const emptySummary = summarizeNfsePreview(EMPTY_PREVIEW)
    const base = { canIssue: true, profileId: PROFILE_ID }

    expect(canConfirmNfseEmission({ ...base, status: 'ready', summary })).toBe(true)
    expect(canConfirmNfseEmission({ ...base, status: 'idle', summary: null })).toBe(false)
    expect(canConfirmNfseEmission({ ...base, status: 'loading', summary })).toBe(false)
    expect(canConfirmNfseEmission({ ...base, status: 'creating', summary })).toBe(false)
    expect(canConfirmNfseEmission({ ...base, status: 'previewError', summary })).toBe(false)
    expect(canConfirmNfseEmission({ ...base, status: 'ready', summary: emptySummary })).toBe(false)
    // Bloqueio parcial: tomadores prontos e notas fora ao mesmo tempo — o botão continua fechado.
    expect(
      canConfirmNfseEmission({ ...base, status: 'ready', summary: partiallyBlockedSummary }),
    ).toBe(false)
    // Perfil é obrigatório na API: sem ele nem a prévia sai.
    expect(canConfirmNfseEmission({ ...base, profileId: null, status: 'ready', summary })).toBe(
      false,
    )
  })

  test('lets the operator retry after a creation failure instead of locking the button', async () => {
    const { canConfirmNfseEmission } = await loadEmissionModule()
    const summary = await summarizeUnblocked()

    expect(
      canConfirmNfseEmission({
        canIssue: true,
        profileId: PROFILE_ID,
        status: 'createError',
        summary,
      }),
    ).toBe(true)
  })

  test('names the message by what actually failed, reusing the api error vocabulary', async () => {
    const { selectNfseEmissionMessageKey } = await loadEmissionModule()

    expect(selectNfseEmissionMessageKey({ errorCode: null, status: 'ready' })).toBeNull()
    expect(selectNfseEmissionMessageKey({ errorCode: null, status: 'loading' })).toBeNull()
    expect(
      selectNfseEmissionMessageKey({
        errorCode: 'NFSE_INVOICE_REQUEST_FAILED',
        status: 'previewError',
      }),
    ).toBe('emission.errorPreview')
    expect(selectNfseEmissionMessageKey({ errorCode: null, status: 'createError' })).toBe(
      'emission.errorCreate',
    )
    expect(
      selectNfseEmissionMessageKey({
        errorCode: 'NFSE_DOCUMENT_ALREADY_LINKED',
        status: 'createError',
      }),
    ).toBe('feedback.documentAlreadyLinked')
  })

  /** Esqueleto sem fim não diz nada; cada motivo de não haver prévia tem a sua frase. */
  test('explains the absent profile instead of waiting silently', async () => {
    const { selectNfseEmissionMessageKey } = await loadEmissionModule()

    expect(selectNfseEmissionMessageKey({ errorCode: null, status: 'profileMissing' })).toBe(
      'emission.profileMissing',
    )
    expect(selectNfseEmissionMessageKey({ errorCode: null, status: 'profileError' })).toBe(
      'emission.errorProfiles',
    )
    // Quem não pode listar já lê `emission.profileUnavailable` no próprio diálogo.
    expect(
      selectNfseEmissionMessageKey({ errorCode: null, status: 'profileUnavailable' }),
    ).toBeNull()
    expect(selectNfseEmissionMessageKey({ errorCode: null, status: 'idle' })).toBeNull()
  })
})

describe('nfse emission dialog rendering contract', () => {
  test('renders over the page in a portal, as a modal that closes by keyboard', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('createPortal(')
    expect(dialog).toContain('document.body')
    expect(dialog).toContain('useModalDialog')
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('role="dialog"')
  })

  test('waits with a skeleton and obeys the design system', async () => {
    const [action, dialog] = await Promise.all([
      readApplicationFile(ACTION_PATH),
      readApplicationFile(DIALOG_PATH),
    ])

    expect(dialog).toContain('SkeletonGroup')
    for (const source of [action, dialog]) {
      expect(source).not.toContain('Carregando')
      expect(source).not.toContain('<svg')
      expect(source).not.toContain('<select')
      expect(source).not.toContain('type="checkbox"')
    }
    expect(action).toContain('<Icon name=')
    expect(dialog).toContain('<Select')
  })

  test('formats money with the shared decimal formatter instead of a local one', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain("from '@/modules/shared/decimalAmount.service'")
    expect(dialog).toContain('formatAmount')
    expect(dialog).not.toContain('new Intl.NumberFormat')
  })

  test('caps the rows it renders and reports the remainder', async () => {
    const { NFSE_EMISSION_MAX_VISIBLE_ROWS } = await loadEmissionModule()
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(NFSE_EMISSION_MAX_VISIBLE_ROWS).toBeGreaterThan(0)
    expect(dialog).toContain('dialog.hiddenRowCount')
  })

  test('keeps the taker out of the published strings — it arrives as data, never as example', async () => {
    const [portuguese, english] = await Promise.all([
      readApplicationFile(PT_LOCALE_PATH),
      readApplicationFile(EN_LOCALE_PATH),
    ])

    for (const locale of [portuguese, english]) {
      expect(locale).not.toMatch(/[0-9]{11,14}/)
      expect(locale).not.toMatch(/[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}/)
    }
  })

  test('publishes every emission string in both languages', async () => {
    const [portuguese, english] = await Promise.all([
      readApplicationFile(PT_LOCALE_PATH).then((raw) => JSON.parse(raw) as Record<string, unknown>),
      readApplicationFile(EN_LOCALE_PATH).then((raw) => JSON.parse(raw) as Record<string, unknown>),
    ])
    const portugueseKeys = collectKeys(portuguese.emission, '')

    expect(portugueseKeys).toEqual(collectKeys(english.emission, ''))
    for (const key of [
      'action',
      'confirm',
      'description',
      'errorCreate',
      'errorPreview',
      'errorProfiles',
      'forbidden',
      'profile',
      'profileMissing',
      'profileUnavailable',
      'title',
    ]) {
      expect(portugueseKeys).toContain(key)
    }
  })
})

/**
 * O motivo pelo qual "Emitir" não emitiu tem de ser lido junto ao botão. Com a classe de texto
 * auxiliar e 192px acima do rodapé, a frase existia no DOM e ninguém a via — foi assim que a
 * credencial ausente virou "o modal não fez nada".
 */
describe('nfse emission alert contract', () => {
  test('gives the failure its own alert style, apart from the helper text', async () => {
    const [dialog, styles] = await Promise.all([
      readApplicationFile(DIALOG_PATH),
      readApplicationFile(STYLES_PATH),
    ])

    expect(dialog).toContain('styles.emissionAlert')
    expect(dialog).toContain('role="alert"')
    expect(dialog).not.toMatch(/styles\.placeholder} role="alert"/)
    expect(styles).toContain('.emissionAlert')
    expect(styles).toContain('var(--color-alert)')
  })

  test('puts the alert beside the button that failed, not above the whole preview', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)
    const alertAt = dialog.indexOf('styles.emissionAlert')
    const blocksAt = dialog.indexOf('dialog.blockGroups')
    const footerAt = dialog.indexOf('styles.emissionFooter')

    expect(alertAt).toBeGreaterThan(blocksAt)
    expect(alertAt).toBeLessThan(footerAt)
  })
})

/**
 * A alíquota chega como fração (`0.020000`): imprimir o número cru com `%` mostrava `0,020000%`
 * numa nota cuja alíquota é 2%.
 */
describe('nfse emission rate contract', () => {
  test('shows the rate as percent, converting the fraction the api sends', async () => {
    const [dialog, summary] = await Promise.all([readApplicationFile(DIALOG_PATH), summarize()])

    expect(summary.rows[0]?.issRate).toBe('0.020000')
    expect(dialog).toContain('toIssRatePercent(row.issRate)')
    expect(dialog).not.toContain('${row.issRate}%')
  })
})

describe('nfse emission profile contract', () => {
  test('lists the active emission profiles as options of the shared select', async () => {
    const { buildNfseProfileSelectOptions } = await loadEmissionModule()

    expect(
      buildNfseProfileSelectOptions([
        { id: PROFILE_ID, name: 'Serviço de transporte municipal' },
        { id: '0c4d7e19-53a8-4b26-9f81-2e6a5c3b7d40', name: 'Armazenagem' },
      ]),
    ).toEqual([
      { label: 'Serviço de transporte municipal', value: PROFILE_ID },
      { label: 'Armazenagem', value: '0c4d7e19-53a8-4b26-9f81-2e6a5c3b7d40' },
    ])
    expect(buildNfseProfileSelectOptions([])).toEqual([])
  })

  /**
   * O perfil é obrigatório na criação, e a lista de opções vem gateada por `nfse.issue`: sem ela o
   * diálogo não tem o que enviar, e dizer isso é melhor que uma prévia vazia.
   */
  test('says why the emission is blocked when the profile list is out of reach', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('canListProfiles')
    expect(dialog).toContain('emission.profileUnavailable')
    expect(dialog).toContain('emission.forbidden')
  })
})
