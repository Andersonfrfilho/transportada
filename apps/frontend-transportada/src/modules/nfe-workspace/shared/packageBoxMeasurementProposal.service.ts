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

/** O que cada campo tem digitado agora, em milímetro — `null` enquanto o campo não é um número. */
export type PackageBoxRecordedMillimetres = Readonly<Record<PackageBoxDimensionKey, null | number>>

export type PackageBoxDimensionStateInput = Readonly<{
  edited: Readonly<Record<PackageBoxDimensionKey, boolean>>
  proposal: BoxDimensionMeasuredResult | undefined
  recorded: PackageBoxRecordedMillimetres
}>

/**
 * ⚠️ **Editada é a dimensão cujo valor DIFERE da proposta — a mesma pergunta que o schema da API
 * faz** (`isEditedDimension`, `package-box.schema.ts`). Isentar na primeira tecla isentava também
 * quem redigita o mesmo número, que é exatamente o protocolo de validação D16: o conferente confere
 * a proposta com a fita, concorda, digita 59,9 sobre 599 mm — a tela não pedia confirmação e a API,
 * vendo `599 === 599`, recusava a margem de 11 mm sem confirmação com `400` (3ª revisão, item A1).
 * `source` continua saindo de `edited`: quem encostou no campo declarou ter conferido.
 */
function isOverriddenDimension(
  input: PackageBoxDimensionStateInput & Readonly<{ dimension: PackageBoxDimensionKey }>,
): boolean {
  if (!input.edited[input.dimension]) return false
  const recordedMm = input.recorded[input.dimension]
  if (recordedMm === null) return false
  return recordedMm !== proposedMillimetres(input.proposal, input.dimension)
}

export function dimensionReliability(
  input: PackageBoxDimensionStateInput & Readonly<{ dimension: PackageBoxDimensionKey }>,
): MeasurementReliability | undefined {
  if (isOverriddenDimension(input)) return undefined
  const marginMm = proposedMarginMillimetres(input.proposal, input.dimension)
  return marginMm === undefined ? undefined : classifyMargin(marginMm)
}

/**
 * M9: o foco vai para a **primeira** dimensão em branco. Marcar todas as não confiáveis com o mesmo
 * `ref` deixava a última da lista com ele — o operador começava a digitar pela altura quando o
 * comprimento é que estava vazio.
 */
export function firstUnreliableDimension(
  input: PackageBoxDimensionStateInput,
): PackageBoxDimensionKey | undefined {
  return PACKAGE_BOX_DIMENSION_KEYS.find(
    (dimension) => dimensionReliability({ ...input, dimension }) === 'unreliable',
  )
}
