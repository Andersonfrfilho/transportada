/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  BOX_DIMENSION_DOMAIN_WARNINGS,
  EDGE_MARGIN_PX,
  MARKER_CORNER_COUNT,
  MAX_UNSTABLE_SHIFT_PX,
  MAX_VIEW_ANGLE_DEGREES,
  MIN_LAPLACIAN_VARIANCE,
  MIN_LUMINANCE_CONTRAST,
  MIN_MARKER_SIDE_PX,
  MIN_MEAN_LUMINANCE,
  type BoxDimensionDomainWarning,
  type BoxDimensionWarning,
} from './boxDimension.constant'
import type { Point } from './boxDimensionGeometry.service'

/** Estatísticas do quadro já reduzidas a números: o motor não vê imagem nem pixel. */
export type FrameStats = {
  readonly width: number
  readonly height: number
  readonly meanLuminance: number
  readonly luminanceContrast: number
  readonly laplacianVariance: number
  readonly markerCorners?: readonly Point[]
  readonly previousMarkerCorners?: readonly Point[]
  readonly viewAngleDegrees?: number
  readonly markedPoints?: readonly Point[]
}

function isNearEdge(point: Point, width: number, height: number): boolean {
  return (
    point.x < EDGE_MARGIN_PX ||
    point.y < EDGE_MARGIN_PX ||
    point.x > width - EDGE_MARGIN_PX ||
    point.y > height - EDGE_MARGIN_PX
  )
}

function markerSidePx(corners: readonly Point[]): number {
  return (
    corners.reduce((sum, corner, index) => {
      const next = corners[(index + 1) % corners.length] as Point
      return sum + Math.hypot(corner.x - next.x, corner.y - next.y)
    }, 0) / corners.length
  )
}

function meanShift(current: readonly Point[], previous: readonly Point[]): number {
  return (
    current.reduce((sum, corner, index) => {
      const before = previous[index] as Point
      return sum + Math.hypot(corner.x - before.x, corner.y - before.y)
    }, 0) / current.length
  )
}

function detectMarkerWarnings(stats: FrameStats): BoxDimensionWarning[] {
  const corners = stats.markerCorners
  if (!corners || corners.length !== MARKER_CORNER_COUNT) return ['markerNotFound']
  const warnings: BoxDimensionWarning[] = []
  if (markerSidePx(corners) < MIN_MARKER_SIDE_PX) warnings.push('markerTooSmall')
  if (corners.some((corner) => isNearEdge(corner, stats.width, stats.height)))
    warnings.push('markerAtEdge')
  if ((stats.viewAngleDegrees ?? 0) > MAX_VIEW_ANGLE_DEGREES) warnings.push('steepAngle')
  if (
    stats.previousMarkerCorners?.length === MARKER_CORNER_COUNT &&
    meanShift(corners, stats.previousMarkerCorners) > MAX_UNSTABLE_SHIFT_PX
  ) {
    warnings.push('unstable')
  }
  return warnings
}

/** D9: motivos de imprecisão do quadro, em ordem estável — mesma entrada, mesma lista. */
export function detectWarnings(stats: FrameStats): BoxDimensionWarning[] {
  const warnings = detectMarkerWarnings(stats)
  if (stats.meanLuminance < MIN_MEAN_LUMINANCE || stats.luminanceContrast < MIN_LUMINANCE_CONTRAST)
    warnings.push('lowLight')
  if (stats.laplacianVariance < MIN_LAPLACIAN_VARIANCE) warnings.push('blurry')
  if (stats.markedPoints?.some((point) => isNearEdge(point, stats.width, stats.height)))
    warnings.push('boxOutOfFrame')
  return warnings
}

function isDomainWarning(code: BoxDimensionWarning): code is BoxDimensionDomainWarning {
  return (BOX_DIMENSION_DOMAIN_WARNINGS as readonly string[]).includes(code)
}

/** Só o domínio fechado da D9 é gravável: o motivo interno fica na tela e nunca vai para a API. */
export function selectDomainWarnings(
  warnings: readonly BoxDimensionWarning[],
): BoxDimensionDomainWarning[] {
  return warnings.filter(isDomainWarning)
}
