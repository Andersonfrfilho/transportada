/* Copyright (c) 2026 Ada Technology. MIT License. */
import { classifyMargin, type MeasurementReliability } from '@/components/ui/boxDimension.service'
import type { BoxDimensionMeasuredResult } from '@/components/ui/useBoxDimensionScanner.hook'

import { toCentimetres } from './packageBoxMeasurementUnits.service'

export type PackageBoxDimensionKey = 'height' | 'length' | 'width'

/** A ordem em que o conferente lê os campos na tela — e a ordem em que o foco os procura. */
export const PACKAGE_BOX_DIMENSION_KEYS: readonly PackageBoxDimensionKey[] = [
  'length',
  'width',
  'height',
]

/** `0` é o valor sentinela de "a câmera não conseguiu ler esta dimensão" (D6). */
export function proposedMillimetres(
  proposal: BoxDimensionMeasuredResult | undefined,
  dimension: PackageBoxDimensionKey,
): number | undefined {
  if (proposal === undefined) return undefined
  const value = proposal[`${dimension}Mm`]
  return value > 0 ? value : undefined
}

export function proposedMarginMillimetres(
  proposal: BoxDimensionMeasuredResult | undefined,
  dimension: PackageBoxDimensionKey,
): number | undefined {
  return proposal?.[`${dimension}MarginMm`]
}

/**
 * ⚠️ **D6: com proposta na mão, o campo mostra a proposta — ou nada.** Cair na medida antiga
 * gravada quando a câmera não leu a dimensão (margem acima de 30 mm) abria o campo preenchido com
 * um número que ninguém mediu agora: o conferente gravava por cima achando que era a leitura, e a
 * API recusava com `400` porque a proposta seguia imprecisa (T14 item A2). Sem proposta nenhuma, o
 * formulário digitado comum continua abrindo com o que está gravado.
 */
export function initialDimensionCentimetres(
  input: Readonly<{
    dimension: PackageBoxDimensionKey
    proposal: BoxDimensionMeasuredResult | undefined
    storedMm: null | number
  }>,
): string {
  if (input.proposal === undefined) return toCentimetres(input.storedMm)
  return toCentimetres(proposedMillimetres(input.proposal, input.dimension) ?? null)
}

export function dimensionReliability(
  input: Readonly<{
    dimension: PackageBoxDimensionKey
    edited: Readonly<Record<PackageBoxDimensionKey, boolean>>
    proposal: BoxDimensionMeasuredResult | undefined
  }>,
): MeasurementReliability | undefined {
  if (input.edited[input.dimension]) return undefined
  const marginMm = proposedMarginMillimetres(input.proposal, input.dimension)
  return marginMm === undefined ? undefined : classifyMargin(marginMm)
}

/**
 * M9: o foco vai para a **primeira** dimensão em branco. Marcar todas as não confiáveis com o mesmo
 * `ref` deixava a última da lista com ele — o operador começava a digitar pela altura quando o
 * comprimento é que estava vazio.
 */
export function firstUnreliableDimension(
  input: Readonly<{
    edited: Readonly<Record<PackageBoxDimensionKey, boolean>>
    proposal: BoxDimensionMeasuredResult | undefined
  }>,
): PackageBoxDimensionKey | undefined {
  return PACKAGE_BOX_DIMENSION_KEYS.find(
    (dimension) => dimensionReliability({ ...input, dimension }) === 'unreliable',
  )
}
