/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Locator } from '@playwright/test'

/**
 * Spec 239 T4.5 (`web.md` §15): a revisão de design mede no navegador o que o CSS resolveu, em vez
 * de ler a folha de estilo. Cada chamada devolve o que o elemento realmente pintou — altura em
 * pixels, cores já compostas e a razão de contraste contra o fundo que está embaixo dele.
 */
export type ElementMeasure = Readonly<{
  backgroundColor: string
  borderRadius: string
  borderTopColor: string
  borderTopWidth: string
  color: string
  contrast: number
  fontFamily: string
  fontSize: string
  fontWeight: string
  gap: string
  height: number
  letterSpacing: string
  opacity: number
  outlineStyle: string
  paddingLeft: string
  paddingTop: string
  textTransform: string
  width: number
}>

export const CONTRAST_MINIMUM = 4.5

/** Roda no navegador: não pode fechar sobre nada do módulo. */
function measureInPage(element: Element): ElementMeasure {
  type Rgba = readonly [number, number, number, number]

  function parseColor(value: string): Rgba {
    const rgb = /^rgba?\(([^)]+)\)$/u.exec(value)
    if (rgb?.[1] !== undefined) {
      const parts = rgb[1]
        .split(/[\s,/]+/u)
        .filter(Boolean)
        .map(Number)
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
    }
    const srgb = /^color\(srgb ([^)]+)\)$/u.exec(value)
    if (srgb?.[1] !== undefined) {
      const parts = srgb[1]
        .split(/[\s/]+/u)
        .filter(Boolean)
        .map(Number)
      return [(parts[0] ?? 0) * 255, (parts[1] ?? 0) * 255, (parts[2] ?? 0) * 255, parts[3] ?? 1]
    }
    // Durante uma transição o navegador devolve a cor interpolada em oklab: o canvas a converte.
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) throw new Error(`cor não reconhecida: ${value}`)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(0, 0, 1, 1).data
    return [red, green, blue, alpha / 255]
  }

  function over(layer: Rgba, base: Rgba): Rgba {
    const alpha = layer[3]
    return [
      layer[0] * alpha + base[0] * (1 - alpha),
      layer[1] * alpha + base[1] * (1 - alpha),
      layer[2] * alpha + base[2] * (1 - alpha),
      1,
    ]
  }

  function luminance(color: Rgba): number {
    const linear = color.slice(0, 3).map((channel) => {
      const unit = channel / 255
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
  }

  const ancestors: Element[] = []
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    ancestors.unshift(node)
  }
  let backdrop: Rgba = [255, 255, 255, 1]
  for (const ancestor of ancestors) {
    backdrop = over(parseColor(getComputedStyle(ancestor).backgroundColor), backdrop)
  }

  const style = getComputedStyle(element)
  const opacity = Number(style.opacity)
  const ownBackground = over(parseColor(style.backgroundColor), backdrop)
  const ownText = over(parseColor(style.color), ownBackground)
  const blend = (solid: Rgba): Rgba => over([solid[0], solid[1], solid[2], opacity], backdrop)
  const finalBackground = blend(ownBackground)
  const finalText = blend(ownText)
  const lighter = Math.max(luminance(finalBackground), luminance(finalText))
  const darker = Math.min(luminance(finalBackground), luminance(finalText))
  const rect = element.getBoundingClientRect()

  return {
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderTopLeftRadius,
    borderTopColor: style.borderTopColor,
    borderTopWidth: style.borderTopWidth,
    color: style.color,
    contrast: (lighter + 0.05) / (darker + 0.05),
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    gap: style.rowGap,
    height: rect.height,
    letterSpacing: style.letterSpacing,
    opacity,
    outlineStyle: style.outlineStyle,
    paddingLeft: style.paddingLeft,
    paddingTop: style.paddingTop,
    textTransform: style.textTransform,
    width: rect.width,
  }
}

/** O ponteiro parado em cima do botão e a transição de 150 ms mudam a cor medida: mede-se em repouso. */
async function settle(locator: Locator): Promise<void> {
  await locator.page().mouse.move(0, 0)
  await locator.first().evaluate(async (element) => {
    const transitions = element
      .getAnimations()
      .filter((animation) => animation instanceof CSSTransition)
    await Promise.all(transitions.map((animation) => animation.finished.catch(() => undefined)))
  })
}

export async function measure(locator: Locator): Promise<ElementMeasure> {
  await settle(locator)
  return locator.first().evaluate(measureInPage)
}

export function pickMeasure<TKey extends keyof ElementMeasure>(
  measured: ElementMeasure,
  keys: readonly TKey[],
): Pick<ElementMeasure, TKey> {
  const picked = {} as Pick<ElementMeasure, TKey>
  for (const key of keys) picked[key] = measured[key]
  return picked
}
