/**
 * Contrato dos dois botões que tiram a nota rejeitada/falha do beco sem saída (spec 042, T015):
 * Reemitir reaproveita `invoice.lastPayload` (T013/T014) com correção opcional; Descartar libera os
 * vínculos. Segue o mesmo desenho de `row-actions.contract.ts` — decisão pura provada sem montar
 * React, e o que sobra conferido no texto dos componentes.
 */
import { describe, expect, test } from 'bun:test'

import { INVOICE_ID, loadFutureModule } from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const ACTIONS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceRowActions.service'

const ACTIONS_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceRowActions.component.tsx'
const CLIENT_PATH = 'src/modules/nfse-invoice/shared/nfseInvoiceClient.service.ts'
const DISCARD_DIALOG_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceDiscardDialog.component.tsx'
const REISSUE_DIALOG_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceReissueDialog.component.tsx'
const PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

/** A API aceita `^[A-Za-z0-9._:-]{16,256}$` no cabeçalho — chave fora disso é 400 antes do domínio. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,256}$/

const ONLY_READ = ['nfse.read'] as const
const READ_AND_CANCEL = ['nfse.read', 'nfse.cancel'] as const
const READ_AND_ISSUE = ['nfse.read', 'nfse.issue'] as const
const FULL_ACCESS = ['nfse.read', 'nfse.issue', 'nfse.cancel'] as const

const ALL_STATUSES = [
  'authorized',
  'cancellation_requested',
  'cancelled',
  'discarded',
  'failed',
  'issuing',
  'pending_authorization',
  'rejected',
  'requested',
] as const

/**
 * Mesma forma que `nfseLastIssuancePayloadResponseSchema` (API, T013/T014): os nove campos
 * corrigíveis mais os quatro somente-leitura que o diálogo mostra sem recalcular nada.
 */
const LAST_PAYLOAD = {
  cnaeCode: '4930202',
  description: 'Entregas na cidade de Ribeirão Preto de 27-07-2026 a 31-07-2026.',
  documentCount: 3,
  issAmount: '134.44',
  issExigibility: '1',
  issRate: '0.050000',
  issWithheld: false,
  municipalTaxationCode: '',
  municipalityIbgeCode: '3543402',
  nbsCode: '',
  serviceAmount: '2688.80',
  serviceListItem: '16.02',
  takerLegalName: 'Transportadora Ribeirão Ltda',
  takerTaxId: '12345678000199',
} as const

/** Forma alargada de `LAST_PAYLOAD` — sem os literais do `as const`, para aceitar edição livre. */
type LastIssuancePayload = Readonly<{
  cnaeCode: string
  description: string
  documentCount: number
  issAmount: string
  issExigibility: string
  issRate: string
  issWithheld: boolean
  municipalTaxationCode: string
  municipalityIbgeCode: string
  nbsCode: string
  serviceAmount: string
  serviceListItem: string
  takerLegalName: string
  takerTaxId: string
}>

type RowActionState = Readonly<{
  isCancelEnabled: boolean
  isCancelVisible: boolean
  isDetailEnabled: boolean
  isDiscardEnabled: boolean
  isDiscardVisible: boolean
  isDownloadEnabled: boolean
  isReissueEnabled: boolean
  isReissueVisible: boolean
}>

type ActionsModule = Readonly<{
  buildNfseDiscardIdempotencyKey: (input: Readonly<{ invoiceId: string; token: string }>) => string
  buildNfseReissueCorrectionBody: (
    input: Readonly<{
      edited: Partial<LastIssuancePayload>
      lastPayload: LastIssuancePayload
    }>,
  ) => Record<string, unknown>
  buildNfseReissueIdempotencyKey: (input: Readonly<{ invoiceId: string; token: string }>) => string
  DISCARDABLE_STATUSES: readonly string[]
  REISSUABLE_STATUSES: readonly string[]
  resolveNfseRowActions: (
    input: Readonly<{ permissions: readonly string[]; status: string }>,
  ) => RowActionState
}>

