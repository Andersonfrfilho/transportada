/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A razão de contraste do WCAG 2.2 §1.4.3 sai da **luminância relativa**, não da diferença entre
 * canais: dois cinzas a 20 pontos de RGB contrastam muito diferente perto do preto e perto do
 * branco. Medir a olho, ou por subtração de canal, é o que deixa texto discreto reprovar.
 */
export function channels(hex: string): readonly number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
}

export function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = channels(hex).map(linear)

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function contrastRatio(first: string, second: string): number {
  const one = relativeLuminance(first)
  const other = relativeLuminance(second)

  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05)
}

/**
 * `color-mix(in srgb, X N%, transparent)` não é uma cor: é X com alfa N sobre o que estiver atrás.
 * Medir a razão contra a receita, em vez de contra o resultado composto, dá um número que ninguém vê.
 */
export function compositeOver(
  input: Readonly<{ color: string; percent: number; surface: string }>,
): string {
  const surface = channels(input.surface)

  return `#${channels(input.color)
    .map((channel, index) => channel * input.percent + (surface[index] ?? 0) * (1 - input.percent))
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const DARK_THEME_SELECTOR = ':root {'
const LIGHT_THEME_SELECTOR = ":root[data-theme='light']"

export function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function extractTokenBlock(source: string, selector: string): string {
  const start = source.indexOf(selector)
  if (start < 0) throw new Error(`bloco de tokens ausente: ${selector}`)
  const open = source.indexOf('{', start)

  return source.slice(open + 1, source.indexOf('}', open))
}

function extractTokens(block: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    tokens.set(match[1] ?? '', (match[2] ?? '').trim())
  }

  return tokens
}

/** O tema claro é o escuro com alguns tokens trocados — a cascata do CSS, medida do mesmo jeito. */
export async function readThemes(): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>> {
  const styles = await readApplicationFile('src/styles/index.css')
  const dark = extractTokens(extractTokenBlock(styles, DARK_THEME_SELECTOR))
  const light = new Map(dark)
  for (const [token, value] of extractTokens(extractTokenBlock(styles, LIGHT_THEME_SELECTOR))) {
    light.set(token, value)
  }

  return new Map([
    ['escuro', dark],
    ['claro', light],
  ])
}
