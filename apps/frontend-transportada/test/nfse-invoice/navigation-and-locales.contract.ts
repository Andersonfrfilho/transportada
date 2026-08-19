import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const CONSTANT_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoice.constant'
const SHELL_PATH = 'src/main.tsx'
const ICON_PATH = 'src/components/ui/icon.tsx'
const I18N_PATH = 'src/modules/shared/i18n/i18n.service.ts'
const WORKSPACE_PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

/** Todo código de domínio que a nota pode devolver precisa virar frase — senão a tela cala. */
const API_ERROR_CODES = [
  'NFSE_CREDENTIAL_MISSING',
  'NFSE_CREDENTIAL_UNAVAILABLE',
  'NFSE_DESCRIPTION_TEMPLATE_INVALID',
  'NFSE_DESCRIPTION_TOO_LONG',
  'NFSE_DOCUMENT_ALREADY_LINKED',
  'NFSE_DOCUMENT_DUPLICATED',
  'NFSE_DOCUMENT_LINKED_TO_CTE_BATCH',
  'NFSE_DOCUMENT_MISSING_TAKER_ADDRESS',
  'NFSE_DOCUMENT_MISSING_TAKER_NAME',
  'NFSE_DOCUMENT_NOT_FOUND',
  'NFSE_EMISSION_PROFILE_NOT_ACTIVE',
  'NFSE_FISCAL_DOCUMENT_UNAVAILABLE',
  'NFSE_FISCAL_SETTINGS_MISSING',
  'NFSE_FREIGHT_RULE_VERSION_MISSING',
  'NFSE_INVOICE_ALREADY_AUTHORIZED',
  'NFSE_INVOICE_ALREADY_CANCELLED',
  'NFSE_INVOICE_CANCELLATION_IN_FLIGHT',
  'NFSE_INVOICE_CREATE_SPANS_MULTIPLE_TAKERS',
  'NFSE_INVOICE_IN_FLIGHT',
  'NFSE_INVOICE_NOT_AUTHORIZED',
  'NFSE_INVOICE_NOT_FOUND',
  'NFSE_INVOICE_PENDING_AUTHORIZATION',
  'NFSE_ISS_RATE_OUT_OF_RANGE',
] as const

type ConstantModule = {
  readonly NFSE_CANCEL_PERMISSION: string
  readonly NFSE_CANCELLATION_REASON_MAX_LENGTH: number
  readonly NFSE_CANCELLATION_REASON_MIN_LENGTH: number
  readonly NFSE_INVOICE_ERROR: Readonly<{
    FORBIDDEN: string
    REQUEST_FAILED: string
    RESPONSE_INVALID: string
  }>
  readonly NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>>
  readonly NFSE_INVOICE_PAGE_SIZE: number
  readonly NFSE_INVOICE_WORKSPACE_ROUTE: string
  readonly NFSE_ISSUE_PERMISSION: string
  readonly NFSE_MAX_SELECTION_DOCUMENTS: number
  readonly NFSE_READ_PERMISSION: string
  readonly NFSE_SERVICE_INVOICES_PATH: string
}

describe('nfse invoice constants contract', () => {
  test('mirrors the api path, the permissions and the bounds the api enforces', async () => {
    const constants = await loadFutureModule<ConstantModule>(CONSTANT_MODULE)

    expect(constants.NFSE_SERVICE_INVOICES_PATH).toBe('/nfse-service-invoices')
    expect(constants.NFSE_INVOICE_WORKSPACE_ROUTE).toBe('/nfse-invoices')
    expect(constants.NFSE_READ_PERMISSION).toBe('nfse.read')
    expect(constants.NFSE_ISSUE_PERMISSION).toBe('nfse.issue')
    expect(constants.NFSE_CANCEL_PERMISSION).toBe('nfse.cancel')
    expect(constants.NFSE_INVOICE_PAGE_SIZE).toBe(25)
    expect(constants.NFSE_MAX_SELECTION_DOCUMENTS).toBe(500)
    expect(constants.NFSE_CANCELLATION_REASON_MIN_LENGTH).toBe(5)
    expect(constants.NFSE_CANCELLATION_REASON_MAX_LENGTH).toBe(255)
    expect(constants.NFSE_INVOICE_ERROR).toEqual({
      FORBIDDEN: 'NFSE_INVOICE_FORBIDDEN',
      REQUEST_FAILED: 'NFSE_INVOICE_REQUEST_FAILED',
      RESPONSE_INVALID: 'NFSE_INVOICE_RESPONSE_INVALID',
    })
  })

  test('translates every api error code and every client failure into a feedback key', async () => {
    const { NFSE_INVOICE_ERROR, NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR } =
      await loadFutureModule<ConstantModule>(CONSTANT_MODULE)

    for (const code of [...API_ERROR_CODES, ...Object.values(NFSE_INVOICE_ERROR)]) {
      expect(NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR[code]).toBeString()
    }
  })
})