function loadActions(): Promise<ActionsModule> {
  return loadFutureModule<ActionsModule>(ACTIONS_MODULE)
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocaleKeys(filePath: string): Promise<readonly string[]> {
  const locale = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  return collectKeys(locale, '')
}

function collectKeys(value: unknown, prefix: string): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, nested]) =>
    collectKeys(nested, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('nfse reissue and discard availability contract', () => {
  /** Só `rejected` e `failed` têm rota de reemissão/descarte — oferecer fora daí seria pedir 409. */
  test('offers reissue and discard only on rejected or failed, to whoever holds each permission', async () => {
    const actions = await loadActions()

    expect([...actions.REISSUABLE_STATUSES].toSorted()).toEqual(['failed', 'rejected'])
    expect([...actions.DISCARDABLE_STATUSES].toSorted()).toEqual(['failed', 'rejected'])

    for (const status of ['failed', 'rejected']) {
      const state = actions.resolveNfseRowActions({ permissions: FULL_ACCESS, status })
      expect(state.isReissueEnabled).toBe(true)
      expect(state.isDiscardEnabled).toBe(true)
    }

    for (const status of ALL_STATUSES.filter(
      (candidate) => candidate !== 'failed' && candidate !== 'rejected',
    )) {
      const state = actions.resolveNfseRowActions({ permissions: FULL_ACCESS, status })
      expect(state.isReissueEnabled).toBe(false)
      expect(state.isDiscardEnabled).toBe(false)
    }
  })

  /** Reemitir volta a passar pela emissão — a permissão é `nfse.issue`, não a de cancelamento. */
  test('gates reissue on the issue permission, independent of cancel', async () => {
    const actions = await loadActions()

    expect(
      actions.resolveNfseRowActions({ permissions: READ_AND_ISSUE, status: 'rejected' })
        .isReissueVisible,
    ).toBe(true)
    expect(
      actions.resolveNfseRowActions({ permissions: READ_AND_CANCEL, status: 'rejected' })
        .isReissueVisible,
    ).toBe(false)
    expect(
      actions.resolveNfseRowActions({ permissions: ONLY_READ, status: 'rejected' })
        .isReissueVisible,
    ).toBe(false)
  })

  /** Descartar reusa a mesma permissão do cancelamento (backend `nfse-invoices.routes.ts`). */
  test('gates discard on the cancel permission, independent of issue', async () => {
    const actions = await loadActions()

    expect(
      actions.resolveNfseRowActions({ permissions: READ_AND_CANCEL, status: 'failed' })
        .isDiscardVisible,
    ).toBe(true)
    expect(
      actions.resolveNfseRowActions({ permissions: READ_AND_ISSUE, status: 'failed' })
        .isDiscardVisible,
    ).toBe(false)
    expect(
      actions.resolveNfseRowActions({ permissions: ONLY_READ, status: 'failed' }).isDiscardVisible,
    ).toBe(false)
  })
})

describe('nfse reissue and discard idempotency contract', () => {
  test('builds a reissue key the api header accepts, stable for the same attempt', async () => {
    const actions = await loadActions()
    const token = '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93'
    const key = actions.buildNfseReissueIdempotencyKey({ invoiceId: INVOICE_ID, token })

    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(actions.buildNfseReissueIdempotencyKey({ invoiceId: INVOICE_ID, token })).toBe(key)
  })

  test('builds a discard key distinct from the reissue one for the same attempt', async () => {
    const actions = await loadActions()
    const token = '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93'

    expect(actions.buildNfseDiscardIdempotencyKey({ invoiceId: INVOICE_ID, token })).not.toBe(
      actions.buildNfseReissueIdempotencyKey({ invoiceId: INVOICE_ID, token }),
    )
  })
})

describe('nfse reissue correction body contract', () => {
  /** Enviar sem mexer em nada não pode reenviar os nove campos como se fossem correção. */
  test('sending without edits yields no domain keys at all', async () => {
    const actions = await loadActions()

    const body = actions.buildNfseReissueCorrectionBody({ edited: {}, lastPayload: LAST_PAYLOAD })

    expect(Object.keys(body)).toHaveLength(0)
  })

  /** Só o campo tocado entra no corpo — os outros oito continuam ausentes, não repetidos. */
  test('only the touched field reaches the body', async () => {
    const actions = await loadActions()

    const body = actions.buildNfseReissueCorrectionBody({
      edited: { issExigibility: '2' },
      lastPayload: LAST_PAYLOAD,
    })

    expect(body).toEqual({ issExigibility: '2' })
  })

  /** Editar de volta para o valor congelado é o mesmo que não editar: some do corpo de novo. */
  test('editing back to the frozen value drops the field again', async () => {
    const actions = await loadActions()

    const body = actions.buildNfseReissueCorrectionBody({
      edited: { issExigibility: LAST_PAYLOAD.issExigibility },
      lastPayload: LAST_PAYLOAD,
    })

    expect(Object.keys(body)).toHaveLength(0)
  })

  /** Os quatro campos somente-leitura nunca podem vazar para o corpo — a API os recusaria com 400. */
  test('never emits the four read-only fields, even if present on the edited draft', async () => {
    const actions = await loadActions()

    const body = actions.buildNfseReissueCorrectionBody({
      edited: {
        documentCount: 99,
        issAmount: '0.00',
        serviceAmount: '0.00',
        takerLegalName: 'Outro nome',
      },
      lastPayload: LAST_PAYLOAD,
    })

    expect(body).not.toHaveProperty('documentCount')
    expect(body).not.toHaveProperty('issAmount')
    expect(body).not.toHaveProperty('serviceAmount')
    expect(body).not.toHaveProperty('takerLegalName')
  })
})

describe('nfse reissue and discard rendering contract', () => {
  test('the row gains reissue and discard buttons, gated by the pure service', async () => {
    const actions = await readApplicationFile(ACTIONS_PATH)

    expect(actions).toContain('state.isReissueVisible')
    expect(actions).toContain('state.isDiscardVisible')
    expect(actions).toContain('rowActions.reissue')
    expect(actions).toContain('rowActions.discard')
    expect(actions).not.toContain("=== 'rejected'")
    expect(actions).not.toContain("=== 'failed'")
    // Ícone cru é proibido fora de `components/ui`; a ação usa o componente do design system.
    expect(actions).not.toContain('<svg')
  })

  test('the two dialogs go to a portal over the body, like the cancel one', async () => {
    const [reissueDialog, discardDialog] = await Promise.all([
      readApplicationFile(REISSUE_DIALOG_PATH),
      readApplicationFile(DISCARD_DIALOG_PATH),
    ])

    for (const dialog of [reissueDialog, discardDialog]) {
      expect(dialog).toContain('createPortal')
      expect(dialog).toContain('useModalDialog')
      expect(dialog).toContain('aria-modal="true"')
      expect(dialog).toContain('role="dialog"')
      expect(dialog).toContain('document.body')
    }
  })

  /** Descartar é irreversível: a confirmação avisa antes do clique que não tem volta. */
  test('the discard dialog asks for confirmation and warns it cannot be undone', async () => {
    const discardDialog = await readApplicationFile(DISCARD_DIALOG_PATH)

    expect(discardDialog).toContain('discardDialog.warning')
    expect(discardDialog).toContain('discardDialog.confirm')
    expect(discardDialog).not.toContain('<svg')
  })

  /**
   * O diálogo de reemissão abre pré-preenchido com `invoice.lastPayload` — os nove campos
   * corrigíveis mais os quatro somente-leitura, sem recalcular nada no cliente.
   */
  test('the reissue dialog prefills the nine correctable fields from lastPayload', async () => {
    const reissueDialog = await readApplicationFile(REISSUE_DIALOG_PATH)

    for (const field of [
      'cnaeCode',
      'description',
      'issExigibility',
      'issRate',
      'issWithheld',
      'municipalTaxationCode',
      'municipalityIbgeCode',
      'nbsCode',
      'serviceListItem',
    ]) {
      expect(reissueDialog).toContain(`lastPayload.${field}`)
    }
  })

  test('the reissue dialog shows the four read-only fields, and never recomputes them', async () => {
    const reissueDialog = await readApplicationFile(REISSUE_DIALOG_PATH)

    for (const field of ['serviceAmount', 'issAmount', 'takerLegalName', 'documentCount']) {
      expect(reissueDialog).toContain(`lastPayload.${field}`)
    }
    // Recalcular o ISS é regra de domínio da API (`applyNfseIssuanceCorrection`), não da tela.
    expect(reissueDialog).not.toContain('issRate *')
    expect(reissueDialog).not.toContain('Number(')
  })

  /** Exigibilidade é escolha do catálogo; select nativo é proibido em toda a app. */
  test('the reissue dialog picks the iss exigibility from the design system select', async () => {
    const reissueDialog = await readApplicationFile(REISSUE_DIALOG_PATH)

    expect(reissueDialog).toContain("from '@/components/ui/select'")
    expect(reissueDialog).toContain('NFSE_ISS_EXIGIBILITIES')
    expect(reissueDialog).not.toContain('<select')
  })

  /** ISS retido é booleano de tela; `<input type="checkbox">` cru é proibido em toda a app. */
  test('the reissue dialog toggles iss withheld through the design system checkbox', async () => {
    const reissueDialog = await readApplicationFile(REISSUE_DIALOG_PATH)

    expect(reissueDialog).toContain("from '@/components/ui/checkbox'")
    expect(reissueDialog).not.toContain('type="checkbox"')
  })

  test('the page mounts both new dialogs beside the existing ones', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('<NfseInvoiceReissueDialog')
    expect(page).toContain('<NfseInvoiceDiscardDialog')
  })
})

describe('nfse reissue and discard client contract', () => {
  test('the client gains reissueInvoice and discardInvoice, both idempotent', async () => {
    const client = await readApplicationFile(CLIENT_PATH)

    expect(client).toContain('reissueInvoice')
    expect(client).toContain('discardInvoice')
    expect(client).toContain('idempotencyKey')
  })
})

describe('nfse reissue and discard locale contract', () => {
  test('the two locales declare the same keys for the new actions', async () => {
    const [portuguese, english] = await Promise.all([
      readLocaleKeys(PT_LOCALE_PATH),
      readLocaleKeys(EN_LOCALE_PATH),
    ])
    const required = [
      'rowActions.reissue',
      'rowActions.discard',
      'status.discarded',
      'discardDialog.title',
      'discardDialog.warning',
      'discardDialog.confirm',
      'discardDialog.back',
      'reissueDialog.title',
      'reissueDialog.confirm',
      'reissueDialog.serviceAmount',
      'reissueDialog.issAmount',
    ]

    for (const key of required) {
      expect(portuguese).toContain(key)
      expect(english).toContain(key)
    }
  })
})
