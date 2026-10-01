/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.19 (`web.md` §15): os prints da revisão de design do comprovante no item da nota, em
 * 375 px, 768 px e 1280 px, nos dois temas. O painel abre **dentro** do card da nota — é essa
 * largura já espremida que a revisão mede, e não a da página.
 *
 * ⚠️ **A T5.6 registrou dois limites deste ambiente, e nenhum dos dois sobrevive aqui.** A janela
 * não redimensionava pelo navegador de inspeção; o `setViewportSize` do Playwright redimensiona de
 * verdade. O MinIO local devolvia 503 na imagem assinada; aqui a URL assinada é atendida pela
 * própria rota do teste com um PNG sintético, então o navegador não toca no MinIO.
 *
 * ⚠️ **Nenhum modo anterior do dublê chega a este painel.** O botão "Comprovante" só existe com
 * `deliveredAt` ou `returnedAt`, e a única nota que o tinha era devolvida — `resolveDeliveryProofView`
 * testa `returned` primeiro e desenha uma frase no lugar do painel. Daí o modo `delivered-proof`.
 *
 * Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-220-prints.smoke.spec.ts` e grava os
 * PNGs ao lado da spec, que é onde a evidência mora.
 */
import { resolve } from 'node:path'

import { expect, type Locator, type Page, type Route, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { getApiBaseUrl } from './smoke-api-url.helper'
import { mockTripWorkspaceApi, PROOF_DELIVERED_DOCUMENT_ID } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/220-a-mercadoria-e-o-canhoto-nao-sao-a-mesma-foto/prints',
)

const VIEWPORTS = [
  ['375', { height: 812, width: 375 }],
  ['768', { height: 1024, width: 768 }],
  ['1280', { height: 900, width: 1280 }],
] as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

/**
 * `trip.manage` é o que liga "Aprovar canhoto"/"Recusar canhoto" (`canReview`), e
 * `trip.report-on-behalf` é o que libera as duas consultas de contexto do canhoto — sem ela o
 * painel abre, mas a leitura nunca teria de onde vir.
 */
const TRIP_PERMISSIONS = [
  'trip.read',
  'trip.manage',
  'trip.report-on-behalf',
  'fleet.read',
] as const

/**
 * Nenhuma foto real entra em fixture. A miniatura não tem tamanho em CSS — ela ocupa o tamanho
 * intrínseco do arquivo — então um PNG 1×1 sairia como um ponto e o print não mostraria quadro
 * nenhum. Um SVG 640×480 declara o tamanho em duas linhas e é o que a revisão de design mede.
 */
const SYNTHETIC_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 8 6">
  <rect width="8" height="6" fill="#8b8379"/>
  <path d="M0 0h1v1H0zM2 0h1v1H2zM4 0h1v1H4zM6 0h1v1H6zM1 1h1v1H1zM3 1h1v1H3zM5 1h1v1H5zM7 1h1v1H7zM0 2h1v1H0zM2 2h1v1H2zM4 2h1v1H4zM6 2h1v1H6zM1 3h1v1H1zM3 3h1v1H3zM5 3h1v1H5zM7 3h1v1H7zM0 4h1v1H0zM2 4h1v1H2zM4 4h1v1H4zM6 4h1v1H6zM1 5h1v1H1zM3 5h1v1H3zM5 5h1v1H5zM7 5h1v1H7z" fill="#a09889"/>
</svg>`
/**
 * A URL assinada sai da origem da API de propósito: `img-src` só admite `'self'`, `blob:` e as
 * origens declaradas no build, e esta instalação não declara bucket. Origem inventada seria barrada
 * pela CSP e o print sairia com o quadro quebrado — que não é o que a revisão de design mede.
 */
const IMAGE_ORIGIN = `${getApiBaseUrl()}/spec-220-prints`

const EXPIRES_AT = '2026-08-10T18:42:00.000Z'

