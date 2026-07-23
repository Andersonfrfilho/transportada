/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { auditAuthenticationStorage, loginAsLocalUser } from './authenticated-smoke.helper'
import { mockCteBatchWorkspaceApi } from './cte-batch-smoke.helper'
import { mockFreightWorkspaceApi } from './freight-smoke.helper'

const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
  tablet: { height: 1024, width: 768 },
} as const

type ViewportName = keyof typeof VIEWPORTS

const CTE_BATCH_VIEWPORTS: readonly ViewportName[] = ['mobile', 'tablet', 'desktop']

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

    await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
    await expect(
      page.getByText('Seu acesso atual nao permite consultar este workspace.'),
    ).toHaveCount(0)
    await expect(page.getByText(/^Lote CT-e julho$/)).toBeVisible()
    await expect(page.getByText(/Status:/)).toBeVisible()
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

    await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
    await expect(
      page.getByText('Seu acesso atual nao permite consultar este workspace.'),
    ).toHaveCount(0)
    await expect(page.getByText(/^Lote CT-e julho$/)).toBeVisible()
    await expect(page.getByText(/Status:/)).toBeVisible()
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

    await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
    await expect(
      page.getByText('Seu acesso atual nao permite consultar este workspace.'),
    ).toHaveCount(0)
    await expect(page.getByText(/^Lote CT-e julho$/)).toBeVisible()
    await expect(page.getByText(/Status:/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submeter lote CT-e' })).toBeDisabled()
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

test('admin creates and submits a CT-e batch on mobile without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({
    page,
    permissions: ['cte.manage', 'cte.submit'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
  await expect(page.getByText('Documento elegivel para CT-e')).toBeVisible()
  await page.getByRole('button', { name: 'Criar lote CT-e' }).click()
  await expect.poll(api.batchCreations).toBe(1)
  await page.getByRole('button', { name: 'Submeter lote CT-e' }).click()
  await expect.poll(api.submissions).toBe(1)
  await expect(page.getByText('Status: submitted')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('usuario sem permissao cte visualiza boundary no tablet e usa filtros de estado', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.tablet)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({ page, permissions: [] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Seu acesso atual nao permite consultar este workspace.',
  )
  await expect(page.getByRole('button', { name: 'Submeter lote CT-e' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar lote CT-e' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Criar lote CT-e' })).toHaveCount(0)
  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('usuario com acesso consulta filtros de status e valor diferente de no desktop', async ({
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

  await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Status do lote' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Status diferente de' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Filtro avançado' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Valor do filtro avançado' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Limpar filtros' })).toBeVisible()

  await page.getByRole('combobox', { name: 'Status do lote' }).selectOption('done')
  await page.getByRole('combobox', { name: 'Status diferente de' }).selectOption('error')
  await page.getByRole('combobox', { name: 'Filtro avançado' }).selectOption('itemCountGt')
  await page.getByRole('textbox', { name: 'Valor do filtro avançado' }).fill('1')
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

  await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Criar lote CT-e' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar lote CT-e' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Submeter lote CT-e' }).click()
  await expect.poll(api.submissions).toBe(1)
  await expect(page.getByText('Status: submitted')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
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

  await expect(page.getByRole('heading', { name: 'Workspace de CT-e' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submeter lote CT-e' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancelar lote CT-e' }).click()
  await expect.poll(api.cancellations).toBe(1)
  await expect(page.getByText('Status: cancelled')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
  expect(api.submissions()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})
