/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { auditAuthenticationStorage, loginAsLocalUser } from './authenticated-smoke.helper'
import {
  BILLING_DOCUMENT_BYTES,
  BILLING_DOCUMENT_DOWNLOAD_URL,
  BILLING_DOCUMENT_FILE_NAME,
  mockBillingWorkspaceApi,
} from './billing-smoke.helper'
import {
  CTE_EXPORT_FILE_NAME,
  CTE_ITEM_ID,
  mockCteBatchWorkspaceApi,
  SYNTHETIC_CTE_ARCHIVE_BYTES,
} from './cte-batch-smoke.helper'
import {
  buildCrlvPdf,
  buildLabelledColumns,
  buildTextPdf,
} from './document-intake/pdf-fixture.helper'
import { DRIVER_ACCESS_KEY, DRIVER_STOP_ID, mockDriverTripApi } from './driver-trip-smoke.helper'
import { PENDING_DOCUMENT, mockFleetWorkspaceApi } from './fleet-smoke.helper'
import { mockFreightWorkspaceApi } from './freight-smoke.helper'
import {
  CREATED_TRIP_ID,
  FIRST_VEHICLE_ID,
  AGGREGATE_DRIVER_ID,
  mockMultiVehicleApi,
  STAFF_DRIVER_ID,
  SECOND_VEHICLE_ID,
} from './multi-vehicle-smoke.helper'
import { mockNfeWorkspaceApi } from './nfe-workspace-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID as TRIP_SMOKE_TRIP_ID } from './trip-smoke.helper'

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

/** Quem tem `cte.submit` abre o workspace na aba de CT-es: a tabela de lotes vive atrás de "Lotes". */
async function openBatchesTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /^Lotes/u }).click()
}

/** O detalhe da fatura vive dentro da aba "Faturas", ao lado da tabela. */
async function openInvoicesTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Faturas' }).click()
}

/** A seção interna é a última: a externa é só o painel do workspace que a envolve. */
function invoiceDetailPanel(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Detalhe da fatura' }) })
    .last()
}

