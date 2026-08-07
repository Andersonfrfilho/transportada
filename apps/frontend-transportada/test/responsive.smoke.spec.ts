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
import { mockFreightWorkspaceApi } from './freight-smoke.helper'
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
  await expect(page.getByText('100% — 1 de 1 lote(s)')).toBeVisible()
  await expect(page.getByText('1 na fila · 0 com erro')).toBeVisible()
  // Enfileirar não é transmitir: a barra da SEFAZ só fecha quando a resposta chega.
  const awaiting = page.getByRole('progressbar', { name: 'Progresso da transmissão para a SEFAZ' })
  await expect(awaiting).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByText('0% — 0 de 1 lote(s) com resposta da SEFAZ')).toBeVisible()
  await expect(
    page.getByText('1 lote(s) ainda transmitindo — a tela atualiza sozinha.'),
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
    permissions: ['fleet.read', 'fleet.manage', 'mdfe.read', 'mdfe.manage'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Viagens' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver' }).click()
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
    permissions: ['fleet.read', 'fleet.manage', 'mdfe.read', 'mdfe.manage'],
  })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Viagens' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver' }).click()
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
