/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { CONTRAST_MINIMUM, measure, pickMeasure } from './spec-239-measure-smoke.helper'
import {
  ACTIVE_SETTINGS,
  createGate,
  DEFAULT_SETTINGS,
  MANAGER_PERMISSIONS,
  mockLocationRetentionApi,
  READER_PERMISSIONS,
  type RetentionMockOptions,
} from './spec-239-retention-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

/**
 * Spec 239 (`web.md` §15): a aba "Localização" das viagens com a API dublada, nos estados
 * desligado, confirmação (contando e com o número), aguardando a carência, ligado, gravando, erro,
 * carregando e sem permissão — em 1280 e 375, nos dois temas. Além dos PNGs, MEDE no navegador o
 * painel vizinho (Comprovante) e o painel novo: altura, borda, raio, fonte e contraste.
 *
 * Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-239-prints.smoke.spec.ts` e grava os
 * PNGs em `specs/239-.../prints/`. As linhas `MEASURE|` e `CONTRAST|` do log alimentam o evidence.
 *
 * ⚠️ O print sai daqui, e não do navegador apontado para o `make dev`: o app redireciona para a URL
 * do `.env`, então preview em porta alternativa devolve a árvore de outra sessão.
 */
const PRINTS_DIRECTORY = resolve(process.cwd(), '../../specs/239-o-expurgo-se-liga-na-tela/prints')
const VIEWPORTS = [
  { height: 900, label: '1280', theme: 'dark', width: 1280 },
  { height: 900, label: '1280', theme: 'light', width: 1280 },
  { height: 844, label: '375', theme: 'dark', width: 375 },
  { height: 844, label: '375', theme: 'light', width: 375 },
] as const
type Viewport = (typeof VIEWPORTS)[number]

const PANEL_SELECTOR = 'section[aria-labelledby="location-retention-title"]'
const PROOF_PANEL_SELECTOR = 'section:has(h3):has(input[type=number])'
const FIELD_KEYS = [
  'backgroundColor',
  'borderRadius',
  'borderTopColor',
  'borderTopWidth',
  'color',
  'fontFamily',
  'fontSize',
  'height',
  'paddingLeft',
  'paddingTop',
] as const
const TEXT_KEYS = [
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'letterSpacing',
  'textTransform',
] as const
const BUTTON_KEYS = [
  'height',
  'paddingLeft',
  'paddingTop',
  'fontSize',
  'borderRadius',
  'borderTopWidth',
] as const
const PANEL_KEYS = [
  'backgroundColor',
  'borderRadius',
  'borderTopColor',
  'borderTopWidth',
  'gap',
  'paddingLeft',
  'paddingTop',
] as const

function printPath(name: string, viewport: Viewport): string {
  return resolve(PRINTS_DIRECTORY, `spec-239-${name}-${viewport.label}-${viewport.theme}.png`)
}

async function preparePage(
  page: Page,
  input: Readonly<{ permissions: readonly string[]; viewport: Viewport }>,
): Promise<void> {
  await page.setViewportSize({ height: input.viewport.height, width: input.viewport.width })
  await page.emulateMedia({ colorScheme: input.viewport.theme })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode: 'all-authorized', page, permissions: [...input.permissions] })
}

async function openLocationTab(
  page: Page,
  input: Readonly<{
    mock: RetentionMockOptions
    permissions?: readonly string[]
    viewport: Viewport
  }>,
) {
  await preparePage(page, {
    permissions: input.permissions ?? MANAGER_PERMISSIONS,
    viewport: input.viewport,
  })
  const retention = await mockLocationRetentionApi(page, input.mock)
  await loginAsLocalUser(page)
  await page.getByRole('tab', { name: 'Localização' }).click()
  return retention
}

function panel(page: Page): Locator {
  return page.locator(PANEL_SELECTOR)
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { innerWidth, scrollWidth } = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(scrollWidth, 'a página não pode ser mais larga que a janela').toBeLessThanOrEqual(
    innerWidth,
  )
}

