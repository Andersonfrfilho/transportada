/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { auditAuthenticationStorage, loginAsLocalUser } from './authenticated-smoke.helper'
import { mockBillingWorkspaceApi } from './billing-smoke.helper'
import { mockCteBatchWorkspaceApi } from './cte-batch-smoke.helper'
import { mockFreightWorkspaceApi } from './freight-smoke.helper'

const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
  tablet: { height: 1024, width: 768 },
} as const

type ViewportName = keyof typeof VIEWPORTS

const CTE_BATCH_VIEWPORTS: readonly ViewportName[] = ['mobile', 'tablet', 'desktop']
const CTE_BATCH_FORBIDDEN_MESSAGE = 'Seu acesso atual não permite consultar os lotes de CT-e'

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
}

test('admin configures freight rules on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'freight'))
  const api = await mockFreightWorkspaceApi({
    page,
    permissions: ['settings.manage', 'freight.simulate'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de frete' })).toBeVisible()
  await expect(page.getByText('NF-e elegivel')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Criar regra padrao' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simular frete' })).toBeVisible()
  await page.getByRole('button', { name: 'Criar regra padrao' }).click()
  await expect.poll(api.ruleCreations).toBe(1)
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

for (const viewport of CTE_BATCH_VIEWPORTS) {
  test(`usuário autorizado vê lote CT-e autorizado em ${viewport} sem overflow horizontal`, async ({
    page,
  }) => {
    const api = await mockCteBatchWorkspaceApi({
      initialStatus: 'done',
      page,
      permissions: ['cte.manage', 'cte.submit'],
    })
    await page.setViewportSize(VIEWPORTS[viewport])
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
    await loginAsLocalUser(page)

    await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
    await expect(page.getByText(CTE_BATCH_FORBIDDEN_MESSAGE)).toHaveCount(0)
    await expect(page.getByRole('cell', { exact: true, name: 'Lote CT-e julho' })).toBeVisible()
    await expect(page.getByRole('cell', { exact: true, name: 'Concluído' })).toBeVisible()
    await assertNoHorizontalOverflow(page)
    expect(api.batchCreations()).toBe(0)
    expect(api.submissions()).toBe(0)
    expect(api.cancellations()).toBe(0)
    expect(api.failures()).toEqual([])
    await auditAuthenticationStorage(page)
  })

  test(`usuário autorizado vê lote CT-e rejeitado em ${viewport} sem overflow horizontal`, async ({
    page,
  }) => {
    const api = await mockCteBatchWorkspaceApi({
      initialStatus: 'error',
      page,
      permissions: ['cte.manage', 'cte.submit'],
    })
    await page.setViewportSize(VIEWPORTS[viewport])
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
    await loginAsLocalUser(page)

    await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
    await expect(page.getByText(CTE_BATCH_FORBIDDEN_MESSAGE)).toHaveCount(0)
    await expect(page.getByRole('cell', { exact: true, name: 'Lote CT-e julho' })).toBeVisible()
    await expect(page.getByRole('cell', { exact: true, name: 'Erro' })).toBeVisible()
    await assertNoHorizontalOverflow(page)
    expect(api.batchCreations()).toBe(0)
    expect(api.submissions()).toBe(0)
    expect(api.cancellations()).toBe(0)
    expect(api.failures()).toEqual([])
    await auditAuthenticationStorage(page)
  })

  test(`usuário autorizado vê lote CT-e em retry/reprocessamento em ${viewport} sem overflow horizontal`, async ({
    page,
  }) => {
    const api = await mockCteBatchWorkspaceApi({
      initialStatus: 'in_flight',
      page,
      permissions: ['cte.manage', 'cte.submit'],
    })
    await page.setViewportSize(VIEWPORTS[viewport])
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
    await loginAsLocalUser(page)

    await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
    await expect(page.getByText(CTE_BATCH_FORBIDDEN_MESSAGE)).toHaveCount(0)
    await expect(page.getByRole('cell', { exact: true, name: 'Lote CT-e julho' })).toBeVisible()
    await expect(page.getByRole('cell', { exact: true, name: 'Em processamento' })).toBeVisible()
    // Lote em voo não é submetível: a ação some da linha em vez de ficar desabilitada.
    await expect(page.getByRole('button', { name: 'Submeter' })).toHaveCount(0)
    await assertNoHorizontalOverflow(page)
    expect(api.batchCreations()).toBe(0)
    expect(api.submissions()).toBe(0)
    expect(api.cancellations()).toBe(0)
    expect(api.failures()).toEqual([])
    await auditAuthenticationStorage(page)
  })
}

test('operator simulates freight with explicit minimum adjustment on tablet', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.tablet)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'freight'))
  const api = await mockFreightWorkspaceApi({
    adjustment: 'minimum',
    page,
    permissions: ['freight.simulate'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de frete' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Criar regra padrao' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Simular frete' })).toBeVisible()
  await page.getByRole('button', { name: 'Simular frete' }).click()
  await expect.poll(api.simulations).toBe(1)
  await expect(page.getByText('Resultado da simulacao')).toBeVisible()
  await expect(page.getByText('Total calculado: 400.0000')).toBeVisible()
  await expect(page.getByText('Ajuste aplicado: Minimum applied')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('user without freight permissions sees a closed workspace boundary on desktop', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'freight'))
  const api = await mockFreightWorkspaceApi({ page, permissions: [] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de frete' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Seu acesso atual nao permite consultar este workspace.',
  )
  await expect(page.getByRole('button', { name: 'Criar regra padrao' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Simular frete' })).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
  expect(api.ruleCreations()).toBe(0)
  expect(api.simulations()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('admin submits a CT-e batch on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({
    page,
    permissions: ['cte.manage', 'cte.submit'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
  await expect(page.getByRole('cell', { exact: true, name: 'Rascunho' })).toBeVisible()
  await page.getByRole('button', { name: 'Submeter' }).click()
  await expect.poll(api.submissions).toBe(1)
  await expect(page.getByRole('cell', { exact: true, name: 'Submetido' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  // O lote nasce no workspace de notas: aqui não existe criação, só operação sobre o lote.
  expect(api.batchCreations()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('usuario sem permissao cte visualiza boundary no tablet sem tabela nem filtros', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.tablet)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({ page, permissions: [] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(CTE_BATCH_FORBIDDEN_MESSAGE)
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Filtros' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Submeter' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar lote' })).toHaveCount(0)
  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('usuario com acesso filtra lotes por situacao e por condicao avancada no desktop', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({
    initialStatus: 'done',
    page,
    permissions: ['cte.manage', 'cte.submit'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Filtros' })).toBeVisible()

  await page.getByRole('checkbox', { name: 'Concluído' }).check()
  await expect(page.getByRole('cell', { exact: true, name: 'Lote CT-e julho' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Limpar filtros' })).toBeVisible()

  await page.getByRole('button', { name: 'Avançado' }).click()
  await page.getByRole('combobox', { name: 'Campo' }).selectOption('status')
  await page.getByRole('combobox', { name: 'Operador' }).selectOption('ne')
  await page.getByRole('combobox', { name: 'Valor', exact: true }).selectOption('error')
  await expect(page.getByRole('cell', { exact: true, name: 'Lote CT-e julho' })).toBeVisible()
  await assertNoHorizontalOverflow(page)

  expect(api.failures()).toEqual([])
  expect(api.batchCreations()).toBe(0)
  await auditAuthenticationStorage(page)
})

test('submitter handles an existing CT-e draft on tablet without management controls', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.tablet)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({ page, permissions: ['cte.submit'] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar lote' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Submeter' }).click()
  await expect.poll(api.submissions).toBe(1)
  await expect(page.getByRole('cell', { exact: true, name: 'Submetido' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  expect(api.batchCreations()).toBe(0)
  expect(api.cancellations()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('manager cancels a CT-e batch on desktop without submit controls', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({ page, permissions: ['cte.manage'] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submeter' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancelar lote' }).click()
  await expect.poll(api.cancellations).toBe(1)
  await expect(page.getByRole('cell', { exact: true, name: 'Cancelado' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  expect(api.submissions()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('operator creates a billing invoice on mobile without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'billing'))
  const api = await mockBillingWorkspaceApi({
    page,
    permissions: ['billing.read', 'billing.create', 'billing.cancel'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de faturamento' })).toBeVisible()
  await expect(page.getByText('CT-e elegiveis disponiveis para faturamento.')).toBeVisible()
  await page.locator('input[type="checkbox"]').first().check()
  await page.getByLabel('Vencimento').fill('2026-08-05')
  await page.getByRole('button', { name: 'Gerar fatura' }).click()
  await expect.poll(api.createRequests).toBe(1)
  await expect(page.getByText('Numero: 17')).toBeVisible()
  await expect(page.getByText('Cliente: Transportes Sul Ltda')).toBeVisible()
  await expect(page.getByText('Status: issued')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Baixar documento' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  expect(api.detailRequests()).toBeGreaterThan(0)
  expect(api.documentRequests()).toBeGreaterThan(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('reader sees an empty billing workspace on tablet without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.tablet)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'billing'))
  const api = await mockBillingWorkspaceApi({
    eligibleMode: 'empty',
    page,
    permissions: ['billing.read'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de faturamento' })).toBeVisible()
  await expect(page.getByText('Nenhuma fatura ou CT-e elegivel encontrado.')).toBeVisible()
  await expect(page.getByText('Nenhum CT-e elegivel com os filtros atuais.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gerar fatura' })).toBeDisabled()
  await assertNoHorizontalOverflow(page)
  expect(api.createRequests()).toBe(0)
  expect(api.listRequests()).toBeGreaterThan(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('billing manager reviews details and cancels an invoice on desktop without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'billing'))
  const api = await mockBillingWorkspaceApi({
    initialInvoiceStatus: 'issued',
    page,
    permissions: ['billing.read', 'billing.cancel'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de faturamento' })).toBeVisible()
  await page
    .getByRole('textbox', { name: 'ID da fatura' })
    .fill('00000000-0000-4000-8000-000000000701')
  await expect(page.getByText('Numero: 17')).toBeVisible()
  await expect(page.getByText('Cliente: Transportes Sul Ltda')).toBeVisible()
  await expect(page.getByText('Total: 350.50')).toBeVisible()
  await expect(page.getByText('Status: issued')).toBeVisible()
  await expect(page.getByText('invoice_pdf')).toBeVisible()
  await page.getByRole('textbox', { name: 'Motivo do cancelamento' }).fill('Ajuste operacional')
  await page.getByRole('button', { name: 'Cancelar fatura' }).click()
  await expect.poll(api.cancellationRequests).toBe(1)
  await expect(page.getByText('Fatura cancelada com sucesso.')).toBeVisible()
  await expect(page.getByText('Status: cancelled')).toBeVisible()
  await assertNoHorizontalOverflow(page)
  expect(api.detailRequests()).toBeGreaterThan(0)
  expect(api.documentRequests()).toBeGreaterThan(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('user without billing permissions sees a closed workspace boundary on desktop', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'billing'))
  const api = await mockBillingWorkspaceApi({ page, permissions: [] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de faturamento' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Seu acesso atual nao permite consultar este workspace.',
  )
  await expect(page.getByRole('button', { name: 'Gerar fatura' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar fatura' })).toHaveCount(0)
  await assertNoHorizontalOverflow(page)
  expect(api.createRequests()).toBe(0)
  expect(api.cancellationRequests()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})