/** O canhoto recusado e o recapturado convivem: é a recaptura da spec 220 vista do escritório. */
const REJECTED_CANHOTO = {
  canhotoReview: 'rejected',
  canhotoReviewAt: '2026-08-10T17:05:00.000Z',
  canhotoReviewByName: 'Helena Prado',
  canhotoReviewNote: 'O carimbo cobriu a assinatura e o número da nota não aparece no canto.',
  canhotoReviewOrigin: 'manual',
  canhotoReviewReason: 'other',
  capturedAt: '2026-08-10T16:42:00.000Z',
  createdAt: '2026-08-10T16:42:10.000Z',
  distanceMeters: 42,
  downloadUrl: `${IMAGE_ORIGIN}/canhoto-recusado.png`,
  expiresAt: EXPIRES_AT,
  id: '00000000-0000-4000-8000-000000000701',
  kind: 'photo',
  punctuality: 'on_time',
  receivedBy: 'employee',
  receiverName: 'Marcos Tavares',
  thumbnailUrl: `${IMAGE_ORIGIN}/canhoto-recusado-thumb.png`,
} as const

/**
 * `canhotoReadSource` preenchido de propósito: `TripDeliveryProofLoader` só monta a leitura
 * automática em comprovante **sem** fonte de leitura. Com ela o print é determinístico e ainda
 * assim exercita o bloco de leituras e o veredito pendente com os dois botões.
 */
const PENDING_CANHOTO = {
  canhotoReadNumber: '904',
  canhotoReadSeries: '1',
  canhotoReadSource: 'barcode',
  canhotoReview: 'pending',
  capturedAt: '2026-08-10T17:20:00.000Z',
  createdAt: '2026-08-10T17:20:08.000Z',
  distanceMeters: 1480,
  downloadUrl: `${IMAGE_ORIGIN}/canhoto-recapturado.png`,
  expiresAt: EXPIRES_AT,
  id: '00000000-0000-4000-8000-000000000702',
  kind: 'photo',
  lateRegistration: true,
  punctuality: 'away',
  receivedBy: 'employee',
  receiverName: 'Marcos Tavares',
  thumbnailUrl: `${IMAGE_ORIGIN}/canhoto-recapturado-thumb.png`,
} as const

/** Foto da mercadoria: nenhuma leitura de canhoto, nenhum veredito — é o ponto da spec 220. */
function cargoPhoto(index: number) {
  return {
    capturedAt: '2026-08-10T16:41:00.000Z',
    createdAt: `2026-08-10T16:41:0${index}.000Z`,
    distanceMeters: 42,
    downloadUrl: `${IMAGE_ORIGIN}/mercadoria-${index}.png`,
    expiresAt: EXPIRES_AT,
    id: `00000000-0000-4000-8000-00000000071${index}`,
    kind: 'cargo',
    punctuality: 'on_time',
    receiverName: '',
    thumbnailUrl: `${IMAGE_ORIGIN}/mercadoria-${index}-thumb.png`,
  } as const
}

const PROOFS = [REJECTED_CANHOTO, PENDING_CANHOTO, cargoPhoto(1), cargoPhoto(2)] as const

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({
      headers: {
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-allow-origin': '*',
      },
      status: 204,
    })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    status: 200,
  })
}

/**
 * Registrado **depois** de `mockTripWorkspaceApi`: no Playwright a rota mais recente vence, e o
 * padrão `/trips/{id}` do dublê engoliria `/trips/field-delivery-settings`.
 */
async function registerProofMocks(page: Page): Promise<void> {
  await page.route(`${IMAGE_ORIGIN}/**`, async (route) => {
    await route.fulfill({ body: SYNTHETIC_IMAGE, contentType: 'image/svg+xml', status: 200 })
  })
  await page.route(/\/trips\/field-delivery-settings$/, async (route) => {
    await fulfillJson(route, { data: { canhotoOcrEnabled: true } })
  })
  await page.route(/\/trips\/[^/]+\/field-delivery-documents$/, async (route) => {
    await fulfillJson(route, {
      data: {
        documents: [
          {
            accessKey: '3'.repeat(44),
            id: PROOF_DELIVERED_DOCUMENT_ID,
            nfeNumber: '904',
            nfeSeries: '1',
            releasedAt: '2026-08-10T07:30:00.000Z',
          },
        ],
      },
    })
  })
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/proof$/, async (route) => {
    await fulfillJson(route, { data: PROOFS })
  })
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/products$/, async (route) => {
    await fulfillJson(route, { data: [] })
  })
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/occurrences$/, async (route) => {
    await fulfillJson(route, { data: [] })
  })
}