describe('nfse invoice navigation contract', () => {
  test('adds the workspace to the shell without dropping it from the fiscal group', async () => {
    const shell = await readApplicationFile(SHELL_PATH)

    expect(shell).toContain('NfseInvoiceWorkspacePage')
    expect(shell).toContain("{ href: '/nfse-invoices', key: 'nfse-invoice', label: 'NFS-e' }")
    expect(shell).toContain("case 'nfse-invoice':")
    expect(shell).toContain("window.location.pathname === '/nfse-invoices'")
    expect(shell).toContain("storedWorkspace === 'nfse-invoice'")

    /** A lista do grupo fiscal aparece duas vezes: no menu e no estado inicial do acordeão. */
    const fiscalGroups = shell.match(/\[\s*'nfe',\s*'freight'[^\]]*\]/g) ?? []
    expect(fiscalGroups).toHaveLength(2)
    for (const group of fiscalGroups) {
      expect(group).toContain("'nfse-invoice'")
    }
  })

  test('ships the sidebar icon the workspace key demands', async () => {
    const icon = await readApplicationFile(ICON_PATH)

    /** O menu monta `workspace-${key}`: chave nova sem ícone quebra a barra lateral em runtime. */
    expect(icon.match(/'workspace-nfse-invoice'/g) ?? []).toHaveLength(2)
  })

  test('registers the namespace in both languages', async () => {
    const i18n = await readApplicationFile(I18N_PATH)

    expect(i18n).toContain(
      "import nfseInvoiceLocale from '@/modules/nfse-invoice/locales/nfseInvoice.locale.json'",
    )
    expect(i18n).toContain(
      "import nfseInvoiceEnglishLocale from '@/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'",
    )
    expect(i18n).toContain('nfseInvoice: nfseInvoiceEnglishLocale')
    expect(i18n).toContain('nfseInvoice: nfseInvoiceLocale')
  })

  test('lands on a page that gates by permission and waits with a skeleton', async () => {
    const page = await readApplicationFile(WORKSPACE_PAGE_PATH)

    expect(page).toContain('SkeletonGroup')
    expect(page).toContain('NFSE_READ_PERMISSION')
    expect(page).not.toContain('Carregando')
    expect(page).not.toContain('<svg')
    expect(page).not.toContain('<select')
    expect(page).not.toContain('type="checkbox"')
  })
})

describe('nfse invoice locales contract', () => {
  test('publishes the same keys in both languages', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale(PT_LOCALE_PATH),
      readLocale(EN_LOCALE_PATH),
    ])

    expect(flattenKeys(english)).toEqual(flattenKeys(portuguese))
  })

  test('covers every feedback key the error map points to', async () => {
    const { NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR } =
      await loadFutureModule<ConstantModule>(CONSTANT_MODULE)
    const [portuguese, english] = await Promise.all([
      readLocale(PT_LOCALE_PATH),
      readLocale(EN_LOCALE_PATH),
    ])

    for (const feedbackKey of new Set(Object.values(NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR))) {
      expect(flattenKeys(portuguese)).toContain(`feedback.${feedbackKey}`)
      expect(flattenKeys(english)).toContain(`feedback.${feedbackKey}`)
    }
  })

  /** O tomador é dado de cliente: nome e CNPJ entram por variável, nunca como exemplo no texto. */
  test('keeps taker data out of the published strings', async () => {
    const portuguese = JSON.stringify(await readLocale(PT_LOCALE_PATH))

    expect(portuguese).not.toMatch(/[0-9]{11,14}/)
    expect(portuguese).not.toMatch(/[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}/)
  })
})

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
}

function flattenKeys(dictionary: Record<string, unknown>, prefix = ''): readonly string[] {
  return Object.entries(dictionary)
    .flatMap(([key, value]) => {
      const path = prefix === '' ? key : `${prefix}.${key}`
      return isDictionary(value) ? flattenKeys(value, path) : [path]
    })
    .sort()
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
