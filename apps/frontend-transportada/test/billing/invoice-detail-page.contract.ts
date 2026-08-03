/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { BILLING_INVOICE_ID, loadFutureModule } from './billing.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const ROUTE_SERVICE_PATH = '../../src/modules/billing/shared/billingInvoiceRoute.service'
const DETAIL_PAGE_PATH = 'src/modules/billing/pages/BillingInvoiceDetail.page.tsx'
const WORKSPACE_PAGE_PATH = 'src/modules/billing/pages/BillingWorkspace.page.tsx'
const INVOICE_TABLE_HOOK_PATH = 'src/modules/billing/hooks/useBillingInvoiceTable.hook.ts'
const INVOICE_TABLE_COMPONENT_PATH =
  'src/modules/billing/components/BillingInvoiceTable.component.tsx'
const SHELL_PATH = 'src/main.tsx'
const PT_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.locale.json'
const EN_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.en.locale.json'

type BillingInvoiceRouteModule = {
  readonly BILLING_INVOICES_ROUTE: string
  readonly BILLING_WORKSPACE: string
  readonly buildBillingInvoiceRoute: (invoiceId: string) => string
  readonly navigateToBillingInvoice: (input: {
    readonly invoiceId: string
    readonly navigator: WorkspaceNavigatorSpy['navigator']
  }) => void
  readonly navigateToBillingInvoices: (navigator: WorkspaceNavigatorSpy['navigator']) => void
  readonly parseBillingInvoiceRoute: (pathname: string) => null | string
}

type WorkspaceNavigatorSpy = Readonly<{
  navigator: Readonly<{
    dispatchPopState: () => void
    pushPath: (path: string) => void
    rememberWorkspace: (workspace: string) => void
  }>
  popStateCount: () => number
  pushedPaths: readonly string[]
  rememberedWorkspaces: readonly string[]
}>