/** `<select>` nativo é proibido: o design system abre um listbox a partir de um gatilho de botão. */
async function chooseOption(
  page: Page,
  input: Readonly<{ name: string; option: string }>,
): Promise<void> {
  await page.getByRole('button', { exact: true, name: input.name }).click()
  await page.getByRole('option', { exact: true, name: input.option }).click()
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
    await openBatchesTab(page)
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
    await openBatchesTab(page)
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
    await openBatchesTab(page)
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
  await openBatchesTab(page)
  await expect(page.getByRole('cell', { exact: true, name: 'Rascunho' })).toBeVisible()
  await page.getByLabel('Selecionar lote Lote CT-e julho').check()
  await page.getByRole('button', { name: 'Transmitir os lotes selecionados' }).click()
  await expect.poll(api.submissions).toBe(1)
  await expect(page.getByRole('cell', { exact: true, name: 'Submetido' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  // O lote nasce no workspace de notas: aqui não existe criação, só operação sobre o lote.
  expect(api.batchCreations()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('admin acompanha a transmissão em lote pela barra de progresso no desktop', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({
    page,
    permissions: ['cte.manage', 'cte.submit'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Lotes de CT-e' })).toBeVisible()
  await openBatchesTab(page)
  await page.getByLabel('Selecionar lote Lote CT-e julho').check()
  await page.getByRole('button', { name: 'Transmitir os lotes selecionados' }).click()

  await expect.poll(api.submissions).toBe(1)
  const queueing = page.getByRole('progressbar', { name: 'Progresso do enfileiramento dos lotes' })
  await expect(queueing).toHaveAttribute('aria-valuenow', '100')
  // `exact` porque a legenda da SEFAZ começa com o mesmo texto e por substring casaria com as duas.
  await expect(page.getByText('100% — 1 de 1 lote(s)', { exact: true })).toBeVisible()
  await expect(page.getByText('1 na fila · 0 com erro')).toBeVisible()
  // Enfileirar não é transmitir: a barra da SEFAZ só fecha quando a resposta chega.
  const awaiting = page.getByRole('progressbar', { name: 'Progresso da transmissão para a SEFAZ' })
  await expect(awaiting).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByText('0% — 0 de 1 CT-e(s) com resposta da SEFAZ')).toBeVisible()
  await expect(
    page.getByText('1 CT-e(s) ainda transmitindo — a tela atualiza sozinha.'),
  ).toBeVisible()
  await expect(page.getByRole('cell', { exact: true, name: 'Submetido' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
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
  await openBatchesTab(page)
  await page.getByRole('button', { exact: true, name: 'Filtros' }).click()

  await page.getByRole('checkbox', { name: 'Concluído' }).check()
  await expect(page.getByRole('cell', { exact: true, name: 'Lote CT-e julho' })).toBeVisible()
  // A ação de limpar da barra de ferramentas só aparece com filtro ou ordenação ativa.
  await expect(page.getByLabel('Limpar filtros')).toBeVisible()

  await page.getByRole('button', { name: 'Avançado' }).click()
  await chooseOption(page, { name: 'Campo', option: 'Situação' })
  await chooseOption(page, { name: 'Operador', option: 'diferente de' })
  await chooseOption(page, { name: 'Valor', option: 'Erro' })
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
  await openBatchesTab(page)
  await expect(page.getByRole('button', { name: 'Cancelar lote' })).toHaveCount(0)
  await page.getByLabel('Selecionar lote Lote CT-e julho').check()
  await page.getByRole('button', { name: 'Transmitir os lotes selecionados' }).click()
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

test('operador baixa o ZIP de XML por seleção e por filtro no desktop', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'cte-batch'))
  const api = await mockCteBatchWorkspaceApi({
    initialStatus: 'done',
    page,
    permissions: ['cte.manage', 'cte.submit'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'CT-es da empresa' })).toBeVisible()
  await expect.poll(api.itemListRequests).toBeGreaterThan(0)
  await page.getByRole('checkbox', { name: 'Selecionar CT-e' }).check()
  await expect(page.getByText('1 CT-e(s) selecionado(s)')).toBeVisible()

  const [selectionDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar (1 CT-e(s))' }).click(),
  ])
  expect(selectionDownload.suggestedFilename()).toBe(CTE_EXPORT_FILE_NAME)
  const selectionPath = await selectionDownload.path()
  expect(readFileSync(selectionPath).equals(SYNTHETIC_CTE_ARCHIVE_BYTES)).toBe(true)

  await page.getByRole('button', { name: 'Limpar seleção' }).click()
  await page.getByRole('button', { name: 'Filtros de CT-e' }).click()
  await page.getByRole('textbox', { name: 'Número do CT-e' }).fill('5000')
  const [filteredDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar do filtro (1 filtro(s))' }).click(),
  ])
  expect(filteredDownload.suggestedFilename()).toBe(CTE_EXPORT_FILE_NAME)

  // O recorte sai como filtro no corpo, sem companyId: a empresa é a do contexto autenticado.
  // O formato viaja explícito desde que a tela passou a oferecer XML, PDF ou os dois.
  expect(api.exportBodies().map((body) => JSON.parse(body) as unknown)).toEqual([
    { format: 'xml', itemIds: [CTE_ITEM_ID] },
    { filters: { cteNumberIn: ['5000'], statusIn: ['authorized'] }, format: 'xml' },
  ])
  await assertNoHorizontalOverflow(page)
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
  await expect(page.getByText('CT-e elegíveis disponíveis para faturamento.')).toBeVisible()
  await page.locator('input[type="checkbox"]').first().check()
  await chooseOption(page, { name: 'Prazo de vencimento', option: '30 dias' })
  await page.getByRole('button', { exact: true, name: 'Gerar fatura' }).click()
  await expect.poll(api.createRequests).toBe(1)

  // Emitir troca de aba sozinho: o detalhe da fatura recém-criada já abre em "Faturas".
  const detail = invoiceDetailPanel(page)
  await expect(detail.getByText('Número')).toBeVisible()
  await expect(detail.getByText('17', { exact: true })).toBeVisible()
  await expect(detail.getByText('Transportes Sul Ltda')).toBeVisible()
  await expect(detail.getByText('Emitida', { exact: true })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Baixar documento' })).toBeVisible()
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
  await expect(page.getByText('Nenhuma fatura ou CT-e elegível encontrado.')).toBeVisible()
  await expect(page.getByText('Nenhum CT-e elegível com os filtros atuais.')).toBeVisible()
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
  await openInvoicesTab(page)
  await page.getByRole('button', { name: 'Abrir detalhe da fatura' }).click()

  const detail = invoiceDetailPanel(page)
  await expect(detail.getByText('17', { exact: true })).toBeVisible()
  await expect(detail.getByText('Transportes Sul Ltda')).toBeVisible()
  await expect(detail.getByText('R$ 350,50').first()).toBeVisible()
  await expect(detail.getByText('Emitida', { exact: true })).toBeVisible()
  await expect(detail.getByText('invoice_pdf')).toBeVisible()
  await detail.getByLabel('Motivo do cancelamento').fill('Ajuste operacional')
  await detail.getByRole('button', { name: 'Cancelar fatura' }).click()
  await expect.poll(api.cancellationRequests).toBe(1)
  await expect(page.getByText('Fatura cancelada com sucesso.')).toBeVisible()
  await expect(detail.getByText('Cancelada', { exact: true })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  expect(api.detailRequests()).toBeGreaterThan(0)
  expect(api.documentRequests()).toBeGreaterThan(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('operador baixa o PDF da fatura pelo painel e pela tabela no desktop', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'billing'))
  const api = await mockBillingWorkspaceApi({
    initialInvoiceStatus: 'issued',
    page,
    permissions: ['billing.read', 'billing.create'],
  })
  await loginAsLocalUser(page)

  await openInvoicesTab(page)
  await page.getByRole('button', { name: 'Abrir detalhe da fatura' }).click()

  const detail = invoiceDetailPanel(page)
  await expect(detail.getByText('invoice_pdf')).toBeVisible()

  const [panelDownload] = await Promise.all([
    page.waitForEvent('download'),
    detail.getByRole('button', { name: 'Baixar documento' }).click(),
  ])
  expect(panelDownload.suggestedFilename()).toBe(BILLING_DOCUMENT_FILE_NAME)
  const panelPath = await panelDownload.path()
  expect(readFileSync(panelPath).equals(BILLING_DOCUMENT_BYTES)).toBe(true)

  const [tableDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Gerar PDF' }).click(),
  ])
  expect(tableDownload.suggestedFilename()).toBe(BILLING_DOCUMENT_FILE_NAME)
  expect(api.documentGenerations()).toBe(1)

  // Os dois caminhos terminam na mesma URL assinada, buscada pelo navegador.
  expect(api.storageDownloads()).toEqual([
    BILLING_DOCUMENT_DOWNLOAD_URL,
    BILLING_DOCUMENT_DOWNLOAD_URL,
  ])
  await assertNoHorizontalOverflow(page)
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
    'Seu acesso atual não permite consultar este workspace.',
  )
  await expect(page.getByRole('button', { name: 'Gerar fatura' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar fatura' })).toHaveCount(0)
  await assertNoHorizontalOverflow(page)
  expect(api.createRequests()).toBe(0)
  expect(api.cancellationRequests()).toBe(0)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

async function openCteEmissionDialog(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Documentos importados' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Selecionar nota' }).first().check()
  await page
    .getByRole('button', { name: /Gerar CT-es/ })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('o diálogo de emissão é montado fora da árvore transformada da página', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  const api = await mockNfeWorkspaceApi({
    page,
    permissions: ['invoices.read', 'cte.manage'],
  })
  await loginAsLocalUser(page)
  await openCteEmissionDialog(page)

  const placement = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const overlay = dialog?.parentElement ?? null
    return {
      insidePageTransition: dialog?.closest('.application-page-transition') !== null,
      overlayIsBodyChild: overlay?.parentElement === document.body,
    }
  })

  expect(placement.insidePageTransition).toBe(false)
  expect(placement.overlayIsBodyChild).toBe(true)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('o diálogo de emissão recebe foco, trava o scroll do corpo e fecha no Escape', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  const api = await mockNfeWorkspaceApi({
    page,
    permissions: ['invoices.read', 'cte.manage'],
  })
  await loginAsLocalUser(page)
  await openCteEmissionDialog(page)

  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null))
    .toBe(true)
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden')).toBe(
    true,
  )

  // Foco preso: percorrer a ordem de tabulação inteira não escapa do diálogo.
  for (let step = 0; step < 25; step += 1) {
    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
    ).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'))
    .toBe(true)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

type DialogGeometry = Readonly<{
  bottom: number
  left: number
  right: number
  scrollY: number
  top: number
  viewportHeight: number
  viewportWidth: number
}>

async function measureDialogGeometry(page: Page): Promise<DialogGeometry | null> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog === null) return null
    const rect = dialog.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      scrollY: window.scrollY,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }
  })
}

function expectGeometryInsideViewport(geometry: DialogGeometry | null): void {
  expect(geometry).not.toBeNull()
  if (geometry === null) return
  expect(geometry.top).toBeGreaterThanOrEqual(0)
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth)
}

test('o retângulo do diálogo de emissão cabe na viewport de 1440x900', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  const api = await mockNfeWorkspaceApi({
    documentCount: 40,
    page,
    permissions: ['invoices.read', 'cte.manage'],
  })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { name: 'Documentos importados' })).toBeVisible()

  // A lista longa é o que expõe o bug: rolando, um overlay preso à árvore da página sai da vista.
  await page.getByRole('checkbox', { name: 'Selecionar nota' }).last().check()
  await page
    .getByRole('button', { name: /Gerar CT-es/ })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const scrolled = await measureDialogGeometry(page)
  expect(scrolled?.scrollY ?? 0).toBeGreaterThan(0)
  expectGeometryInsideViewport(scrolled)

  await page.evaluate(() => window.scrollTo(0, 0))
  const atTop = await measureDialogGeometry(page)
  expect(atTop?.scrollY).toBe(0)
  expectGeometryInsideViewport(atTop)

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('a nota bloqueada mostra o motivo, fica fora da seleção e é contada na barra', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  const api = await mockNfeWorkspaceApi({
    blockedDocumentCount: 1,
    documentCount: 3,
    page,
    permissions: ['invoices.read', 'cte.manage'],
  })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { name: 'Documentos importados' })).toBeVisible()

  await expect(page.getByText('Sem peso da carga')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Nota bloqueada para CT-e' })).toBeDisabled()

  await page.getByRole('checkbox', { name: 'Selecionar todas as notas' }).check()
  await expect(page.getByText('2 notas selecionadas')).toBeVisible()
  await expect(page.getByText('1 bloqueada fora da seleção')).toBeVisible()

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

/**
 * Spec 065 D4b: **fatura-se o que saiu.** O sinal da viagem aparece na listagem e leva à viagem em
 * um clique — e a nota continua selecionável, porque vínculo com viagem nunca foi bloqueio.
 */
test('a nota anuncia a viagem em que saiu e continua entrando no lote', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  const api = await mockNfeWorkspaceApi({
    blockedDocumentCount: 0,
    documentCount: 1,
    page,
    permissions: ['invoices.read', 'cte.manage'],
  })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { name: 'Documentos importados' })).toBeVisible()

  /**
   * ⚠️ O rótulo passou a carregar o estado da viagem: era `Saiu nesta viagem`, fixo, e virou
   * `Esta nota está em viagem — {estado}`. O mock manda `in_transit`, que é `Em trânsito`.
   */
  const tripLink = page.getByRole('link', { name: 'Esta nota está em viagem — Em trânsito' })
  await expect(tripLink).toBeVisible()
  await expect(tripLink).toHaveAttribute('href', '/trips/00000000-0000-4000-8000-000000000a11')
  await expect(page.getByRole('checkbox', { name: 'Nota bloqueada para CT-e' })).toHaveCount(0)

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('o diálogo mostra o perfil aplicado e leva aos perfis de emissão em um clique', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  const api = await mockNfeWorkspaceApi({
    page,
    permissions: ['invoices.read', 'cte.manage', 'settings.manage'],
  })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { name: 'Documentos importados' })).toBeVisible()

  await page.getByRole('checkbox', { name: 'Selecionar nota' }).first().check()
  await page
    .getByRole('button', { name: /Gerar CT-es/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const profileCell = dialog.locator('tbody tr').first().locator('td').nth(3)
  await expect(profileCell).toContainText('Perfil de emissao smoke')
  await expect(profileCell).toContainText('casou pelo CNPJ do remetente')

  await dialog.getByRole('button', { name: 'Ajustar perfis de emissão' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Perfis de emissão de CT-e' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/cte-profiles')

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('sem settings.manage o diálogo não oferece o caminho para os perfis', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  const api = await mockNfeWorkspaceApi({
    page,
    permissions: ['invoices.read', 'cte.manage'],
  })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { name: 'Documentos importados' })).toBeVisible()

  await page.getByRole('checkbox', { name: 'Selecionar nota' }).first().check()
  await page
    .getByRole('button', { name: /Gerar CT-es/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('tbody tr').first()).toContainText('Perfil de emissao smoke')
  await expect(dialog.getByRole('button', { name: 'Ajustar perfis de emissão' })).toHaveCount(0)

  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('viagem com nota sem CT-e bloqueia a emissão do MDF-e num modal, sem navegar', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  const api = await mockTripWorkspaceApi({
    mode: 'has-pending',
    page,
    permissions: ['fleet.read', 'fleet.manage', 'mdfe.read', 'mdfe.manage', 'trip.manage'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Viagens' })).toBeVisible()
  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()

  await page.getByRole('button', { name: 'Emitir MDF-e' }).click()
  const dialog = page.getByRole('dialog', { name: 'CT-e pendente' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Sem assinatura')).toBeVisible()

  expect(api.manifestCreations()).toBe(0)
  expect(new URL(page.url()).pathname).not.toBe('/mdfe-manifests')

  await dialog.locator('footer').getByRole('button', { name: 'Fechar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('viagem com todas as notas com CT-e autorizado emite o MDF-e sem exibir o modal', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  const api = await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'fleet.manage', 'mdfe.read', 'mdfe.manage', 'trip.manage'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Viagens' })).toBeVisible()
  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()

  await page.getByRole('button', { name: 'Emitir MDF-e' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Manifestos MDF-e' })).toBeVisible()

  // spec 027: a viagem viaja na query string para o manifesto nascer com `trip_id` preenchido
  const manifestUrl = new URL(page.url())
  expect(manifestUrl.pathname).toBe('/mdfe-manifests')
  expect(manifestUrl.searchParams.get('tripId')).toBe(TRIP_SMOKE_TRIP_ID)
  await expect(page.getByText('Emissão a partir de uma viagem')).toBeVisible()
  const creationPanel = page.getByRole('region', { name: 'Novo manifesto' })
  await expect(creationPanel.getByRole('button', { name: 'Veículo' })).toHaveCount(0)

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

/**
 * O convite ao roteiro aparece na viagem editável, e o painel só nasce depois do pedido — a
 * proposta é do worker, não do clique (ADR-0044 §7). Sem este teste, o painel podia estar montado
 * e nunca renderizar, e nada acusaria.
 */
test('a viagem editável oferece sugerir roteiro, e o painel só existe depois do pedido', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'fleet.manage', 'mdfe.read', 'mdfe.manage', 'trip.manage'],
  })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Sugerir roteiro' })).toBeVisible()
  // Nada de proposta antes de pedir: o painel não se antecipa ao humano
  await expect(page.getByRole('heading', { name: 'Roteiro sugerido' })).toHaveCount(0)

  await assertNoHorizontalOverflow(page)
})

/** Sem `trip.manage` o convite não aparece: pedir e decidir são a mesma permissão que reordena. */
test('sem trip.manage a viagem não oferece sugerir roteiro', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'mdfe.read'],
  })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Sugerir roteiro' })).toHaveCount(0)
})

/**
 * Spec 048: é o teste que os contratos não fazem. Eles provam a leitura contra bytes; este prova o
 * encanamento — o pdf.js carregado sob demanda no navegador, o worker servido da nossa origem sem
 * afrouxar a CSP, o hook montado e o valor chegando ao `input` que o operador vê.
 */
/**
 * O pacote de leitura aprendeu o CCMEI para a landing, e o painel consome o mesmo pacote. Sem um
 * ramo próprio, o documento de empresa caía no ramo de sucesso e a tela dizia "reconhecido" com a
 * lista de campos vazia — o pior tipo de mentira, porque parece que funcionou.
 */
test('o CCMEI solto na ficha do veículo é recusado com nome, não confundido com sucesso', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
  await mockFleetWorkspaceApi({ page, permissions: ['fleet.read', 'fleet.manage'] })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: 'Novo veículo' }).click()
  await expect(page.getByRole('heading', { name: 'Novo veículo' })).toBeVisible()

  await page.getByLabel('Preencher pelo documento').setInputFiles({
    buffer: Buffer.from(
      buildTextPdf([
        { size: 14, text: 'Certificado da Condição de', x: 60, y: 790 },
        { size: 14, text: 'Microempreendedor Individual', x: 60, y: 770 },
        ...buildLabelledColumns([{ label: 'CNPJ', value: '30.213.061/0001-06', x: 60, y: 700 }]),
      ]),
    ),
    mimeType: 'application/pdf',
    name: 'ccmei.pdf',
  })

  await expect(page.getByText('Este é um CCMEI', { exact: false })).toBeVisible()
  await expect(page.getByText('Reconhecido: CRLV-e')).toBeHidden()
  await expect(page.getByRole('textbox', { name: /^Placa/ })).toHaveValue('')
})

