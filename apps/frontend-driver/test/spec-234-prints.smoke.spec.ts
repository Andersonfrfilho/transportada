/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 234 D4d (`web.md` §15): os prints da revisão de design do aviso de localização desligada e dos
 * textos novos que cobrem a entrega sem localização, nos dois temas, em 375 px. Fora do smoke da CI:
 * roda com `PLAYWRIGHT_TEST_MATCH=spec-234-prints.smoke.spec.ts` e grava os PNGs ao lado da spec 234. O
 * estado é conferido por localizador e `getComputedStyle`; o screenshot só fecha cada tela.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi, type DriverTripProofScenario } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/234-a-nota-mede-o-momento-do-evento-nao-a-chegada/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const SCHEMES = ['light', 'dark'] as const
type Scheme = (typeof SCHEMES)[number]

const LOCATION_OFF_WARNING = /^Localização desligada: entregar assim conta como longe do local/u
const PHOTO_REQUIRED = {
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'optional',
} as const
/** PNG 1×1 sintético — nenhuma foto real entra em fixture. */
const PHOTO_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function pendingProof(input: Readonly<{ documentId: string; number: string; recipient: string }>) {
  return {
    deliveredAt: '2026-09-18T13:10:00.000Z',
    deliveryProof: PHOTO_REQUIRED,
    documentId: input.documentId,
    documentNumber: input.number,
    documentSeries: '1',
    recipientName: input.recipient,
    tripId: '00000000-0000-4000-8000-000000000100',
    tripStatus: 'in_transit',
  }
}

const AWAY = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000205',
  number: '900205',
  recipient: 'Bazar do Bairro',
})
const LATE_AND_AWAY = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000206',
  number: '900206',
  recipient: 'Mercado Central',
})

async function shoot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0)
  await page.screenshot({ animations: 'disabled', path: resolve(PRINTS_DIRECTORY, name) })
}

/** Põe o alvo no meio da tela, com o que vem logo abaixo dele (o botão) ainda à vista. */
async function centerOnScreen(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
}

/** A Permissions API do aparelho responde `denied` — como o Android com a localização negada ao site. */
async function denyGeolocationPermission(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const status = new EventTarget() as EventTarget & { state: string }
    status.state = 'denied'
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: () => Promise.resolve(status) },
    })
  })
}

async function openApp(
  input: Readonly<{
    isDenied: boolean
    page: Page
    scenario?: DriverTripProofScenario
    scheme: Scheme
  }>,
): Promise<void> {
  await input.page.setViewportSize(MOBILE)
  await input.page.emulateMedia({ colorScheme: input.scheme })
  if (input.isDenied) await denyGeolocationPermission(input.page)
  else {
    await input.page.context().grantPermissions(['geolocation'])
    await input.page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  }
  await mockDriverTripApi({
    page: input.page,
    ...(input.scenario ? { scenario: input.scenario } : {}),
  })
  await loginAsLocalUser(input.page)
  await expect(input.page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
}

/** Os números que a revisão de design confere: caixa, tipografia e contraste do texto sobre o fundo real. */
async function readDesign(locator: Locator) {
  return locator.evaluate((element) => {
    type Rgba = readonly [number, number, number, number]
    const parse = (value: string): Rgba => {
      const numbers = value.match(/[\d.]+/gu)?.map(Number) ?? [0, 0, 0, 1]
      return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 1]
    }
    const channel = (value: number) => {
      const unit = value / 255
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    }
    const luminance = (rgb: Rgba) =>
      0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
    const flatten = (top: Rgba, bottom: Rgba): Rgba => [
      top[0] * top[3] + bottom[0] * (1 - top[3]),
      top[1] * top[3] + bottom[1] * (1 - top[3]),
      top[2] * top[3] + bottom[2] * (1 - top[3]),
      1,
    ]
    const layers: Rgba[] = []
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      layers.push(parse(getComputedStyle(node).backgroundColor))
    }
    const background = layers.reduceRight<Rgba>(
      (below, layer) => flatten(layer, below),
      [0, 0, 0, 1],
    )
    const style = getComputedStyle(element)
    const textElement = element.querySelector('p') ?? element
    const textColor = parse(getComputedStyle(textElement).color)
    const lighter = Math.max(luminance(flatten(textColor, background)), luminance(background))
    const darker = Math.min(luminance(flatten(textColor, background)), luminance(background))
    return {
      backgroundColor: style.backgroundColor,
      borderLeft: `${style.borderLeftWidth} ${style.borderLeftStyle} ${style.borderLeftColor}`,
      borderRadius: style.borderRadius,
      contrastRatio: Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2)),
      fontFamily: getComputedStyle(textElement).fontFamily.split(',')[0] ?? '',
      fontSize: getComputedStyle(textElement).fontSize,
      padding: style.padding,
      rowGap: style.rowGap,
      textColor: getComputedStyle(textElement).color,
      width: `${Math.round(element.getBoundingClientRect().width)}px`,
    }
  })
}

