/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.4 (`web.md` §15): os prints da revisão de design da aba "Contratantes" — a lista, a ficha
 * com o perfil preenchido, a ficha com a prévia ligada (mapa de colunas) e a recusa do servidor com os
 * atalhos —, em 375, 768 e 1280 px, nos dois temas. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-237-prints.smoke.spec.ts` e grava os PNGs ao lado da spec.
 *
 * Todo dado é sintético (nomes e CNPJs inventados) e a API inteira é dublada: nada aqui lê um banco.
 * A revisão de design compara o campo novo com o do vizinho `DeliveryClientForm` por estilo calculado.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_237_REVIEW_OUTPUT
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
const VIEWPORT_HEIGHT = 900
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

type SyntheticContractor = {
  closingPeriod: 'fortnightly' | 'monthly'
  displayName: string
  id: string
  notes: string
  reportEmail: string
  status: 'active' | 'inactive'
  taxId: string
}

function contractor(index: number, overrides: Partial<SyntheticContractor>): SyntheticContractor {
  return {
    closingPeriod: 'monthly',
    displayName: `Contratante Sintético ${String(index)}`,
    id: `00000000-0000-4000-8000-0000002371${String(index).padStart(2, '0')}`,
    notes: '',
    reportEmail: '',
    status: 'active',
    taxId: `${String(10 + index)}222333000${String(100 + index)}`,
    ...overrides,
  }
}

const CONTRACTORS: readonly SyntheticContractor[] = [
  contractor(1, {
    displayName: 'Alfa Indústria Fictícia',
    notes: 'Entrega só no período da manhã.',
    reportEmail: 'relatorio@alfa.example.test',
  }),
  contractor(2, { closingPeriod: 'fortnightly', displayName: 'Beta Comércio Fictício' }),
  contractor(3, { displayName: 'Gama Distribuidora Fictícia' }),
  contractor(4, { displayName: 'Delta Atacado Fictício', status: 'inactive' }),
  contractor(5, { displayName: 'Épsilon Logística Fictícia' }),
  contractor(6, { displayName: 'Zeta Alimentos Fictícios', status: 'inactive' }),
]
const [ALFA, BETA, GAMA, , EPSILON] = CONTRACTORS as readonly [
  SyntheticContractor,
  SyntheticContractor,
  SyntheticContractor,
  SyntheticContractor,
  SyntheticContractor,
  SyntheticContractor,
]

function profileOf(owner: SyntheticContractor, overrides: Record<string, unknown>) {
  return {
    arrivalReferencePattern: null,
    contractorId: owner.id,
    deliveryDeadlineBusinessDays: 3,
    isEnabled: true,
    matchWindowDays: 15,
    previewColumnMap: null,
    previewEnabled: false,
    previewSheetName: null,
    requiresDamageCheck: false,
    separationWindowHours: 24,
    updatedAt: '2026-10-03T12:00:00.000Z',
    weightTolerancePercent: 0,
    ...overrides,
  }
}

const PROFILES: Readonly<Record<string, unknown>> = {
  [ALFA.id]: profileOf(ALFA, {
    arrivalReferencePattern: 'Carga\\s*(\\d+)',
    previewColumnMap: {
      city: 'Coluna Cidade',
      contractorReference: 'Coluna Pedido',
      postalCode: 'Coluna CEP',
      recipientCode: 'Coluna Código',
      recipientName: 'Coluna Destinatário',
      routeName: 'Coluna Roteiro',
      routingDate: 'Coluna Data',
      value: 'Coluna Valor',
      weightKg: 'Coluna Peso',
    },
    previewEnabled: true,
    previewSheetName: 'Aba Sintética',
    requiresDamageCheck: true,
    weightTolerancePercent: 1.5,
  }),
  [BETA.id]: profileOf(BETA, {
    deliveryDeadlineBusinessDays: 5,
    isEnabled: false,
    separationWindowHours: 48,
  }),
  [EPSILON.id]: profileOf(EPSILON, { separationWindowHours: null }),
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS_HEADERS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

const REFUSAL = {
  error: {
    code: 'INVALID_REQUEST',
    details: [
      { field: 'matchWindowDays', message: 'Too small' },
      { field: 'separationWindowHours', message: 'Too big' },
      { field: 'previewColumnMap.value', message: 'Column is already mapped' },
    ],
    message: 'Invalid request',
  },
}

async function mockApi(page: Page, options: Readonly<{ refuseSave: boolean }>): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['settings.manage', 'fleet.read', 'fleet.manage', 'invoices.read'],
  })
  await page.route(/\/delivery-clients(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [], page: { nextCursor: null } }),
  )
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: CONTRACTORS, page: { nextCursor: null } }),
  )
  await page.route(/\/contractors\/[^/?]+$/, (route) => {
    const id = route.request().url().split('/').pop() ?? ''
    return fulfillJson(route, { data: CONTRACTORS.find((item) => item.id === id) ?? ALFA })
  })
  await page.route(/\/contractors\/[^/]+\/receiving-profile$/, (route) => {
    const request = route.request()
    const id = request.url().split('/').at(-2) ?? ''
    if (request.method() === 'PUT') {
      if (options.refuseSave) return fulfillJson(route, REFUSAL, 400)
      return fulfillJson(route, { data: PROFILES[id] ?? profileOf(GAMA, {}) })
    }
    return fulfillJson(route, { data: PROFILES[id] ?? null })
  })
}

async function openContractorsTab(page: Page): Promise<void> {
  await loginAsLocalUser(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/clientes?tab=contractors')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('region', { name: 'Lista de contratantes' })).toBeVisible()
  await expect(page.getByText('Lendo o perfil')).toHaveCount(0)
}

type ContrastSample = Readonly<{ name: string; ratio: number }>

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'ajuda do campo', selector: 'section [class*="_hint_"]' },
  { name: 'rótulo do campo', selector: 'section label' },
  { name: 'legenda do grupo', selector: 'section legend' },
  { name: 'aviso de recusa', selector: '[data-refusal-summary]' },
  { name: 'erro do campo', selector: 'section p[role="alert"]' },
  { name: 'selo ativo', selector: '[class*="_badgeOn_"]' },
  { name: 'selo desligado', selector: '[class*="_badgeOff_"]' },
  {
    name: 'selo sem perfil',
    selector: '[class*="_badge_"]:not([class*="_badgeOn_"]):not([class*="_badgeOff_"])',
  },
  { name: 'célula da tabela', selector: 'tbody td' },
  { name: 'indicador de ordenação', selector: '[class*="_sortIndicator_"]' },
]

/** Razão de contraste WCAG entre a cor do texto e o fundo opaco efetivo (compõe os fundos translúcidos). */
async function measureContrast(page: Page): Promise<readonly ContrastSample[]> {
  return page.evaluate((targets) => {
    type Rgba = [number, number, number, number]
    const parse = (css: string): Rgba => {
      const numbers = css.match(/-?\d*\.?\d+/gu)?.map(Number) ?? [0, 0, 0]
      if (css.startsWith('color(srgb')) {
        return [numbers[0]! * 255, numbers[1]! * 255, numbers[2]! * 255, numbers[3] ?? 1]
      }
      return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 1]
    }
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const alpha = top[3] + bottom[3] * (1 - top[3])
      const mix = (index: 0 | 1 | 2) =>
        (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / (alpha === 0 ? 1 : alpha)
      return [mix(0), mix(1), mix(2), alpha]
    }
    const luminance = (color: Rgba): number => {
      const channel = (value: number) => {
        const unit = value / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])
    }
    const effectiveBackground = (element: Element): Rgba => {
      let color: Rgba = [0, 0, 0, 0]
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        color = over(color, parse(getComputedStyle(node).backgroundColor))
        if (color[3] >= 0.999) break
      }
      return over(color, [255, 255, 255, 1])
    }
    return targets.flatMap((target) => {
      const element = document.querySelector(target.selector)
      if (element === null) return []
      const foreground = parse(getComputedStyle(element).color)
      const background = effectiveBackground(element)
      const text = over(foreground, background)
      const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a) as [
        number,
        number,
      ]
      return [
        { name: target.name, ratio: Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100 },
      ]
    })
  }, CONTRAST_TARGETS)
}

function printPath(name: string, width: number, theme: string): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${String(width)}-${theme}.png`)
}

