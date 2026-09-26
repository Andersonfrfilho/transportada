/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T704: as cores dos balões são do **participante** — operação em cobre, contratante em
 * azul, motorista em verde — e as mesmas na linha do tempo (RF19). O texto dentro do balão é o
 * `--color-fog` do tema, e fica em 4,5:1 ou mais nos dois temas; a enviada difere das recebidas
 * também em luminosidade, para não depender só do matiz.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const BUBBLE_TOKENS = [
  '--color-bubble-out',
  '--color-bubble-contractor',
  '--color-bubble-driver',
] as const
const MIN_TEXT_CONTRAST = 4.5
/** Razão mínima de luminância entre a enviada e cada recebida. */
const MIN_SENT_SEPARATION = 1.25

function readStyles(): Promise<string> {
  return Bun.file(new URL('src/styles/index.css', APPLICATION_ROOT)).text()
}

function tokenBlock(source: string, selector: string): ReadonlyMap<string, string> {
  const start = source.indexOf(selector)
  expect(start).toBeGreaterThan(-1)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  const tokens = new Map<string, string>()
  for (const match of source.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens.set(match[1] ?? '', (match[2] ?? '').trim())
  }
  return tokens
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function ratio(first: string, second: string): number {
  const [lighter = 0, darker = 0] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

function themes(source: string): ReadonlyArray<readonly [string, ReadonlyMap<string, string>]> {
  return [
    ['escuro', tokenBlock(source, ':root {')],
    ['claro', tokenBlock(source, ":root[data-theme='light']")],
  ]
}

describe('as cores dos balões (spec 183 T704)', () => {
  test('os três tokens existem nos dois temas, em hexadecimal, e são diferentes entre si', async () => {
    for (const [theme, tokens] of themes(await readStyles())) {
      const values = BUBBLE_TOKENS.map((token) => tokens.get(token) ?? '')
      for (const value of values) expect(value, theme).toMatch(/^#[0-9a-f]{6}$/u)
      expect(new Set(values).size, theme).toBe(BUBBLE_TOKENS.length)
    }
  })

  test('o texto do tema fica em 4,5:1 ou mais sobre cada balão, nos dois temas', async () => {
    for (const [theme, tokens] of themes(await readStyles())) {
      const text = tokens.get('--color-fog') ?? ''
      for (const token of BUBBLE_TOKENS) {
        expect(ratio(text, tokens.get(token) ?? ''), `${theme} ${token}`).toBeGreaterThanOrEqual(
          MIN_TEXT_CONTRAST,
        )
      }
    }
  })

  test('a enviada difere das recebidas em luminosidade, não só no matiz', async () => {
    for (const [theme, tokens] of themes(await readStyles())) {
      const sent = tokens.get('--color-bubble-out') ?? ''
      for (const token of ['--color-bubble-contractor', '--color-bubble-driver']) {
        expect(ratio(sent, tokens.get(token) ?? ''), `${theme} ${token}`).toBeGreaterThanOrEqual(
          MIN_SENT_SEPARATION,
        )
      }
    }
  })
})
