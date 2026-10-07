/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7b (`web.md` §15): os prints da revisão de design da origem da prévia — a lista com uma prévia por
 * e-mail e uma por envio no painel, e o detalhe de uma prévia por e-mail —, em 375, 768 e 1280 px, nos dois
 * temas. Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-237-previa-origem-prints.smoke.spec.ts` e
 * grava os PNGs em `specs/237-.../prints`. Dado sintético, API inteira dublada: nada aqui lê um banco.
 *
 * A revisão é por estilo calculado: o selo de origem contra o selo de situação vizinho (mesma classe), o
 * contraste nos dois temas, o alvo de toque a 375 px e a geometria real (selo dentro da célula, nada cortado).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { expectNoClipping } from './cargo-clipping-smoke.helper'
import { buildPreviewDetail, buildPreviewSummary } from './fixtures/cargoPreview.fixture'
import { ALFA_ID, BETA_ID } from './fixtures/cargoReceiving.fixture'
import {
  fulfillJson,
  measureContrast,
  MINIMUM_CONTRAST,
  navigate,
  readCellOverlaps,
  readMetrics,
  readOverflow,
  readTouchTargets,
} from './spec-237-prints-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_237_REVIEW_OUTPUT
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
const EMAIL_ID = '00000000-0000-4000-8000-0000002374e1'
const UPLOAD_ID = '00000000-0000-4000-8000-0000002374e2'

const CONTRACTORS = [
  { displayName: 'Alfa Indústria Fictícia', id: ALFA_ID, taxId: '11222333000181' },
  { displayName: 'Beta Comércio Fictício', id: BETA_ID, taxId: '22333444000162' },
].map((contractor) => ({
  ...contractor,
  closingPeriod: 'monthly',
  notes: '',
  reportEmail: '',
  status: 'active',
}))

const EMAIL_PREVIEW = buildPreviewSummary({
  fileName: 'FR-06-10.xlsx',
  id: EMAIL_ID,
  receivedAt: '2026-10-06T08:12:00.000Z',
  rowCount: 7,
  source: 'email',
})
const UPLOAD_PREVIEW = buildPreviewSummary({
  contractorId: BETA_ID,
  contractorName: 'Beta Comércio Fictício',
  fileName: 'BETA-05-10.xlsx',
  id: UPLOAD_ID,
  plannedDate: '2026-10-05',
  receivedAt: '2026-10-03T14:06:00.000Z',
  rowCount: 191,
  source: 'upload',
})

async function mockApi(page: Page): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'trip.manage', 'invoices.read', 'settings.manage'],
  })
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: CONTRACTORS, page: { nextCursor: null } }),
  )
  await page.route(/\/contractor-receiving-profiles(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      data: CONTRACTORS.map((contractor) => ({
        contractorId: contractor.id,
        isEnabled: true,
        previewEnabled: true,
      })),
      nextCursor: null,
    }),
  )
  await page.route(/\/cargo-previews\/[0-9a-f-]{36}(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: buildPreviewDetail({ ...EMAIL_PREVIEW }) }),
  )
  await page.route(/\/cargo-previews(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [EMAIL_PREVIEW, UPLOAD_PREVIEW], nextCursor: null }),
  )
}

async function openScreen(page: Page, path: string): Promise<void> {
  await loginAsLocalUser(page)
  await navigate(page, path)
  await expect(page.locator('main h1')).toBeVisible()
}

type Screen = Readonly<{ name: string; open: (page: Page) => Promise<void> }>

const SCREENS: readonly Screen[] = [
  {
    name: 'previa-origem-email-lista',
    open: async (page) => {
      await openScreen(page, '/recebimento/previas')
      await expect(page.locator('tbody tr')).toHaveCount(2)
    },
  },
  {
    name: 'previa-origem-email-detalhe',
    open: async (page) => {
      await openScreen(page, `/recebimento/previas/${EMAIL_ID}`)
      await expect(page.locator('[data-preview-source="email"]')).toBeVisible()
    },
  },
]

function printPath(name: string, width: number, theme: string): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${String(width)}-${theme}.png`)
}

function writeReview(suffix: string, value: unknown): void {
  if (REVIEW_OUTPUT === undefined) return
  mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
  writeFileSync(`${REVIEW_OUTPUT}.${suffix}.json`, JSON.stringify(value, null, 2))
}

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'selo de origem', selector: '[data-preview-source]' },
  { name: 'selo de situação', selector: '[data-tone="ready"]' },
  { name: 'célula da tabela', selector: 'tbody td' },
  { name: 'dados do cabeçalho', selector: '[class*="_facts_"] li' },
]

/** O selo de origem fica inteiro dentro da célula (ou do item) que o contém: nada passa da borda. */
async function readBadgeOverflow(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-preview-source]')].flatMap((badge) => {
      const container = badge.closest('td, li')
      if (container === null) return ['selo fora de célula ou item']
      const box = badge.getBoundingClientRect()
      const limit = container.getBoundingClientRect().right
      return box.right > limit + 1
        ? [`selo termina em ${Math.round(box.right)} (limite ${Math.round(limit)})`]
        : []
    }),
  )
}

/** Na tabela empilhada o selo fica sob o nome do arquivo, não sob o rótulo da coluna. */
async function readBadgeMisalignment(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const names = [...document.querySelectorAll('tbody [data-file-name]')]
    if (names.length === 0) return ['nenhum nome de arquivo na tabela']
    return names.flatMap((name) => {
      const badge = name.parentElement?.querySelector('[data-preview-source]')
      if (badge === null || badge === undefined) return ['linha sem selo de origem']
      const offset = badge.getBoundingClientRect().left - name.getBoundingClientRect().left
      return Math.abs(offset) > 1
        ? [`selo deslocado ${Math.round(offset)}px do nome do arquivo`]
        : []
    })
  })
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const screen of SCREENS) {
      test(`prints ${screen.name} — ${String(width)} px ${theme}`, async ({ page }) => {
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.setViewportSize({ height: 900, width })
        await page.emulateMedia({ colorScheme: theme })
        await mockApi(page)
        await screen.open(page)

        expect(await readOverflow(page)).toBeLessThanOrEqual(0)
        expect(await readBadgeOverflow(page)).toEqual([])
        if (screen.name === 'previa-origem-email-lista')
          expect(await readBadgeMisalignment(page)).toEqual([])
        if (width === 375) await expectNoClipping(page)
        expect(await readCellOverlaps(page)).toEqual([])
        await page.locator('main').screenshot({ path: printPath(screen.name, width, theme) })

        const contrast = await measureContrast(page, CONTRAST_TARGETS)
        writeReview(`contrast-${screen.name}-${String(width)}-${theme}`, contrast)
        for (const sample of contrast)
          expect(sample.ratio, sample.name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)

        if (width === 375) {
          const touch = await readTouchTargets(page, ['main tbody button', 'main nav button'])
          writeReview(`touch-${screen.name}-${theme}`, touch)
          expect(touch).toEqual([])
        }
      })
    }
  }
}

test('revisão de design — o selo de origem contra o selo de situação vizinho (375, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page)
  await SCREENS[0]?.open(page)
  const origin = await readMetrics(page.locator('[data-preview-source="email"]'))
  const status = await readMetrics(page.locator('tbody [data-tone="ready"]'))
  writeReview('neighbor-badges', { origin, status })
  expect(origin.height).toBe(status.height)
  expect(origin.fontSize).toBe(status.fontSize)
  expect(origin.fontFamily).toBe(status.fontFamily)
  expect(origin.textTransform).toBe(status.textTransform)
  expect(origin.borderWidth).toBe(status.borderWidth)
})