async function openFicha(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: `Abrir a ficha de ${name}` }).click()
  const ficha = page.locator('section', {
    has: page.getByRole('heading', { level: 3, name }),
  })
  await expect(
    ficha.getByRole('heading', { level: 4, name: 'Perfil de recebimento' }),
  ).toBeVisible()
  await expect(ficha.getByText('Carregando o perfil de recebimento')).toHaveCount(0)
  return ficha
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`prints da aba Contratantes — ${String(width)} px ${theme}`, async ({ page }) => {
      mkdirSync(PRINTS_DIRECTORY, { recursive: true })
      await page.setViewportSize({ height: VIEWPORT_HEIGHT, width })
      await page.emulateMedia({ colorScheme: theme })
      await mockApi(page, { refuseSave: true })
      await openContractorsTab(page)

      await expect(page.getByText('Recebimento ativo').first()).toBeVisible()
      await expect(page.getByText('Sem perfil').first()).toBeVisible()
      await expectNoHorizontalScroll(page)
      await page.locator('main').screenshot({ path: printPath('contratantes-lista', width, theme) })

      let ficha = await openFicha(page, BETA.displayName)
      await expect(ficha.getByLabel('Janela de separação (horas)')).toHaveValue('48')
      await expectNoHorizontalScroll(page)
      await ficha.screenshot({ path: printPath('contratante-ficha', width, theme) })

      ficha = await openFicha(page, ALFA.displayName)
      await expect(ficha.getByLabel('Roteiro', { exact: true })).toHaveValue('Coluna Roteiro')
      await expectNoHorizontalScroll(page)
      await ficha.screenshot({ path: printPath('contratante-ficha-previa', width, theme) })

      ficha = await openFicha(page, BETA.displayName)
      await ficha.getByRole('button', { name: 'Salvar perfil' }).click()
      await expect(ficha.getByText('Confira:')).toBeVisible()
      await expect(ficha.locator('[data-refusal-summary]').getByRole('button')).toHaveCount(3)
      await expectNoHorizontalScroll(page)
      await ficha.screenshot({ path: printPath('contratante-ficha-recusa', width, theme) })

      if (width === 1280 && REVIEW_OUTPUT !== undefined) {
        const contrast = await measureContrast(page)
        mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
        writeFileSync(`${REVIEW_OUTPUT}.contrast-${theme}.json`, JSON.stringify(contrast, null, 2))
      }
    })
  }
}