function createNavigatorSpy(): WorkspaceNavigatorSpy {
  const pushedPaths: string[] = []
  const rememberedWorkspaces: string[] = []
  let popStateCount = 0

  return {
    navigator: {
      dispatchPopState: () => {
        popStateCount += 1
      },
      pushPath: (path) => pushedPaths.push(path),
      rememberWorkspace: (workspace) => rememberedWorkspaces.push(workspace),
    },
    popStateCount: () => popStateCount,
    pushedPaths,
    rememberedWorkspaces,
  }
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readInvoiceDetailSection(filePath: string): Promise<Record<string, unknown>> {
  const dictionary = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  return dictionary['invoiceDetail'] as Record<string, unknown>
}

describe('billing invoice detail page contract', () => {
  test('builds and reads the invoice route without confusing it with the invoice list', async () => {
    const { BILLING_INVOICES_ROUTE, buildBillingInvoiceRoute, parseBillingInvoiceRoute } =
      await loadFutureModule<BillingInvoiceRouteModule>(ROUTE_SERVICE_PATH)

    expect(BILLING_INVOICES_ROUTE).toBe('/billing')
    expect(buildBillingInvoiceRoute(BILLING_INVOICE_ID)).toBe(
      `/billing/invoices/${BILLING_INVOICE_ID}`,
    )
    expect(parseBillingInvoiceRoute(`/billing/invoices/${BILLING_INVOICE_ID}`)).toBe(
      BILLING_INVOICE_ID,
    )
    /** Barra final é a mesma tela: o navegador acrescenta sozinho ao colar o endereço. */
    expect(parseBillingInvoiceRoute(`/billing/invoices/${BILLING_INVOICE_ID}/`)).toBe(
      BILLING_INVOICE_ID,
    )
    expect(parseBillingInvoiceRoute('/billing')).toBeNull()
    expect(parseBillingInvoiceRoute('/billing/invoices')).toBeNull()
    expect(parseBillingInvoiceRoute('/billing/invoices/')).toBeNull()
    expect(parseBillingInvoiceRoute(`/billing/invoices/${BILLING_INVOICE_ID}/documents`)).toBeNull()
    expect(parseBillingInvoiceRoute('/cte-batches')).toBeNull()
  })

  test('navigates to the detail page and back to the list keeping the billing workspace active', async () => {
    const { BILLING_WORKSPACE, navigateToBillingInvoice, navigateToBillingInvoices } =
      await loadFutureModule<BillingInvoiceRouteModule>(ROUTE_SERVICE_PATH)
    const spy = createNavigatorSpy()

    navigateToBillingInvoice({ invoiceId: BILLING_INVOICE_ID, navigator: spy.navigator })
    navigateToBillingInvoices(spy.navigator)

    expect(BILLING_WORKSPACE).toBe('billing')
    expect(spy.pushedPaths).toEqual([`/billing/invoices/${BILLING_INVOICE_ID}`, '/billing'])
    expect(spy.rememberedWorkspaces).toEqual(['billing', 'billing'])
    /** Sem o `popstate` a navegação manual do shell não repinta a página. */
    expect(spy.popStateCount()).toBe(2)
  })

  test('opens the invoice as a route instead of a panel glued under the table', async () => {
    const [hook, table] = await Promise.all([
      readApplicationFile(INVOICE_TABLE_HOOK_PATH),
      readApplicationFile(INVOICE_TABLE_COMPONENT_PATH),
    ])

    expect(hook).toContain('navigateToBillingInvoice')
    expect(hook).toContain('createBrowserWorkspaceNavigator')
    expect(hook).not.toContain('activeInvoiceId')
    expect(hook).not.toContain('closeInvoice')
    expect(table).toContain('table.openInvoice(item.id)')
    expect(table).not.toContain('activeInvoiceId')
  })

  test('leaves the workspace page with the list only and sends a new invoice straight to its page', async () => {
    const page = await readApplicationFile(WORKSPACE_PAGE_PATH)

    expect(page).toContain('navigateToBillingInvoice')
    expect(page).toContain('BillingInvoiceTable')
    expect(page).not.toContain('BillingInvoiceDetail')
    expect(page).not.toContain('activeInvoiceId')
  })

  test('renders the detail on its own page with the invoice from the route', async () => {
    const page = await readApplicationFile(DETAIL_PAGE_PATH)

    expect(page).toContain('export function BillingInvoiceDetailPage(')
    expect(page).toContain('invoiceId')
    expect(page).toContain('useAuthMeQuery')
    expect(page).toContain('useBillingWorkspace')
    expect(page).toContain('BillingInvoiceDetail')
    expect(page).toContain('navigateToBillingInvoices')
    expect(page).toContain('createBrowserWorkspaceNavigator')
    expect(page).toContain('useTranslation')
    expect(page).toContain('invoiceDetail.pageKicker')
    expect(page).not.toContain('Tabs')
    expect(page).not.toMatch(/style=\{\{/)
  })

  test('routes the detail path in the shell without losing the billing entry in the sidebar', async () => {
    const shell = await readApplicationFile(SHELL_PATH)

    expect(shell).toContain('parseBillingInvoiceRoute')
    expect(shell).toContain('BillingInvoiceDetailPage')
    expect(shell).toContain('currentPath')
    expect(shell).toContain("window.location.pathname === '/billing'")
  })

  test('publishes the page strings in both locales', async () => {
    const [ptDetail, enDetail] = await Promise.all([
      readInvoiceDetailSection(PT_LOCALE_PATH),
      readInvoiceDetailSection(EN_LOCALE_PATH),
    ])

    for (const detail of [ptDetail, enDetail]) {
      expect(typeof detail['pageKicker']).toBe('string')
      expect(typeof detail['pageIntro']).toBe('string')
      expect(typeof detail['close']).toBe('string')
    }
    expect(ptDetail['close']).toContain('Voltar')
    expect(enDetail['close']).toContain('Back')
  })
})