/** Mede o contraste de cada texto do estado; o desabilitado é registrado, não cobrado (WCAG 1.4.3). */
async function expectLegible(
  input: Readonly<{ state: string; viewport: Viewport }>,
  elements: Readonly<Record<string, Locator>>,
): Promise<void> {
  for (const [name, locator] of Object.entries(elements)) {
    const measured = await measure(locator)
    const isDisabled = await locator.first().evaluate((element) => element.matches(':disabled'))
    const ratio = measured.contrast.toFixed(2)
    console.log(
      `CONTRAST|${input.viewport.label} ${input.viewport.theme}|${input.state}|${name}|${ratio}|${isDisabled ? 'desabilitado' : 'normal'}`,
    )
    if (!isDisabled) {
      expect(measured.contrast, `${input.state} / ${name}`).toBeGreaterThanOrEqual(CONTRAST_MINIMUM)
    }
  }
}

function panelTexts(page: Page): Record<string, Locator> {
  const scope = panel(page)
  return {
    título: scope.locator('h3').first(),
    'rótulo do campo': scope.locator('label > span').first(),
    dica: scope.locator('h3 + p'),
    campo: scope.locator('input[type=number]'),
  }
}

async function rowHeights(group: Locator, selector: string): Promise<readonly number[]> {
  return group.evaluate(
    (element, rowSelector) =>
      Array.from(element.querySelectorAll(rowSelector)).map(
        (row) => row.getBoundingClientRect().height,
      ),
    selector,
  )
}

async function tokenHeight(page: Page, token: string): Promise<number> {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.height = `var(${name})`
    document.body.append(probe)
    const { height } = probe.getBoundingClientRect()
    probe.remove()
    return height
  }, token)
}