test('o operador solta o CRLV e a ficha do veículo chega preenchida e marcada', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
  const api = await mockFleetWorkspaceApi({
    page,
    permissions: ['fleet.read', 'fleet.manage'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Frota e motoristas' })).toBeVisible()
  await page.getByRole('button', { name: 'Novo veículo' }).click()
  await expect(page.getByRole('heading', { name: 'Novo veículo' })).toBeVisible()

  await page.getByLabel('Preencher pelo documento').setInputFiles({
    buffer: Buffer.from(buildCrlvPdf()),
    mimeType: 'application/pdf',
    name: 'crlv.pdf',
  })

  await expect(page.getByText('Reconhecido: CRLV-e')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Placa/ })).toHaveValue('GCQ8E47')
  await expect(page.getByRole('textbox', { name: /^Renavam/ })).toHaveValue('00123456789')
  // A marca de origem é do campo, e é o que separa o que o documento disse do que o operador digitou
  await expect(page.getByText('veio do documento').first()).toBeVisible()

  // Editar à mão apaga a marca daquele campo: a partir daí o dado é do operador
  await page.getByRole('textbox', { name: /^Placa/ }).fill('GCQ8E48')
  await expect(page.getByRole('textbox', { name: /^Placa/ })).toHaveValue('GCQ8E48')

  // O que o documento não diz continua em branco, e o motivo fica à vista
  await expect(page.getByText('Capacidade —', { exact: false })).toBeVisible()

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

/** Spec 048 P2: a ficha que já existe se abre, em vez de o cadastro novo morrer na unicidade. */
test('CRLV de veículo já cadastrado oferece abrir a ficha existente', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
  await mockFleetWorkspaceApi({
    page,
    permissions: ['fleet.read', 'fleet.manage'],
    registeredPlate: 'GCQ8E47',
  })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: 'Novo veículo' }).click()
  await page.getByLabel('Preencher pelo documento').setInputFiles({
    buffer: Buffer.from(buildCrlvPdf()),
    mimeType: 'application/pdf',
    name: 'crlv.pdf',
  })

  await expect(page.getByText('A placa GCQ8E47 já está cadastrada nesta frota.')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir a ficha existente' }).click()
  await expect(page.getByRole('heading', { name: 'Editar veículo' })).toBeVisible()

  await assertNoHorizontalOverflow(page)
})

