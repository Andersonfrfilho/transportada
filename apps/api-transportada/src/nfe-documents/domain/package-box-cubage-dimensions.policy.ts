/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF07 — ponto único de leitura das dimensões da caixa para cubagem, ocupação e planta
 * de carga: medida real primeiro; senão a caixa estimada pela unidade; senão nada. A estimativa
 * nunca é apagada quando a medida chega — só deixa de ser lida aqui.
 */

export type PackageBoxDimensions = {
  readonly heightMm: number
  readonly lengthMm: number
  readonly widthMm: number
}

export type PackageBoxDimensionsSource = {
  readonly estimatedHeightMm?: number | null | undefined
  readonly estimatedLengthMm?: number | null | undefined
  readonly estimatedWidthMm?: number | null | undefined
  readonly heightMm: number | null | undefined
  readonly lengthMm: number | null | undefined
  readonly widthMm: number | null | undefined
}

export type ResolvedCubageDimensions = {
  readonly dims: PackageBoxDimensions
  readonly isEstimated: boolean
}

function toDimensions(
  lengthMm: number | null | undefined,
  widthMm: number | null | undefined,
  heightMm: number | null | undefined,
): PackageBoxDimensions | undefined {
  if (lengthMm == null || widthMm == null || heightMm == null) return undefined
  return { heightMm, lengthMm, widthMm }
}

export function resolveBoxDimensionsForCubage(
  box: PackageBoxDimensionsSource,
): ResolvedCubageDimensions | undefined {
  const measured = toDimensions(box.lengthMm, box.widthMm, box.heightMm)
  if (measured !== undefined) return { dims: measured, isEstimated: false }
  const estimated = toDimensions(box.estimatedLengthMm, box.estimatedWidthMm, box.estimatedHeightMm)
  if (estimated !== undefined) return { dims: estimated, isEstimated: true }
  return undefined
}
