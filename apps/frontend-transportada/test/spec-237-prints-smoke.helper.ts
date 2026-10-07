/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (`web.md` §15): o que os prints de revisão de design do recebimento têm em comum — a foto sintética, a
 * resposta JSON com CORS, a navegação sem recarregar, e as medidas da revisão (rolagem lateral, corte do diálogo,
 * células que se sobrepõem, contraste, estilo calculado e alvo de toque). Fora do smoke da CI.
 */
import { deflateSync } from 'node:zlib'

import type { Locator, Page, Route } from '@playwright/test'

export const MINIMUM_CONTRAST = 4.5
export const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

/** Um PNG sintético (caixa de papelão amassada, desenhada em código) — nada de foto real. */
export function buildSyntheticPhoto(): Buffer {
  const width = 640
  const height = 480
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < width; x += 1) {
      const inBox = x > 120 && x < 520 && y > 100 && y < 400
      const crease = inBox && Math.abs(x - 320 - (y - 250) * 0.35) < 6
      const offset = rowStart + 1 + x * 3
      const color = crease ? [120, 78, 40] : inBox ? [188, 140, 84] : [226, 226, 222]
      raw[offset] = color[0] ?? 0
      raw[offset + 1] = color[1] ?? 0
      raw[offset + 2] = color[2] ?? 0
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (data: Buffer): number => {
    let c = 0xffffffff
    for (const byte of data) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export const PHOTO = buildSyntheticPhoto()

export async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
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

export async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

export async function readOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

/** O diálogo é portal fora de `main`: ninguém dentro dele passa da borda direita dele, e ele não rola de lado. */
export async function readDialogClipping(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog === null) return ['sem diálogo']
    const limit = dialog.getBoundingClientRect().right
    const problems: string[] = []
    for (const element of dialog.querySelectorAll('*')) {
      const box = element.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      if (box.right > limit + 1)
        problems.push(
          `<${element.tagName.toLowerCase()}> termina em ${Math.round(box.right)} (limite ${Math.round(limit)})`,
        )
    }
    if (dialog.scrollWidth > dialog.clientWidth) problems.push('o diálogo rola de lado')
    return problems
  })
}

/** Coluna que invade a vizinha (`table-layout: fixed` com larguras que somam mais que a tabela): células que se sobrepõem. */
export async function readCellOverlaps(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const problems: string[] = []
    for (const row of document.querySelectorAll('main table tr')) {
      const cells = [...row.children].filter((cell) => cell.getBoundingClientRect().width > 0)
      const isStacked = getComputedStyle(row).display === 'grid'
      if (isStacked) continue
      cells.forEach((cell, index) => {
        const next = cells[index + 1]
        if (next === undefined) return
        if (cell.getBoundingClientRect().right > next.getBoundingClientRect().left + 1) {
          problems.push(
            `"${(cell.textContent ?? '').trim().slice(0, 20)}" invade "${(next.textContent ?? '').trim().slice(0, 20)}"`,
          )
        }
      })
    }
    return problems
  })
}

export type Sample = Readonly<{ name: string; ratio: number }>

export type ContrastTarget = Readonly<{ name: string; selector: string }>

export async function measureContrast(
  page: Page,
  targets: readonly ContrastTarget[],
): Promise<readonly Sample[]> {
  return page.evaluate((contrastTargets) => {
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
    return contrastTargets.flatMap((target) => {
      const elements = [...document.querySelectorAll(target.selector)]
      return elements.slice(0, 3).map((element, index) => {
        const background = effectiveBackground(element)
        const text = over(parse(getComputedStyle(element).color), background)
        const [lighter, darker] = [luminance(text), luminance(background)].sort(
          (a, b) => b - a,
        ) as [number, number]
        return {
          name: `${target.name} #${String(index + 1)}`,
          ratio: Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100,
        }
      })
    })
  }, targets)
}

export async function readMetrics(locator: Locator): Promise<Record<string, string>> {
  return locator.first().evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      borderWidth: style.borderTopWidth,
      fontFamily: style.fontFamily.split(',')[0] ?? '',
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      height: `${Math.round(element.getBoundingClientRect().height)}px`,
      textTransform: style.textTransform,
    }
  })
}

export async function readTouchTargets(
  page: Page,
  touchSelectors: readonly string[],
): Promise<readonly string[]> {
  return page.evaluate((selectors) => {
    const problems: string[] = []
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const box = element.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        if (box.height < 43.5) {
          problems.push(
            `${selector} "${(element.textContent ?? '').trim().slice(0, 30)}" mede ${String(Math.round(box.height * 10) / 10)}px`,
          )
        }
      }
    }
    return problems
  }, touchSelectors)
}
