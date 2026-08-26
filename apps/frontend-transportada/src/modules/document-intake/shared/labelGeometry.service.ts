/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { PdfTextFragment } from './pdfTextLayer.service'

/**
 * Spec 048: **ordem de leitura não serve.** O CRLV é formulário, e lido em sequência `PLACA` vem
 * seguido de `EXERCÍCIO` — não do valor da placa. O casamento é geométrico ou não é.
 *
 * Os dois limites saem da medição de 19–20/08/2026 sobre dois CRLV-e reais: o valor fica até 26pt
 * abaixo do rótulo e a menos de 6pt de distância horizontal entre os inícios.
 */
const MAX_VERTICAL_DISTANCE_POINTS = 26
const MAX_HORIZONTAL_DISTANCE_POINTS = 6

/** Rótulo do documento é impresso em caixa alta e com acento; a comparação não pode depender disso. */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toUpperCase()
}

function isBelowAndAligned(label: PdfTextFragment, candidate: PdfTextFragment): boolean {
  const verticalDistance = label.y - candidate.y
  if (verticalDistance <= 0 || verticalDistance > MAX_VERTICAL_DISTANCE_POINTS) return false

  return Math.abs(candidate.x - label.x) < MAX_HORIZONTAL_DISTANCE_POINTS
}

export function findLabelFragment(
  fragments: readonly PdfTextFragment[],
  label: string,
): PdfTextFragment | undefined {
  const wanted = normalizeLabel(label)

  return fragments.find((fragment) => normalizeLabel(fragment.text) === wanted)
}

/**
 * O valor de um rótulo é o fragmento abaixo dele, alinhado na coluna dele, e **o mais próximo
 * vence**: dois rótulos lado a lado só se distinguem pela coluna, e um campo de duas linhas só se
 * resolve pegando a de cima.
 */
export function readValueBelowLabel(
  fragments: readonly PdfTextFragment[],
  label: string,
): string | undefined {
  const labelFragment = findLabelFragment(fragments, label)
  if (labelFragment === undefined) return undefined

  const nearest = fragments
    .filter((fragment) => isBelowAndAligned(labelFragment, fragment))
    .sort((first, second) => second.y - first.y)[0]

  return nearest?.text
}
