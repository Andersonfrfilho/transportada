/**
 * Spec 220 T6.11 (`web.md` §15): os prints da revisão de design do aviso de canhoto recusado, na
 * tela "Fotos pendentes", em 375 px. Três notas na mesma lista — recusa da lista fechada, recusa
 * `other` com texto livre, e uma pendente sem recusa nenhuma — porque o aviso só cumpre RF29 se
 * saltar **ao lado** de quem não voltou por recusa. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-220-prints.smoke.spec.ts` e grava os PNGs ao lado da spec 220.
 *
 * ⚠️ **Um tema só, de propósito.** Esta app fixa `color-scheme: dark` em `src/styles/index.css` e
 * não tem `prefers-color-scheme` em lugar nenhum — `emulateMedia` não muda um pixel. Medido: os seis
 * PNGs da primeira versão saíram em três pares de MD5 idêntico. O laço de temas do print da 218
 * ficou como está, mas aqui não se repete.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi, type DriverTripProofScenario } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/220-a-mercadoria-e-o-canhoto-nao-sao-a-mesma-foto/prints',
)
const MOBILE = { height: 812, width: 375 } as const

const PHOTO_REQUIRED = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'required',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'off',
} as const

function pendingProof(
  input: Readonly<{
    canhotoRejection: unknown
    documentId: string
    number: string
    recipient: string
  }>,
) {
  return {
    canhotoRejection: input.canhotoRejection,
    deliveredAt: '2026-09-29T13:10:00.000Z',
    deliveryProof: PHOTO_REQUIRED,
    documentId: input.documentId,
    documentNumber: input.number,
    documentSeries: '1',
    recipientName: input.recipient,
    tripId: '00000000-0000-4000-8000-000000000100',
    tripStatus: 'in_transit',
  }
}

/** A recusa da lista fechada: o texto vem do app, o servidor só manda o motivo. */
const REJECTED_ILLEGIBLE = pendingProof({
  canhotoRejection: { note: null, reason: 'illegible' },
  documentId: '00000000-0000-4000-8000-000000000301',
  number: '900301',
  recipient: 'Padaria Estrela',
})
/** `other`: o texto livre da conferência é o aviso — o pior caso de comprimento na tela. */
const REJECTED_OTHER = pendingProof({
  canhotoRejection: {
    note: 'O carimbo cobriu a assinatura e o número da nota não aparece no canto de cima.',
    reason: 'other',
  },
  documentId: '00000000-0000-4000-8000-000000000302',
  number: '900302',
  recipient: 'Distribuidora Boa Vista Alimentos',
})
/** Sem recusa: a pendente de sempre, para medir o contraste do aviso ao lado dela. */
const NEVER_PHOTOGRAPHED = pendingProof({
  canhotoRejection: null,
  documentId: '00000000-0000-4000-8000-000000000303',
  number: '900303',
  recipient: 'Farmácia Vida',
})

const SCENARIO: DriverTripProofScenario = {
  pendingProofs: [REJECTED_ILLEGIBLE, REJECTED_OTHER, NEVER_PHOTOGRAPHED],
}

/** A barra de navegação de baixo é fixa: sem centralizar, o fim do cartão sai coberto. */
async function centerInView(locator: Locator): Promise<Locator> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  /** O ponteiro parado sobre o último toque pintaria o hover no print — o motorista usa o dedo. */
  await locator.page().mouse.move(0, 0)
  return locator
}

async function openPendingProofs(page: Page): Promise<void> {
  await page.setViewportSize(MOBILE)
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page, scenario: SCENARIO })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await page.getByRole('button', { name: /Fotos pendentes/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Fotos pendentes' })).toBeVisible()
}

async function measureOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

const WCAG_AA_NORMAL_TEXT = 4.5

/**
 * O fundo do aviso é `color-mix` do `--color-alert` com transparência sobre o cartão — cor que
 * ninguém consegue ler da folha de estilo. Mede-se na tela: pinta-se a composição real num canvas
 * e compara-se com a cor do texto, como manda `web.md` §15 (contraste medido, não estimado).
 */
async function measureRejectionContrast(text: Locator): Promise<number> {
  return text.evaluate((element) => {
    function parse(color: string): readonly number[] {
      return (color.match(/[\d.]+/gu) ?? []).map(Number)
    }

    function composite(top: readonly number[], bottom: readonly number[]): readonly number[] {
      const alpha = top[3] ?? 1
      return [0, 1, 2].map(
        (index) => (top[index] ?? 0) * alpha + (bottom[index] ?? 0) * (1 - alpha),
      )
    }

    function relativeLuminance(rgb: readonly number[]): number {
      const [red, green, blue] = [0, 1, 2].map((index) => {
        const channel = (rgb[index] ?? 0) / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0)
    }

    /** Sobe a árvore até achar quem pinta fundo opaco, empilhando as camadas translúcidas. */
    let background = [0, 0, 0]
    const layers: (readonly number[])[] = []
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const layer = parse(getComputedStyle(node).backgroundColor)
      if ((layer[3] ?? 1) === 0) continue
      layers.push(layer)
      if ((layer[3] ?? 1) === 1) {
        background = [...layer]
        break
      }
    }
    for (const layer of layers.reverse()) background = [...composite(layer, background)]

    const foreground = composite(parse(getComputedStyle(element).color), background)
    const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
    const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
    return (lighter + 0.05) / (darker + 0.05)
  })
}

/** Toque: todo botão visível da tela com menos de 44 px de altura ou largura. */
async function listSmallTouchTargets(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, [role=button]')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height < 44 || rect.width < 44)
      .map(
        ({ element, rect }) =>
          `${element.tagName} "${(element.textContent ?? '').trim() || element.getAttribute('aria-label')}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      ),
  )
}

test('print: canhoto recusado na lista de fotos pendentes (375)', async ({ page }) => {
  await openPendingProofs(page)

  const illegible = page.locator('li', {
    has: page.getByText('O canhoto anterior saiu ilegível.'),
  })
  await expect(illegible).toHaveCount(1)
  await (
    await centerInView(illegible)
  ).screenshot({
    animations: 'disabled',
    path: resolve(PRINTS_DIRECTORY, 't611-recusa-da-lista-375.png'),
  })

  const other = page.locator('li', { has: page.getByText('O carimbo cobriu a assinatura') })
  await expect(other).toHaveCount(1)
  await (
    await centerInView(other)
  ).screenshot({
    animations: 'disabled',
    path: resolve(PRINTS_DIRECTORY, 't611-recusa-com-texto-livre-375.png'),
  })

  /** O título da recusa aparece só nas duas primeiras — a terceira nunca teve canhoto. */
  await expect(page.getByText('Canhoto recusado na conferência')).toHaveCount(2)

  const contrast = await measureRejectionContrast(page.getByText('O carimbo cobriu a assinatura'))
  test.info().annotations.push({
    description: `texto do aviso de recusa: ${contrast.toFixed(2)}:1`,
    type: 'contrast',
  })
  expect(contrast).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.move(0, 0)
  await page.screenshot({
    animations: 'disabled',
    path: resolve(PRINTS_DIRECTORY, 't611-lista-completa-375.png'),
  })

  test.info().annotations.push({
    description: (await listSmallTouchTargets(page)).join(' | '),
    type: 'small-touch-targets',
  })
  expect(await measureOverflow(page)).toBeLessThanOrEqual(0)
})