/**
 * Spec 057: o smoke que os contratos não fazem. Eles provam a fila e a política contra dublê; este
 * prova o encanamento — a tela de entrada de quem é do campo, o toque virando requisição com a
 * chave de idempotência, e a fila anunciando o que ainda não subiu.
 */
test('o motorista abre o produto e cai na viagem dele, não na tela de NF-e', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  /**
   * ⚠️ **Sem posição concedida o toque leva oito segundos, e o teste desiste aos cinco.**
   * `readCurrentLocation` chama `getCurrentPosition` com `timeout: 8_000`; no navegador sem
   * permissão o retorno de erro só chega no fim dele, e a confirmação nem é enfileirada antes
   * disso. O `expect.poll` abaixo espera cinco segundos, e falhava com a tela dizendo "aguardando
   * envio" — sintoma que aponta para a fila e não para o relógio.
   *
   * Conceder a posição é o que o motorista de verdade faz na primeira vez que abre o app.
   */
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  const api = await mockDriverTripApi({ page })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/minha-viagem')
  // Escopado ao cabeçalho: o romaneio repete a placa, mas só no papel — na tela ela fica escondida
  await expect(page.locator('main > header').getByText('Veículo GCQ8E47')).toBeVisible()
  await expect(page.getByText('Praca da Se, 100').first()).toBeVisible()

  // Um toque, uma requisição, uma chave — é o que a idempotência do servidor casa no reenvio
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await expect.poll(() => api.reports().length).toBe(1)
  expect(api.reports()[0]?.path).toBe(`/me/trips/current/stops/${DRIVER_STOP_ID}/arrive`)
  expect(api.reports()[0]?.idempotencyKey).not.toBe('')

  await assertNoHorizontalOverflow(page)
})

