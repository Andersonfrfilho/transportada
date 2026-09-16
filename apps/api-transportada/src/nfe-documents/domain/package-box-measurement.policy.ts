/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MARGIN_UNRELIABLE_MM,
  type PackageBoxMeasurementSource,
} from './package-box-measurement.constant.js'
import { PackageBoxCameraMeasurementDisabledError } from './package-box-measurement.error.js'

export type PackageBoxCameraMeasurementProposal = {
  readonly heightMarginMm?: number | undefined
  readonly lengthMarginMm?: number | undefined
  readonly proposedHeightMm?: number | undefined
  readonly proposedLengthMm?: number | undefined
  readonly proposedWidthMm?: number | undefined
  readonly widthMarginMm?: number | undefined
}

export type PackageBoxRecordedDimensions = {
  readonly heightMm: number
  readonly lengthMm: number
  readonly widthMm: number
}

/** A trinca de chaves de cada dimensão, para as regras olharem uma dimensão por vez. */
export const CAMERA_DIMENSIONS = [
  { margin: 'heightMarginMm', proposed: 'proposedHeightMm', recorded: 'heightMm' },
  { margin: 'lengthMarginMm', proposed: 'proposedLengthMm', recorded: 'lengthMm' },
  { margin: 'widthMarginMm', proposed: 'proposedWidthMm', recorded: 'widthMm' },
] as const

export type CameraDimension = (typeof CAMERA_DIMENSIONS)[number]

/**
 * "O conferente digitou este valor por cima" — a condição que isenta a dimensão das regras de margem
 * e a tira da margem gravada na caixa.
 *
 * ⚠️ **Sem proposta conhecida a dimensão conta como NÃO editada** (lado seguro): comparar
 * `undefined` com o valor gravado dava "editada" às três de uma vez, e um `camera_adjusted` sem
 * nenhum `proposed<Dim>Mm` dispensava a confirmação de imprecisão inteira (T14 item M2 da 2ª
 * revisão). A única exceção é a dimensão que a própria câmera declarou não ter lido — margem acima
 * do teto, D6: ali não existe proposta nenhuma para comparar, o campo nasce vazio na tela e o valor
 * gravado é necessariamente digitado.
 */
export function isEditedDimension(
  camera: PackageBoxCameraMeasurementProposal,
  dimension: CameraDimension,
  recordedMm: number,
): boolean {
  const proposed = camera[dimension.proposed]
  if (proposed === undefined) return (camera[dimension.margin] ?? 0) > MARGIN_UNRELIABLE_MM
  return proposed !== recordedMm
}

/**
 * D17: a margem que a caixa grava (`measurement_margin_mm`) é a maior das margens das dimensões que
 * a câmera de fato propôs — `null` quando a câmera não participou (`source: typed`), não propôs
 * margem nenhuma, ou teve as três dimensões digitadas por cima.
 *
 * ⚠️ **A coluna guarda a incerteza do que a CÂMERA mediu, não do que o operador digitou.** O máximo
 * das três marcava a caixa do caminho D6 com os 45 mm de uma altura que a câmera nem chegou a ler e
 * que foi medida com a fita, enquanto o schema já excluía essa dimensão das duas regras de margem
 * (3ª revisão). As duas definições são agora a mesma; a margem de cada dimensão proposta segue no
 * histórico, que é o que a validação lê.
 */
export function resolveMeasurementMargin(input: {
  readonly camera: PackageBoxCameraMeasurementProposal | undefined
  readonly recorded: PackageBoxRecordedDimensions
  readonly source: PackageBoxMeasurementSource
}): number | null {
  const camera = input.camera
  if (camera === undefined) return null
  const margins = CAMERA_DIMENSIONS.filter(
    (dimension) =>
      input.source === 'camera' ||
      !isEditedDimension(camera, dimension, input.recorded[dimension.recorded]),
  )
    .map((dimension) => camera[dimension.margin])
    .filter((margin): margin is number => margin !== undefined)
  return margins.length === 0 ? null : Math.max(...margins)
}

/**
 * D14: `typed` grava sempre. `camera`/`camera_adjusted` exigem a função ligada na empresa — checado
 * aqui, e não só na tela, porque uma aba aberta antes do desligamento continua mandando `PUT`.
 */
export function assertCameraMeasurementEnabled(input: {
  readonly enabled: boolean
  readonly source: PackageBoxMeasurementSource
}): void {
  if (input.source !== 'typed' && !input.enabled) {
    throw new PackageBoxCameraMeasurementDisabledError()
  }
}