for (const scheme of SCHEMES) {
  test(`print: entregar sem localização — aviso antes do Entreguei (${scheme})`, async ({
    page,
  }) => {
    await openApp({ isDenied: true, page, scheme })
    await page.getByRole('button', { exact: true, name: 'Cheguei' }).click()
    const warning = page.getByRole('status').filter({ hasText: LOCATION_OFF_WARNING })
    const deliver = page.getByRole('button', { exact: true, name: 'Entreguei' })
    await expect(warning).toBeVisible()
    await expect(deliver).toBeEnabled()
    // O aviso vem antes do botão na tela (a ordem do DOM é a da leitura).
    const warningBox = await warning.boundingBox()
    const deliverBox = await deliver.boundingBox()
    expect((warningBox?.y ?? 0) + (warningBox?.height ?? 0)).toBeLessThanOrEqual(deliverBox?.y ?? 0)
    await assertNoHorizontalOverflow(page)
    await centerOnScreen(warning)
    await shoot(page, `entreguei-sem-localizacao-${scheme}.png`)
    console.log(`REVIEW ${scheme} aviso-novo ${JSON.stringify(await readDesign(warning))}`)
  })

  test(`print: entregar com localização — sem aviso, para comparar (${scheme})`, async ({
    page,
  }) => {
    await openApp({ isDenied: false, page, scheme })
    await page.getByRole('button', { exact: true, name: 'Cheguei' }).click()
    const deliver = page.getByRole('button', { exact: true, name: 'Entreguei' })
    await expect(deliver).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: LOCATION_OFF_WARNING })).toHaveCount(0)
    await centerOnScreen(deliver)
    await shoot(page, `entreguei-com-localizacao-${scheme}.png`)
  })

  test(`print: sem localização e com foto obrigatória — os dois avisos juntos (${scheme})`, async ({
    page,
  }) => {
    await openApp({
      isDenied: true,
      page,
      scenario: { settlesDeliveries: true, stopDeliveryProof: PHOTO_REQUIRED },
      scheme,
    })
    await page.getByRole('button', { exact: true, name: 'Cheguei' }).click()
    const warning = page.getByRole('status').filter({ hasText: LOCATION_OFF_WARNING })
    const proofNote = page.getByRole('note').filter({ hasText: 'Foto do canhoto obrigatória' })
    await expect(warning).toBeVisible()
    await expect(proofNote).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await centerOnScreen(proofNote)
    await shoot(page, `entreguei-sem-localizacao-foto-obrigatoria-${scheme}.png`)
    console.log(`REVIEW ${scheme} aviso-da-foto ${JSON.stringify(await readDesign(proofNote))}`)
    console.log(`REVIEW ${scheme} aviso-novo-com-foto ${JSON.stringify(await readDesign(warning))}`)
  })

  test(`print: resultado da foto com o texto novo — longe e atrasada e longe (${scheme})`, async ({
    page,
  }) => {
    await openApp({
      isDenied: false,
      page,
      scenario: {
        pendingProofs: [AWAY, LATE_AND_AWAY],
        punctualityByDocumentId: {
          [AWAY.documentId]: 'away',
          [LATE_AND_AWAY.documentId]: 'late_and_away',
        },
      },
      scheme,
    })
    await page.getByRole('button', { name: /Fotos pendentes/u }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Fotos pendentes' })).toBeVisible()
    for (const recipient of ['Bazar do Bairro', 'Mercado Central']) {
      const item = page.locator('li', { hasText: recipient })
      await item.locator('input[type=file][capture]').setInputFiles({
        buffer: PHOTO_BYTES,
        mimeType: 'image/png',
        name: 'canhoto.png',
      })
      await page.getByRole('button', { name: 'Usar sem recorte' }).click()
    }
    await page.getByRole('button', { name: 'Voltar' }).click()
    const away = page.getByRole('status').filter({
      hasText: 'Registrada longe do local ou sem a localização da entrega',
    })
    const lateAndAway = page.getByRole('status').filter({
      hasText: 'Registrada fora do prazo e longe do local (ou sem a localização da entrega)',
    })
    await expect(away).toBeVisible()
    await expect(lateAndAway).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await shoot(page, `resultado-da-foto-sem-localizacao-${scheme}.png`)
    console.log(`REVIEW ${scheme} resultado-away ${JSON.stringify(await readDesign(away))}`)
  })

  test(`print: perfil com a dica da nota nova (${scheme})`, async ({ page }) => {
    await openApp({ isDenied: false, page, scenario: { score: 85 }, scheme })
    await page.getByRole('button', { name: 'Perfil' }).click()
    const hint = page.getByText(/ou sem a localização dela/u)
    await expect(hint).toBeVisible()
    await hint.scrollIntoViewIfNeeded()
    await assertNoHorizontalOverflow(page)
    await shoot(page, `perfil-dica-da-nota-${scheme}.png`)
  })
}
