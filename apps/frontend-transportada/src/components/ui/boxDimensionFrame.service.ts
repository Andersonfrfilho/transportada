/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { BoxMeasurementInput } from './boxDimension.service'
import { MAXIMUM_FRAME_WIDTH } from './cameraFrame.constant'
import type { Point } from './boxDimensionGeometry.service'
import { clampPointToBounds, type MarkingBounds } from './boxDimensionMarking.service'

/**
 * ⚠️ **Um espaço só para toda a medida: o quadro reduzido que o worker recebeu.**
 *
 * O quadro vai para o OpenCV reduzido a `MAXIMUM_FRAME_WIDTH` (declarado em
 * `cameraFrame.constant.ts`, o mesmo teto do leitor de etiqueta), então os cantos do marcador voltam
 * em pixels **do quadro**. Misturar esses cantos com a largura nativa do `<video>` — que é o que a
 * T14 encontrou — não falha: devolve medida plausível 1,8× a 2,7× errada, com margem pequena ao
 * lado, porque o ponto principal e a focal de reserva saem de uma imagem que ninguém mediu. Por isso
 * tanto os pontos tocados quanto `imageWidth`/`imageHeight` nascem aqui, no mesmo espaço dos cantos.
 */
export { MAXIMUM_FRAME_WIDTH }

export type ScannerFrame = MarkingBounds

export function frameSizeFor(videoWidth: number, videoHeight: number): ScannerFrame {
  if (videoWidth <= 0 || videoHeight <= 0) return { height: 0, width: 0 }
  const factor = Math.min(1, MAXIMUM_FRAME_WIDTH / videoWidth)
  return { height: Math.round(videoHeight * factor), width: Math.round(videoWidth * factor) }
}

export type OverlayRect = Readonly<{ height: number; left: number; top: number; width: number }>

/** O dedo toca o elemento na tela (CSS); a medida acontece no quadro. Esta é a única conversão. */
export function overlayPointToFrame(
  input: Readonly<{ clientX: number; clientY: number; frame: ScannerFrame; rect: OverlayRect }>,
): Point | undefined {
  const { clientX, clientY, frame, rect } = input
  if (frame.width === 0 || frame.height === 0 || rect.width === 0 || rect.height === 0) {
    return undefined
  }
  return clampPointToBounds(
    {
      x: ((clientX - rect.left) / rect.width) * frame.width,
      y: ((clientY - rect.top) / rect.height) * frame.height,
    },
    frame,
  )
}

export type BoxMeasurementFrameInput = Readonly<{
  facePoints: readonly [Point, Point, Point, Point]
  footPoint: Point
  frame: ScannerFrame
  markerCorners: readonly Point[]
}>

/** `imageWidth`/`imageHeight` são os do quadro, nunca os do `<video>` — ver o aviso acima. */
export function buildBoxMeasurementInput(input: BoxMeasurementFrameInput): BoxMeasurementInput {
  return {
    facePoints: input.facePoints,
    footPoint: input.footPoint,
    imageHeight: input.frame.height,
    imageWidth: input.frame.width,
    markerCorners: input.markerCorners,
  }
}