/** Sem centralizar, o painel longo sai cortado pelo fim da janela no print do celular. */
async function centerInView(locator: Locator): Promise<Locator> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  /** O ponteiro parado sobre o último clique pintaria o hover no print. */
  await locator.page().mouse.move(0, 0)
  return locator
}

async function measureOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

const WCAG_AA_NORMAL_TEXT = 4.5

/**
 * O fundo do selo é `color-mix` do token de estado com o cartão — cor que ninguém lê da folha de
 * estilo. Mede-se na tela: empilha-se a composição real e compara-se com a cor do texto, como manda
 * `web.md` §15 (contraste medido, não estimado).
 */
async function measureContrast(text: Locator): Promise<number> {
  return text.evaluate((element) => {
    /** `color-mix` resolve para `color(srgb …)`, cujos canais vão de 0 a 1 — `rgb()` vai até 255. */
    function parse(color: string): readonly number[] {
      const channels = (color.match(/[\d.]+/gu) ?? []).map(Number)
      if (!color.startsWith('color(')) return channels
      return [0, 1, 2].map((index) => (channels[index] ?? 0) * 255).concat(channels[3] ?? 1)
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

/** Toque: todo controle visível do painel com menos de 44 px de altura ou largura. */
async function listSmallTouchTargets(panel: Locator): Promise<readonly string[]> {
  return panel.evaluate((root) =>
    [...root.querySelectorAll('button, a, input, [role=button]')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height < 44 || rect.width < 44)
      .map(
        ({ element, rect }) =>
          `${element.tagName} "${(element.textContent ?? '').trim() || element.getAttribute('aria-label')}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      ),
  )
}

function printPath(width: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `t719-comprovante-${width}-${theme}.png`)
}

for (const theme of THEMES) {
  for (const [width, viewport] of VIEWPORTS) {
    test(`print do comprovante no item da nota — ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
      const mock = await mockTripWorkspaceApi({
        mode: 'delivered-proof',
        page,
        permissions: [...TRIP_PERMISSIONS],
      })
      await registerProofMocks(page)
      await loginAsLocalUser(page)

      await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()
      await page.getByRole('button', { exact: true, name: 'Comprovante' }).click()

      const panel = page.locator('section[aria-labelledby="trip-delivery-proof-title"]')
      await expect(panel.getByRole('heading', { name: 'Comprovante da entrega' })).toBeVisible()
      await expect(panel.getByText('Fotos da carga')).toBeVisible()

      /** RF01: o canhoto e a mercadoria têm rótulos próprios — é a separação que a spec fez. */
      await expect(panel.getByAltText('Foto do comprovante de entrega')).toHaveCount(2)
      await expect(panel.getByAltText('Foto da mercadoria entregue')).toHaveCount(2)

      const pending = panel.getByText(
        'Aguardando conferência: o código de barras aponta a nota 904/1',
      )
      const rejected = panel.getByText('Canhoto recusado', { exact: true })
      await expect(pending).toBeVisible()
      await expect(rejected).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Aprovar canhoto' })).toHaveCount(1)
      await expect(panel.getByRole('button', { name: 'Recusar canhoto' })).toHaveCount(1)

      /** As miniaturas resolvem antes do print: esqueleto no PNG não é revisão de design. */
      await expect(panel.getByLabel('Carregando a imagem do comprovante')).toHaveCount(0)

      for (const [label, badge] of [
        ['pendente', pending],
        ['recusado', rejected],
      ] as const) {
        const contrast = await measureContrast(badge)
        test.info().annotations.push({
          description: `${width} ${theme} — selo ${label}: ${contrast.toFixed(2)}:1`,
          type: 'contrast',
        })
        expect(contrast, `selo ${label} em ${width} ${theme}`).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT,
        )
      }

      test.info().annotations.push({
        description: `${width} ${theme} — ${(await listSmallTouchTargets(panel)).join(' | ') || 'nenhum'}`,
        type: 'small-touch-targets',
      })

      await (
        await centerInView(panel)
      ).screenshot({
        animations: 'disabled',
        path: printPath(width, theme),
      })

      expect(await measureOverflow(page)).toBeLessThanOrEqual(0)
      expect(mock.failures()).toEqual([])
    })
  }
}
