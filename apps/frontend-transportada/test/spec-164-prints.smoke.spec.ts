/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T28 (CA13): os prints da revisão de design (`web.md` §15) — o painel da tratativa em
 * cada estado que muda a tela, o painel de acerto com itens, "Ressarcimentos" com filtro e
 * seleção, e a nota marcada na listagem com o ícone (RF36). Fora do smoke da CI: o
 * `playwright.config.ts` restringe `testMatch` a uma lista explícita que não inclui este arquivo
 * — mesmo arranjo do `spec-159-prints.smoke.spec.ts` — então rodar aqui nunca faz o gate da CI
 * depender de servidor de pré-visualização para gerar imagem.
 *
 * ⚠️ **O portal do contratante decidindo (`apps/frontend-client`) fica de fora.** Aquela app não
 * tem `playwright.config.ts` nem infraestrutura de smoke — só `bun test` de unidade
 * (`test/*.contract.test.ts`, sem DOM/browser). Criar essa infraestrutura é escopo maior que um
 * print de revisão de design desta task; o estado "decidindo" fica documentado no `evidence.md`
 * como não fotografado, em vez de forçado.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  mockOccurrencePrintsApi,
  mockReimbursementsApi,
  OCCURRENCE_AWAITING_CONTRACTOR_ID,
  OCCURRENCE_CANCELLED_ID,
  OCCURRENCE_DECIDED_ID,
  OCCURRENCE_RETURNED_TO_WAREHOUSE_ID,
} from './spec-164-prints-smoke.helper'
import { TRIP_ID } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/164-destino-da-nota-na-ocorrencia/prints',
)

const PHONE = { height: 844, width: 390 } as const
const DESKTOP = { height: 900, width: 1440 } as const

const OCCURRENCES_PERMISSIONS = ['fleet.read', 'occurrences.resolve'] as const
const REIMBURSEMENTS_PERMISSIONS = ['fleet.read', 'trip.financials'] as const

function printPath(name: string): string {
  return resolve(PRINTS_DIRECTORY, `${name}.png`)
}

async function navigateTo(page: Page, path: string): Promise<void> {
  /**
   * ⚠️ Nunca `page.goto` para rota interna — a SPA não tem router de servidor (CLAUDE.md do app);
   * navegação é sempre `pushState` + `popstate`, como já fazem `trip-timeline.smoke.spec.ts` e
   * `field-delivery.smoke.spec.ts`.
   */
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/** As linhas nascem na ordem do mock (`OCCURRENCE_FEED_ITEMS`) — sem coluna visível de id. */
const OCCURRENCE_FEED_ORDER = [
  OCCURRENCE_AWAITING_CONTRACTOR_ID,
  OCCURRENCE_DECIDED_ID,
  OCCURRENCE_RETURNED_TO_WAREHOUSE_ID,
  OCCURRENCE_CANCELLED_ID,
]

async function openOccurrencesWorkspace(
  input: Readonly<{ occurrenceId: string; page: Page }>,
): Promise<void> {
  await mockOccurrencePrintsApi({ page: input.page, permissions: OCCURRENCES_PERMISSIONS })
  await loginAsLocalUser(input.page)
  await navigateTo(input.page, '/ocorrencias')
  await expect(input.page.getByRole('heading', { level: 1, name: 'Ocorrências' })).toBeVisible()
  const rowIndex = OCCURRENCE_FEED_ORDER.indexOf(input.occurrenceId)
  expect(rowIndex).toBeGreaterThanOrEqual(0)
  await input.page.getByRole('button', { name: 'Detalhar' }).nth(rowIndex).click()
}

test('print: painel da tratativa aguardando o contratante', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await openOccurrencesWorkspace({ occurrenceId: OCCURRENCE_AWAITING_CONTRACTOR_ID, page })
  const panel = page.getByText('Aguardando a decisão do contratante no portal.')
  await expect(panel).toBeVisible()
  await page
    .locator('tr:has-text("Passo atual")')
    .first()
    .screenshot({ path: printPath('painel-tratativa-aguardando-contratante') })
})

test('print: painel da tratativa decidida, com o acerto e os itens', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await openOccurrencesWorkspace({ occurrenceId: OCCURRENCE_DECIDED_ID, page })
  await expect(page.getByText('O contratante decidiu pagar os produtos')).toBeVisible()
  await expect(page.getByText('Acerto dos produtos')).toBeVisible()
  await expect(page.getByText('AZ-30')).toBeVisible()
  await page
    .locator('tr:has-text("Passo atual")')
    .first()
    .screenshot({ path: printPath('painel-tratativa-decidida-com-acerto') })
})