/** A tela diz a verdade: sem sinal, o toque fica "aguardando envio" — nunca "enviado". */
test('sem sinal, a confirmação fica na fila e a tela não mente sobre isso', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  const api = await mockDriverTripApi({ isOffline: true, page })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await page.getByRole('button', { name: 'Cheguei' }).click()

  await expect(page.getByText('1 confirmação aguardando envio')).toBeVisible()
  expect(api.reports()).toEqual([])

  await assertNoHorizontalOverflow(page)
})

/**
 * Spec 065 D1 e D1b: entre a saída do caminhão e o MDF-e o motorista só tem isto na mão — e para a
 * entrega urbana, que não terá manifesto nenhum, isto é o que existe. O aviso de não-fiscal é
 * requisito, não enfeite: impresso, o romaneio volta a parecer documento.
 */
test('o motorista leva o romaneio, com a chave da nota e o aviso de que não é fiscal', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await mockDriverTripApi({ page })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Romaneio de carga' })).toBeVisible()
  await expect(page.getByText('Não é documento fiscal')).toBeVisible()

  // A chave por extenso é o que se consulta no portal e o que a portaria digita quando o leitor falha
  await expect(page.getByText(DRIVER_ACCESS_KEY)).toBeVisible()
  await expect(page.getByText('NF-e 900123/1')).toBeVisible()
  await expect(page.getByText('3 volumes', { exact: false })).toBeVisible()

  // E o código de barras, que é o que ela bipa
  await expect(
    page.getByRole('img', { name: /Código de barras da chave da NF-e 900123/ }),
  ).toBeVisible()

  await assertNoHorizontalOverflow(page)
})

