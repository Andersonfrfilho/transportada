/**
 * Contrato das ações por linha da tela de NFS-e. O que cada linha oferece é decisão pura — espelha
 * `nfse-invoice-state.policy.ts` da API —, então se prova sem montar React; o que sobra é conferido
 * no texto do componente, que é como as demais telas deste módulo se guardam.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_INVOICE_LIST_ITEM,
  CANCELLATION_REASON,
  DOCUMENT_DOWNLOAD,
  INVOICE_ID,
  loadFutureModule,
} from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const ACTIONS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceRowActions.service'

const ACTIONS_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceRowActions.component.tsx'
const CANCEL_DIALOG_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceCancelDialog.component.tsx'
const DETAIL_DIALOG_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceDetailDialog.component.tsx'
const HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceRowActions.hook.ts'
const PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const TABLE_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceTable.component.tsx'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

/** A API aceita `^[A-Za-z0-9._:-]{16,256}$` no cabeçalho — chave fora disso é 400 antes do domínio. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,256}$/

const READ_ONLY = ['nfse.read'] as const
const READ_AND_CANCEL = ['nfse.read', 'nfse.cancel'] as const

type RowActionState = Readonly<{
  isCancelEnabled: boolean
  isCancelVisible: boolean
  isDetailEnabled: boolean
  isDownloadEnabled: boolean
}>

type ReasonCheck =
  | Readonly<{ reason: string; status: 'blocked' }>
  | Readonly<{ status: 'ready'; value: string }>

type ActionsModule = Readonly<{
  buildNfseCancellationIdempotencyKey: (
    input: Readonly<{ invoiceId: string; token: string }>,
  ) => string
  NFSE_DOWNLOADABLE_STATUSES: readonly string[]
  readNfseDownloadUrl: (download: unknown) => string
  resolveNfseRowActions: (
    input: Readonly<{ permissions: readonly string[]; status: string }>,
  ) => RowActionState
  validateNfseCancellationReason: (reason: string) => ReasonCheck
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

describe('nfse row action availability contract', () => {
  /** A API só transita `authorized` → `cancellation_requested`: oferecer o botão fora daí é 409. */
  test('offers cancellation only on an authorized invoice', async () => {
    const actions = await loadActions()

    expect(
      actions.resolveNfseRowActions({
        permissions: READ_AND_CANCEL,
        status: AUTHORIZED_INVOICE_LIST_ITEM.status,
      }).isCancelEnabled,
    ).toBe(true)

    for (const status of [
      'cancellation_requested',
      'cancelled',
      'failed',
      'issuing',
      'pending_authorization',
      'rejected',
      'requested',
    ]) {
      expect(
        actions.resolveNfseRowActions({ permissions: READ_AND_CANCEL, status }).isCancelEnabled,
      ).toBe(false)
    }
  })

  /** Cancelar é permissão própria: quem só lê não vê o botão, em vez de vê-lo desabilitado. */
  test('hides the cancel button from whoever cannot cancel', async () => {
    const actions = await loadActions()
    const readerState = actions.resolveNfseRowActions({
      permissions: READ_ONLY,
      status: 'authorized',
    })

    expect(readerState.isCancelVisible).toBe(false)
    expect(readerState.isCancelEnabled).toBe(false)
    expect(
      actions.resolveNfseRowActions({ permissions: READ_AND_CANCEL, status: 'authorized' })
        .isCancelVisible,
    ).toBe(true)
  })

  /** O XML e o PDF nascem na autorização e sobrevivem ao cancelamento — antes dela não há arquivo. */
  test('offers the download only where the fiscal document already exists', async () => {
    const actions = await loadActions()

    expect([...actions.NFSE_DOWNLOADABLE_STATUSES].toSorted()).toEqual([
      'authorized',
      'cancellation_requested',
      'cancelled',
    ])

    for (const status of actions.NFSE_DOWNLOADABLE_STATUSES) {
      expect(
        actions.resolveNfseRowActions({ permissions: READ_ONLY, status }).isDownloadEnabled,
      ).toBe(true)
    }
    for (const status of ['failed', 'issuing', 'pending_authorization', 'rejected', 'requested']) {
      expect(
        actions.resolveNfseRowActions({ permissions: READ_ONLY, status }).isDownloadEnabled,
      ).toBe(false)
    }
  })

  test('the detail is open to whoever reads and closed to whoever does not', async () => {
    const actions = await loadActions()

    expect(
      actions.resolveNfseRowActions({ permissions: READ_ONLY, status: 'rejected' }).isDetailEnabled,
    ).toBe(true)
    expect(
      actions.resolveNfseRowActions({ permissions: [], status: 'authorized' }).isDetailEnabled,
    ).toBe(false)
    expect(
      actions.resolveNfseRowActions({ permissions: [], status: 'authorized' }).isDownloadEnabled,
    ).toBe(false)
  })
})