test('print: painel da tratativa retornada ao barracão', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await openOccurrencesWorkspace({ occurrenceId: OCCURRENCE_RETURNED_TO_WAREHOUSE_ID, page })
  /**
   * `getByText` sem escopo bate duas vezes: o rótulo do filtro "Tratativa" também lista
   * "Retornada ao barracão" como opção. A asserção e o print ficam presos ao painel expandido
   * (a `tr` com "Passo atual"), que é a única leitura sem ambiguidade.
   */
  const detailRow = page.locator('tr:has-text("Passo atual")').first()
  await expect(detailRow.getByText('Retornada ao barracão')).toBeVisible()
  await detailRow.screenshot({ path: printPath('painel-tratativa-retornada-ao-barracao') })
})

test('print: painel da tratativa cancelada', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await openOccurrencesWorkspace({ occurrenceId: OCCURRENCE_CANCELLED_ID, page })
  const detailRow = page.locator('tr:has-text("Passo atual")').first()
  await expect(detailRow.getByText('Cancelada')).toBeVisible()
  await detailRow.screenshot({ path: printPath('painel-tratativa-cancelada') })
})

for (const viewport of ['desktop', 'mobile'] as const) {
  test(`print: Ressarcimentos, com filtro e seleção (${viewport})`, async ({ page }) => {
    await page.setViewportSize(viewport === 'desktop' ? DESKTOP : PHONE)
    await mockReimbursementsApi({ page, permissions: REIMBURSEMENTS_PERMISSIONS })
    await loginAsLocalUser(page)
    await navigateTo(page, '/ressarcimentos')
    await expect(page.getByRole('heading', { level: 1, name: 'Ressarcimentos' })).toBeVisible()
    await expect(page.getByText('4521')).toBeVisible()

    /**
     * ⚠️ Print de filtro com os filtros **vazios** não prova nada (revisão da T30). Os três
     * filtros que mudam a tela são preenchidos de verdade antes da foto: o contratante, o
     * multi-select de tipo (que é onde nasce o chip) e a situação.
     */
    await page.getByRole('button', { name: 'Contratante' }).click()
    await page.getByRole('option', { name: 'Mercado Bom Preço' }).click()

    await page.getByRole('button', { name: 'Tipo de cobrança' }).click()
    await page.getByRole('option', { name: 'Produtos devolvidos' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Remover tipo de cobrança' })).toBeVisible()

    await page.getByRole('button', { name: 'Situação' }).click()
    await page.getByRole('option', { name: 'Registrada' }).click()

    await expect(page.getByText('4521')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Selecionar a cobrança' }).first().check()
    await expect(page.getByText(/Total selecionado/u)).toBeVisible()

    await page.screenshot({
      fullPage: true,
      path: printPath(`ressarcimentos-filtro-selecao-${viewport}`),
    })
  })
}

/**
 * ⚠️ **O mapa não entra nestes prints, e é decisão, não esquecimento.** O fundo vetorial é o
 * `/map-tiles/area.pmtiles`, que não existe no build de pré-visualização — sem ele o MapLibre não
 * monta e o painel do roteiro sai como retângulo vazio. Um print assim foi exatamente o que a
 * revisão da T30 reprovou: o nome prometia mapa com pino e a imagem não tinha nenhum dos dois.
 * O que **é** fotografável aqui é a listagem de notas com a marca (RF36), e é o que sai — em
 * recorte da lista e na página inteira.
 */
for (const viewport of ['desktop', 'mobile'] as const) {
  test(`print: nota marcada na listagem da viagem (${viewport})`, async ({ page }) => {
    await page.setViewportSize(viewport === 'desktop' ? DESKTOP : PHONE)
    await mockOccurrencePrintsApi({ page, permissions: OCCURRENCES_PERMISSIONS })
    await loginAsLocalUser(page)
    await navigateTo(page, `/trips/${TRIP_ID}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Ocorrência em tratativa')).toBeVisible()

    await page.screenshot({
      fullPage: true,
      path: printPath(`nota-marcada-listagem-${viewport}`),
    })

    await page
      .locator('section', { hasText: 'Cargas da viagem' })
      .last()
      .screenshot({ path: printPath(`nota-marcada-listagem-recorte-${viewport}`) })
  })
}