async function acceptCoarsePointer(page: Page, viewport: Viewport): Promise<void> {
  const isCoarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  expect(isCoarse, 'o celular é medido com ponteiro de toque').toBe(viewport.width < 640)
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.label} ${viewport.theme}`, () => {
    test.use({ hasTouch: viewport.width < 640 })

    test('desligado, confirmação com o número, diálogo e carência', async ({ page }) => {
      const impact = createGate()
      const retention = await openLocationTab(page, {
        mock: { holdImpact: impact.promise, initial: DEFAULT_SETTINGS },
        viewport,
      })
      await acceptCoarsePointer(page, viewport)

      await expect(panel(page).getByText('Desligado: nenhuma posição é apagada.')).toBeVisible()
      await expect(panel(page).getByLabel('Prazo de retenção (dias)')).toHaveValue('90')
      expect(retention.requests().some((request) => request.includes('impact'))).toBe(false)
      await expectNoHorizontalOverflow(page)
      await panel(page).screenshot({ path: printPath('desligado', viewport) })
      await expectLegible(
        { state: 'desligado', viewport },
        {
          ...panelTexts(page),
          'estado desligado': panel(page).getByText('Desligado: nenhuma posição é apagada.'),
          'Ligar o apagamento': panel(page).getByRole('button', { name: 'Ligar o apagamento' }),
          'Salvar prazo (sem mudança)': panel(page).getByRole('button', { name: 'Salvar prazo' }),
        },
      )

      const trigger = panel(page).getByRole('button', { name: 'Ligar o apagamento' })
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('button', { name: 'Ligar e apagar…' })).toBeDisabled()
      await expect(dialog.getByLabel('Contando os eventos')).toBeVisible()
      const skeletonRows = await rowHeights(dialog.getByLabel('Contando os eventos'), 'span')
      await page.screenshot({ path: printPath('confirmacao-contando', viewport) })
      await expectLegible(
        { state: 'confirmação contando', viewport },
        { 'botão que apaga (contando)': dialog.getByRole('button', { name: 'Ligar e apagar…' }) },
      )
      impact.release()

      const confirm = dialog.getByRole('button', { name: 'Ligar e apagar ao menos 1.633 pontos' })
      await expect(confirm).toBeEnabled()
      expect(skeletonRows, 'o esqueleto tem uma linha por grupo e a altura da linha real').toEqual(
        await rowHeights(dialog.locator('ul'), 'li'),
      )
      await expect(dialog.getByText('LGPD, art. 5º, I', { exact: false })).toBeVisible()
      expect(retention.requests().filter((request) => request.includes('impact'))).toEqual([
        'GET impact?retentionDays=90',
      ])
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: printPath('confirmacao', viewport) })
      await expectLegible(
        { state: 'confirmação', viewport },
        {
          'título do diálogo': dialog.getByRole('heading'),
          'texto LGPD': dialog.getByText('LGPD, art. 5º, I', { exact: false }),
          'linha da contagem': dialog.locator('li').first(),
          'número da contagem': dialog.locator('li strong').first(),
          'aviso da carência': dialog.getByText('O apagamento só começa 24 horas depois'),
          'botão que apaga': confirm,
          Cancelar: dialog.getByRole('button', { name: 'Cancelar', exact: true }),
        },
      )
      await expectDialogContract(page, viewport)

      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(trigger).toBeFocused()

      await trigger.click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^Ligar e apagar ao menos 1\.633/u })
        .click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(panel(page).getByText(/aguardando a carência de 24 horas/u)).toBeVisible()
      await expect(
        panel(page).getByText(/Começa a valer em \d{2}\/\d{2} \d{2}:\d{2}/u),
      ).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await panel(page).screenshot({ path: printPath('aguardando-carencia', viewport) })
      await expectLegible(
        { state: 'aguardando carência', viewport },
        {
          estado: panel(page).getByText(/aguardando a carência/u),
          'início da vigência': panel(page).getByText(/Começa a valer em/u),
          'Desligar o apagamento': panel(page).getByRole('button', {
            name: 'Desligar o apagamento',
          }),
          'Voltar ao padrão': panel(page).getByRole('button', { name: 'Voltar ao padrão' }),
        },
      )
    })

    test('ligado, gravando e erro de gravação', async ({ page }) => {
      const write = createGate()
      await openLocationTab(page, {
        mock: { holdWrite: write.promise, initial: ACTIVE_SETTINGS, isWriteFailing: true },
        viewport,
      })

      await expect(
        panel(page).getByText(/Ligado: a posição é apagada depois de 60 dias/u),
      ).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await panel(page).screenshot({ path: printPath('ligado', viewport) })
      await expectLegible(
        { state: 'ligado', viewport },
        {
          estado: panel(page).getByText(/Ligado: a posição é apagada/u),
          'Desligar o apagamento': panel(page).getByRole('button', {
            name: 'Desligar o apagamento',
          }),
          'Voltar ao padrão': panel(page).getByRole('button', { name: 'Voltar ao padrão' }),
        },
      )

      const days = panel(page).getByLabel('Prazo de retenção (dias)')
      const rangeError = panel(page).getByText('Informe um número inteiro de 30 a 90.')
      const validBorder = (await measure(days)).borderTopColor
      await days.fill('5')
      await expect(rangeError).toBeVisible()
      await expect(days).toHaveAccessibleDescription('Informe um número inteiro de 30 a 90.')
      expect(
        (await measure(days)).borderTopColor,
        'campo inválido pinta a borda de alerta',
      ).not.toBe(validBorder)
      await panel(page).screenshot({ path: printPath('prazo-invalido', viewport) })
      await expectLegible({ state: 'prazo inválido', viewport }, { 'erro de faixa': rangeError })
      await days.fill('60')

      await panel(page).getByRole('button', { name: 'Desligar o apagamento' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(panel(page).getByRole('status')).toHaveText('Gravando')
      await expect(panel(page).getByLabel('Prazo de retenção (dias)')).toBeDisabled()
      await expect(
        panel(page).getByRole('button', { name: 'Desligar o apagamento' }),
      ).toBeDisabled()
      expect((await measure(days)).opacity, 'campo desabilitado fica apagado como o botão').toBe(
        0.5,
      )
      await expectNoHorizontalOverflow(page)
      await panel(page).screenshot({ path: printPath('salvando', viewport) })
      await expectLegible(
        { state: 'gravando', viewport },
        {
          'aviso Gravando': panel(page).getByRole('status'),
          'campo desabilitado': panel(page).getByLabel('Prazo de retenção (dias)'),
          'botão desabilitado': panel(page).getByRole('button', { name: 'Desligar o apagamento' }),
        },
      )

      write.release()
      const failure = panel(page).getByText('Não foi possível gravar. Nada foi alterado.')
      await expect(failure).toBeVisible()
      await panel(page).screenshot({ path: printPath('erro-gravacao', viewport) })
      await expectLegible({ state: 'erro de gravação', viewport }, { alerta: failure })
    })

    test('erro de leitura, carregando e sem permissão', async ({ page }) => {
      const read = createGate()
      await openLocationTab(page, {
        mock: { holdRead: read.promise, initial: DEFAULT_SETTINGS, isReadFailing: true },
        viewport,
      })

      const skeleton = panel(page).getByLabel('Carregando o prazo de retenção')
      await expect(skeleton).toBeVisible()
      const compactButtonHeight =
        viewport.width < 640 ? 44 : await tokenHeight(page, '--control-height-compact')
      expect(
        await rowHeights(skeleton, 'span'),
        'esqueleto: estado, rótulo, campo e botões',
      ).toEqual([
        16,
        16,
        await tokenHeight(page, '--field-height'),
        compactButtonHeight,
        compactButtonHeight,
      ])
      await expectNoHorizontalOverflow(page)
      await panel(page).screenshot({ path: printPath('carregando', viewport) })

      read.release()
      const failure = panel(page).getByText('Não foi possível ler o prazo de retenção da posição.')
      await expect(failure).toBeVisible()
      await expect(panel(page).getByRole('button')).toHaveCount(0)
      await expectNoHorizontalOverflow(page)
      await panel(page).screenshot({ path: printPath('erro', viewport) })
      await expectLegible({ state: 'erro de leitura', viewport }, { alerta: failure })

      const reader = await page.context().newPage()
      await openLocationTab(reader, {
        mock: { initial: DEFAULT_SETTINGS },
        permissions: READER_PERMISSIONS,
        viewport,
      })
      const forbidden = panel(reader).getByText(
        'Somente quem administra as configurações da empresa vê e altera este prazo.',
      )
      await expect(forbidden).toBeVisible()
      await expect(panel(reader).getByRole('button')).toHaveCount(0)
      await expectNoHorizontalOverflow(reader)
      await panel(reader).screenshot({ path: printPath('sem-permissao', viewport) })
      await expectLegible({ state: 'sem permissão', viewport }, { alerta: forbidden })
    })

    test('paridade com o painel do Comprovante', async ({ page }) => {
      const write = createGate()
      await openLocationTab(page, {
        mock: { holdWrite: write.promise, initial: ACTIVE_SETTINGS },
        viewport,
      })
      const location = {
        campo: await measure(panel(page).locator('input[type=number]')),
        painel: await measure(panel(page)),
        rótulo: await measure(panel(page).locator('label > span').first()),
        título: await measure(panel(page).locator('h3').first()),
        dica: await measure(panel(page).locator('h3 + p')),
        secundario: await measure(
          panel(page).getByRole('button', { name: 'Desligar o apagamento' }),
        ),
      }
      await panel(page).locator('input[type=number]').focus()
      const locationFocus = await measure(panel(page).locator('input[type=number]'))
      await panel(page).getByRole('button', { name: 'Desligar o apagamento' }).click()
      await expect(panel(page).getByRole('status')).toBeVisible()
      const locationDisabled = await measure(panel(page).locator('input[type=number]'))
      write.release()

      await page.getByRole('tab', { name: 'Comprovante' }).click()
      const proof = page.locator(PROOF_PANEL_SELECTOR).first()
      await expect(page.getByRole('button', { name: 'Salvar configuração' })).toBeVisible()
      const field = proof.locator('input[type=number]').first()
      const neighbour = {
        campo: await measure(field),
        painel: await measure(proof),
        rótulo: await measure(proof.locator('label:has(input[type=number]) > span').first()),
        título: await measure(proof.locator('h3').first()),
        dica: await measure(proof.locator('h3 + p')),
        primario: await measure(page.getByRole('button', { name: 'Salvar configuração' })),
      }
      await field.focus()
      const neighbourFocus = await measure(field)
      await field.fill('999999')
      const neighbourInvalid = await measure(field)
      const neighbourSecondary = proof.locator('button[class*="ui-button-secondary"]')
      const secondaryCount = await neighbourSecondary.count()

      const rows: Record<string, unknown> = {
        'campo (loc)': pickMeasure(location.campo, FIELD_KEYS),
        'campo (comprovante)': pickMeasure(neighbour.campo, FIELD_KEYS),
        'campo foco (loc)': locationFocus.outlineStyle,
        'campo foco (comprovante)': neighbourFocus.outlineStyle,
        'campo desabilitado (loc)': pickMeasure(locationDisabled, [
          'color',
          'backgroundColor',
          'height',
          'contrast',
        ]),
        'campo inválido (comprovante)': pickMeasure(neighbourInvalid, ['borderTopColor', 'height']),
        'rótulo (loc)': pickMeasure(location['rótulo'], TEXT_KEYS),
        'rótulo (comprovante)': pickMeasure(neighbour['rótulo'], TEXT_KEYS),
        'painel (loc)': pickMeasure(location.painel, PANEL_KEYS),
        'painel (comprovante)': pickMeasure(neighbour.painel, PANEL_KEYS),
        'botão primário (comprovante)': pickMeasure(neighbour.primario, BUTTON_KEYS),
        'botão secundário (loc)': pickMeasure(location.secundario, BUTTON_KEYS),
        'botões secundários no comprovante': secondaryCount,
      }
      console.log(`MEASURE|${viewport.label} ${viewport.theme}|${JSON.stringify(rows)}`)

      expect(pickMeasure(location.campo, FIELD_KEYS)).toEqual(
        pickMeasure(neighbour.campo, FIELD_KEYS),
      )
      expect(locationFocus.outlineStyle).toBe(neighbourFocus.outlineStyle)
      expect(pickMeasure(location['rótulo'], TEXT_KEYS)).toEqual(
        pickMeasure(neighbour['rótulo'], TEXT_KEYS),
      )
      expect(pickMeasure(location['título'], TEXT_KEYS)).toEqual(
        pickMeasure(neighbour['título'], TEXT_KEYS),
      )
      expect(pickMeasure(location.dica, TEXT_KEYS)).toEqual(pickMeasure(neighbour.dica, TEXT_KEYS))
      expect(pickMeasure(location.painel, PANEL_KEYS)).toEqual(
        pickMeasure(neighbour.painel, PANEL_KEYS),
      )
      expect(location.secundario.height).toBeGreaterThanOrEqual(neighbour.primario.height)
      expect(neighbourInvalid.borderTopColor, 'campo inválido muda a borda').not.toBe(
        neighbour.campo.borderTopColor,
      )
      if (viewport.width < 640) {
        expect(location.secundario.height, 'alvo de toque do botão').toBeGreaterThanOrEqual(44)
      }
      expect(locationDisabled.opacity, 'campo desabilitado fica visivelmente apagado').toBe(0.5)
    })
  })
}

/** Diálogo: rótulo, descrição, foco, ordem de tab, botão que apaga ao lado de Cancelar, tela cheia no celular. */
async function expectDialogContract(page: Page, viewport: Viewport): Promise<void> {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAccessibleName('Ligar o apagamento da posição?')
  await expect(dialog).toHaveAccessibleDescription(/Com o prazo de 90 dias/u)

  const visited: string[] = []
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press('Tab')
    visited.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent ??
          '',
      ),
    )
  }
  expect(visited, 'ordem de tab: fechar, cancelar, confirmar e volta ao início').toEqual([
    'Fechar',
    'Cancelar',
    'Ligar e apagar ao menos 1.633 pontos',
    'Fechar',
  ])

  const cancel = await dialog.getByRole('button', { name: 'Cancelar', exact: true }).boundingBox()
  const confirm = await dialog
    .getByRole('button', { name: /^Ligar e apagar ao menos 1/u })
    .boundingBox()
  const frame = await dialog.boundingBox()
  expect(cancel).not.toBeNull()
  expect(confirm).not.toBeNull()
  expect(frame).not.toBeNull()
  if (cancel === null || confirm === null || frame === null) return
  expect(confirm.x + confirm.width, 'o botão que apaga fica à direita de Cancelar').toBeGreaterThan(
    cancel.x + cancel.width - 1,
  )
  expect(confirm.y + confirm.height, 'a ação cabe na janela sem rolar').toBeLessThanOrEqual(
    viewport.height,
  )
  if (viewport.width < 640) {
    expect(frame.width, 'tela cheia no celular').toBe(viewport.width)
    expect(frame.height, 'tela cheia no celular').toBe(viewport.height)
    expect(cancel.height, 'alvo de toque').toBeGreaterThanOrEqual(44)
    expect(confirm.height, 'alvo de toque').toBeGreaterThanOrEqual(44)
  }
}