async function readMetrics(locator: Locator): Promise<Record<string, string>> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderRadius: style.borderTopLeftRadius,
      borderWidth: style.borderTopWidth,
      color: style.color,
      fontFamily: style.fontFamily.split(',')[0] ?? '',
      fontSize: style.fontSize,
      height: `${String(Math.round(box.height))}px`,
      paddingBlock: `${style.paddingTop} ${style.paddingBottom}`,
      paddingInline: `${style.paddingLeft} ${style.paddingRight}`,
    }
  })
}

test('revisão de design — o campo novo contra o do vizinho DeliveryClientForm (1280, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 1280 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, { refuseSave: true })
  await page.route(/\/delivery-clients\/[^/?]+$/, (route) =>
    fulfillJson(route, {
      data: {
        defaultServiceTimeMinutes: 30,
        deliveryFeeAmount: '10.00',
        displayName: 'Cliente Sintético',
        exceptions: [],
        id: '00000000-0000-4000-8000-000000237900',
        notes: '',
        requiresScheduling: false,
        status: 'active',
        taxId: '99888777000166',
        windows: [],
      },
    }),
  )
  await page.route(/\/delivery-clients(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      data: [
        {
          defaultServiceTimeMinutes: 30,
          deliveryFeeAmount: '10.00',
          displayName: 'Cliente Sintético',
          id: '00000000-0000-4000-8000-000000237900',
          notes: '',
          requiresScheduling: false,
          status: 'active',
          taxId: '99888777000166',
        },
      ],
      page: { nextCursor: null },
    }),
  )
  await loginAsLocalUser(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/clientes')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('button', { name: 'Abrir' }).first().click()
  const neighborForm = page
    .locator('form', { has: page.getByLabel('Tempo de atendimento') })
    .first()
  await expect(neighborForm).toBeVisible()

  const neighbor = {
    button: await readMetrics(neighborForm.getByRole('button', { name: 'Salvar' })),
    hint: await readMetrics(neighborForm.locator('p').nth(1)),
    input: await readMetrics(neighborForm.getByLabel('Tempo de atendimento')),
    label: await readMetrics(neighborForm.locator('label').first()),
    legendLike: await readMetrics(page.locator('p').first()),
  }

  await page.getByRole('tab', { exact: true, name: 'Contratantes' }).click()
  await expect(page.getByRole('region', { name: 'Lista de contratantes' })).toBeVisible()
  await expect(page.getByText('Lendo o perfil')).toHaveCount(0)
  const ficha = await openFicha(page, BETA.displayName)
  const profileForm = ficha.locator('form', {
    has: page.getByRole('heading', { level: 4, name: 'Perfil de recebimento' }),
  })
  const detailsForm = ficha.locator('form', {
    has: page.getByRole('heading', { level: 4, name: 'Dados do contratante' }),
  })

  const review = {
    neighbor,
    novo: {
      botaoSalvar: await readMetrics(profileForm.getByRole('button', { name: 'Salvar perfil' })),
      campoDados: await readMetrics(detailsForm.getByLabel('Nome de exibição')),
      campoPerfil: await readMetrics(profileForm.getByLabel('Janela de separação (horas)')),
      ajuda: await readMetrics(profileForm.locator('p').nth(2)),
      cantosDoFormulario: await readMetrics(profileForm),
      legendaDoGrupo: await readMetrics(profileForm.locator('legend').first()),
      selo: await readMetrics(page.getByText('Recebimento ativo').first()),
    },
  }

  /** Alvo de toque: o menor controle clicável da ficha, medido em 375 px. */
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 375 })
  const touchTargets = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('section button, section [role="combobox"]')].map(
      (element) => ({
        height: Math.round(element.getBoundingClientRect().height),
        text: (element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 40),
      }),
    ),
  )
  const result = { ...review, alvosDeToque375: touchTargets }
  if (REVIEW_OUTPUT !== undefined) {
    mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
    writeFileSync(REVIEW_OUTPUT, JSON.stringify(result, null, 2))
  }
  expect(touchTargets.length).toBeGreaterThan(0)
})
