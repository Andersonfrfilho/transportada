/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

type LegendBox = Readonly<{
  isEstimated: boolean
  isSplit: boolean
  stopSequence: number
  xM: number
}>

/**
 * As divisas entre as fatias das paradas, em metros do fundo do baú.
 *
 * ⚠️ Elas são **derivadas do desenho**, não um campo servido ao lado: a fatia é onde a carga da
 * parada começa, e um segundo número calculado no servidor poderia discordar do que a tela mostra.
 *
 * ⚠️ O zero não é divisa — é a testeira. Desenhá-lo poria uma linha tracejada em cima da parede.
 *
 * ⚠️ **A carga dividida fica de fora da conta.** Ela é colocada de propósito fora da própria fatia,
 * mais funda; incluí-la fazia uma parada com uma única sobra empurrar a divisa para dentro da fatia
 * da parada seguinte — a linha desenhada contradizendo justamente a separação que ela mostra.
 */
export function resolveSliceCuts(boxes: readonly LegendBox[]): readonly number[] {
  const startByStop = new Map<number, number>()
  for (const box of boxes) {
    if (box.isSplit) continue
    startByStop.set(box.stopSequence, Math.min(startByStop.get(box.stopSequence) ?? box.xM, box.xM))
  }

  return [...new Set(startByStop.values())].filter((start) => start > 0).sort((a, b) => a - b)
}

/**
 * O limite abaixo do qual o desenho vira ilustração: com quase toda a carga presumida, a arrumação
 * não descreve caixa nenhuma que exista.
 */
const MOSTLY_PRESUMED_SHARE = 0.8

/** A fração da carga que veio do fallback, e não da fita. */
function resolvePresumedShare(boxes: readonly LegendBox[]): number {
  if (boxes.length === 0) return 0

  return boxes.filter((box) => box.isEstimated).length / boxes.length
}

/**
 * ⚠️ **Quase nada medido é uma história diferente de "algo é presumido".** Hoje 15 de 345 notas têm
 * todas as linhas casadas a caixa medida: nesse regime o desenho continua útil como volume, e é
 * enganoso como arrumação — e a tela tem de dizer qual dos dois ela está mostrando.
 */
export function isMostlyPresumed(boxes: readonly LegendBox[]): boolean {
  return boxes.length > 0 && resolvePresumedShare(boxes) >= MOSTLY_PRESUMED_SHARE
}