describe('nfse cancellation reason contract', () => {
  /** O corpo da API é `.strict()` com `.trim().min(5).max(255)`: a tela recusa antes de gastar rede. */
  test('rejects a reason shorter than the api floor, counting the trimmed text', async () => {
    const actions = await loadActions()

    expect(actions.validateNfseCancellationReason('   ')).toEqual({
      reason: 'reasonTooShort',
      status: 'blocked',
    })
    expect(actions.validateNfseCancellationReason('  abc  ')).toEqual({
      reason: 'reasonTooShort',
      status: 'blocked',
    })
  })

  test('rejects a reason beyond the api ceiling', async () => {
    const actions = await loadActions()

    expect(actions.validateNfseCancellationReason('a'.repeat(256))).toEqual({
      reason: 'reasonTooLong',
      status: 'blocked',
    })
    expect(actions.validateNfseCancellationReason('a'.repeat(255)).status).toBe('ready')
  })

  test('sends the trimmed reason, never the raw field', async () => {
    const actions = await loadActions()

    expect(actions.validateNfseCancellationReason(`  ${CANCELLATION_REASON}  `)).toEqual({
      status: 'ready',
      value: CANCELLATION_REASON,
    })
  })
})

describe('nfse cancellation idempotency contract', () => {
  test('builds a key the api header accepts, stable for the same attempt', async () => {
    const actions = await loadActions()
    const token = '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93'
    const key = actions.buildNfseCancellationIdempotencyKey({ invoiceId: INVOICE_ID, token })

    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(actions.buildNfseCancellationIdempotencyKey({ invoiceId: INVOICE_ID, token })).toBe(key)
    expect(
      actions.buildNfseCancellationIdempotencyKey({ invoiceId: INVOICE_ID, token: 'outro-token' }),
    ).not.toBe(key)
  })
})

describe('nfse document download contract', () => {
  test('reads the signed url and refuses a body that is not one', async () => {
    const actions = await loadActions()

    expect(actions.readNfseDownloadUrl(DOCUMENT_DOWNLOAD)).toBe(DOCUMENT_DOWNLOAD.url)
    expect(() => actions.readNfseDownloadUrl({ url: 42 })).toThrow()
    expect(() => actions.readNfseDownloadUrl(null)).toThrow()
  })

  /** O documento fiscal sai por link assinado: guardar bytes no estado da tela seria outro produto. */
  test('opens the url through an injected opener instead of touching window directly', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('openUrl')
    expect(hook).toContain('readNfseDownloadUrl')
    expect(hook).toContain('getInvoiceDocumentUrl')
    expect(hook).toContain('noopener')
  })
})

describe('nfse row actions rendering contract', () => {
  test('the table gains an actions column, header and cell', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).toContain('NfseInvoiceRowActions')
    expect(table).toContain('<NfseInvoiceRowActions')
    expect(table).toContain("t('table.columns.actions')")
  })

  test('every icon-only button carries an accessible name', async () => {
    const actions = await readApplicationFile(ACTIONS_PATH)

    expect(actions).toContain('aria-label')
    expect(actions).toContain('name="eye"')
    expect(actions).toContain('name="download"')
    expect(actions).toContain('name="trash"')
    // O ícone cru é proibido fora de `components/ui`; a ação usa o componente do design system.
    expect(actions).not.toContain('<svg')
  })

  test('the cell asks the pure service what it may offer, instead of testing status inline', async () => {
    const [actions, hook] = await Promise.all([
      readApplicationFile(ACTIONS_PATH),
      readApplicationFile(HOOK_PATH),
    ])

    expect(actions).toContain('actions.resolveActions(invoice.status)')
    expect(actions).not.toContain("=== 'authorized'")
    expect(hook).toContain('resolveNfseRowActions')
  })

  test('the dialogs go to a portal over the body, like the emission one', async () => {
    const [cancelDialog, detailDialog] = await Promise.all([
      readApplicationFile(CANCEL_DIALOG_PATH),
      readApplicationFile(DETAIL_DIALOG_PATH),
    ])

    for (const dialog of [cancelDialog, detailDialog]) {
      expect(dialog).toContain('createPortal')
      expect(dialog).toContain('useModalDialog')
      expect(dialog).toContain('aria-modal="true"')
      expect(dialog).toContain('document.body')
    }
  })

  /** Estado de carregamento é esqueleto, nunca texto solto nem `null` — a tela não pode piscar. */
  test('the detail loads as a skeleton shaped like the content it precedes', async () => {
    const detailDialog = await readApplicationFile(DETAIL_DIALOG_PATH)

    expect(detailDialog).toContain('SkeletonGroup')
    expect(detailDialog).toContain('Skeleton')
    expect(detailDialog).toContain('rejectionMessage')
    expect(detailDialog).toContain('formatAmount')
  })

  test('the page mounts both dialogs beside the table', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('<NfseInvoiceDetailDialog')
    expect(page).toContain('<NfseInvoiceCancelDialog')
    expect(page).toContain('table.rowActions')
  })
})

describe('nfse row actions locale contract', () => {
  test('the two locales declare the same keys for the new actions', async () => {
    const [portuguese, english] = await Promise.all([
      readLocaleKeys(PT_LOCALE_PATH),
      readLocaleKeys(EN_LOCALE_PATH),
    ])
    const required = [
      'table.columns.actions',
      'rowActions.cancel',
      'rowActions.detail',
      'rowActions.downloadPdf',
      'rowActions.downloadXml',
      'detail.title',
      'detail.charges',
      'detail.documents',
      'detail.rejection',
      'cancelDialog.title',
      'cancelDialog.reason',
      'cancelDialog.confirm',
      'cancelDialog.reasonTooShort',
      'cancelDialog.reasonTooLong',
    ]

    for (const key of required) {
      expect(portuguese).toContain(key)
      expect(english).toContain(key)
    }
  })
})