/**
 * Spec 065 D4c: a dispensa é assinada. O que este smoke prova, e nenhum contrato prova, é o
 * encanamento inteiro — o botão do painel abre o diálogo do motivo, e o motivo digitado chega ao
 * corpo do `PUT`. Sem ele, o servidor recusaria e o operador veria um erro sem saber por quê.
 */
test('dispensar o MDF-e da viagem pede o motivo antes de mandar', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  const api = await mockTripWorkspaceApi({
    mode: 'has-pending',
    page,
    permissions: ['fleet.read', 'fleet.manage', 'mdfe.read', 'mdfe.manage', 'trip.manage'],
  })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()

  await page.getByRole('button', { name: 'Dispensar MDF-e' }).click()
  const dialog = page.getByRole('dialog', { name: 'Dispensar o MDF-e desta viagem' })
  await expect(dialog).toBeVisible()
  // O motivo é obrigatório: o botão de confirmar nasce desabilitado.
  await expect(dialog.getByRole('button', { name: 'Dispensar MDF-e' })).toBeDisabled()

  await dialog.getByLabel('Motivo da dispensa').fill('frota própria, carga retorna hoje')
  await dialog.getByRole('button', { name: 'Dispensar MDF-e' }).click()

  await expect
    .poll(() => api.mdfeRequirements())
    .toEqual([{ reason: 'frota própria, carga retorna hoje', requiresMdfe: false }])

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

test('o operador revisa o anexo vendo onde ele discorda da ficha, e a recusa exige motivo', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
  const api = await mockFleetWorkspaceApi({
    documents: [PENDING_DOCUMENT],
    page,
    permissions: ['fleet.read', 'fleet.manage'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Frota e motoristas' })).toBeVisible()
  await page.getByRole('tab', { name: 'Anexos' }).click()

  // o que o documento diz e o que a ficha diz, lado a lado — é o que dispensa abrir o arquivo
  await expect(page.getByText('1 campo diverge')).toBeVisible()
  await expect(page.getByText('99999999999')).toBeVisible()
  await expect(page.getByText('12345678901').first()).toBeVisible()

  await page.getByRole('button', { name: 'Recusar' }).click()
  const confirmReject = page.getByRole('button', { name: 'Confirmar recusa' })
  await expect(confirmReject).toBeDisabled()

  await page.getByLabel(/Motivo da recusa/).fill('foto ilegível')
  await expect(confirmReject).toBeEnabled()
  await confirmReject.click()

  await expect
    .poll(() => api.reviews())
    .toEqual([{ decision: 'rejected', rejectionReason: 'foto ilegível' }])

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

/**
 * Spec 066 T007 — **aprovar muda a tela**, não só manda a requisição. O contrato do componente prova
 * que o clique chama `onReview`; o que só o navegador prova é o resto do caminho: a mutação
 * invalida a consulta, o refetch traz o documento já decidido, e a linha para de oferecer decisão.
 * Sem a segunda metade, uma invalidação esquecida deixaria o operador aprovando o mesmo documento
 * duas vezes sem nada na tela contradizê-lo.
 */
test('aprovar o anexo muda o estado na tela, e a linha para de oferecer decisão', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
  const api = await mockFleetWorkspaceApi({
    documents: [PENDING_DOCUMENT],
    page,
    permissions: ['fleet.read', 'fleet.manage'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Frota e motoristas' })).toBeVisible()
  await page.getByRole('tab', { name: 'Anexos' }).click()
  await expect(page.getByText('Pendente')).toBeVisible()

  await page.getByRole('button', { name: 'Aprovar' }).click()

  await expect(page.getByText('Aprovado')).toBeVisible()
  await expect(page.getByText('Pendente')).toBeHidden()
  // A decisão sai da linha junto com o estado: documento já decidido não se aprova de novo.
  await expect(page.getByRole('button', { name: 'Aprovar' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Recusar' })).toBeHidden()

  await expect.poll(() => api.reviews()).toEqual([{ decision: 'approved', rejectionReason: '' }])

  await assertNoHorizontalOverflow(page)
  expect(api.failures()).toEqual([])
  await auditAuthenticationStorage(page)
})

/**
 * Spec 058 P2 — **a tela da distribuição, no navegador.** Os contratos de unidade provam o
 * agrupamento e a contagem; o que só o browser prova é o caminho do operador: selecionar a nota,
 * abrir o diálogo, escolher a frota, esperar o poll virar `ready`, ver uma coluna por veículo e o
 * botão dizendo quantas viagens serão criadas.
 */
test('a distribuição multi-veículo vai da seleção de notas às viagens criadas', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'nfe'))
  await mockNfeWorkspaceApi({
    documentCount: 2,
    page,
    permissions: ['invoices.read', 'fleet.read', 'trip.manage'],
  })
  const routing = await mockMultiVehicleApi(page)
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Documentos importados' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Selecionar nota' }).first().check()
  await page.getByRole('button', { name: 'Sugerir viagens' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('1 nota selecionada')).toBeVisible()

  /** O implemento está na frota mockada e **não** pode ser oferecido: só quem traciona puxa carga. */
  await dialog.getByRole('button', { name: 'Veículos disponíveis' }).click()
  await expect(page.getByRole('option', { name: /ABC1D23/u })).toBeVisible()
  await expect(page.getByRole('option', { name: /REB0C11/u })).toHaveCount(0)
  await page.getByRole('option', { name: /ABC1D23/u }).click()
  await page.getByRole('option', { name: /XYZ9A88/u }).click()
  /**
   * O painel do multi-select é portal e cobre a linha de ação: fechá-lo pelo próprio gatilho é o
   * gesto do operador. `Escape` só fecha com o foco na busca — clicar numa opção tira o foco de lá.
   */
  await dialog.getByRole('button', { name: 'Veículos disponíveis' }).click()

  /**
   * Spec 081: o par. `ABC1D23` tem dois motoristas vinculados, então a linha dele fica **vazia** —
   * escolher um deles seria adivinhar qual. `XYZ9A88` tem um só, e vem preenchido sem clique.
   */
  await expect(dialog.getByRole('button', { name: /Motorista do veículo ABC1D23/u })).toContainText(
    'Sem motorista',
  )
  await expect(dialog.getByRole('button', { name: /Motorista do veículo XYZ9A88/u })).toContainText(
    'Motorista da Casa',
  )

  /** O agregado entra pelo outro lado: escolher a pessoa põe o caminhão dela na distribuição. */
  await dialog.getByRole('button', { name: 'Motoristas e agregados' }).click()
  await page.getByRole('option', { name: 'Agregado Sintetico' }).click()
  await dialog.getByRole('button', { name: 'Motoristas e agregados' }).click()
  await expect(dialog.getByRole('button', { name: /Motorista do veículo ABC1D23/u })).toContainText(
    'Agregado Sintetico',
  )

  await dialog.getByRole('button', { name: 'Distribuir' }).click()

  /** O poll: a primeira leitura devolve `queued`, e é esse estado que o operador mais vê. */
  await expect(dialog.getByText('Na fila')).toBeVisible()

  /** Duas colunas de veículo, e a parada sem veículo num grupo próprio que **não some**. */
  await expect(
    dialog.getByRole('heading', { name: 'Veículo ABC1D23 · Marca Sintetica Modelo Sintetico' }),
  ).toBeVisible()
  await expect(dialog.getByRole('heading', { name: /Veículo XYZ9A88/u })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Sem veículo — decida à mão' })).toBeVisible()
  await expect(dialog.getByText('Sítio sem número')).toBeVisible()

  /**
   * O botão **diz quantas viagens** o aceite cria — duas, não três: a parada sem veículo não vira
   * viagem. Aceitar cria viagem de verdade, e um botão que não avisa transforma isso em surpresa.
   */
  const accept = dialog.getByRole('button', { name: 'Aceitar e criar 2 viagens' })
  await expect(accept).toBeVisible()
  await accept.click()

  await expect(dialog.getByText('1 viagem criada, em planejamento.')).toBeVisible()
  expect(routing.acceptRequests()).toBe(1)

  /**
   * A ordem da frota enviada é a do próprio componente (a da lista de opções), não a dos cliques —
   * e é ela que vira `position` no banco, de onde sai o determinismo da distribuição. O que este
   * teste cobra é o **conjunto**: a ordem estável é contrato do multi-select, não desta tela.
   */
  const [body] = routing.createdBodies()
  const pairs = body?.vehicles as readonly { driverId?: string; vehicleId: string }[]
  expect(pairs.map((pair) => pair.vehicleId).toSorted()).toEqual(
    [FIRST_VEHICLE_ID, SECOND_VEHICLE_ID].toSorted(),
  )
  /** O par chega inteiro à API: é ele que faz a viagem existir para quem dirige (ADR-0055). */
  expect(pairs.find((pair) => pair.vehicleId === FIRST_VEHICLE_ID)?.driverId).toBe(
    AGGREGATE_DRIVER_ID,
  )
  expect(pairs.find((pair) => pair.vehicleId === SECOND_VEHICLE_ID)?.driverId).toBe(STAFF_DRIVER_ID)
  expect((body?.nfeDocumentIds as readonly string[]).length).toBe(1)

  /** O atalho leva à viagem criada: sem ele o operador procuraria numa lista qual nasceu do clique. */
  await dialog.getByRole('button', { name: 'Abrir viagem' }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/trips/${CREATED_TRIP_ID}`)
})
