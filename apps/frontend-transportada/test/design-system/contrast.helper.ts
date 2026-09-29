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
