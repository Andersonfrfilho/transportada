/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CORNER_SIGMA_FLOOR_PX,
  DEFAULT_HORIZONTAL_FOV_DEGREES,
  FALLBACK_FOCAL_RELATIVE_SIGMA,
  MARGIN_RELIABLE_MM,
  MARGIN_UNRELIABLE_MM,
  MARKER_CORNER_COUNT,
  MARKER_SIDE_MM,
  MAX_PLAUSIBLE_FOV_DEGREES,
  MIN_PLAUSIBLE_FOV_DEGREES,
  MONTE_CARLO_SAMPLES,
  MONTE_CARLO_SEED,
  PRINT_FLOOR_MM,
  PRINT_SCALE_TOLERANCE,
  TOUCH_SIGMA_PX,
  type BoxDimensionKey,
} from './boxDimension.constant'
import {
  applyHomography,
  computeHomography,
  distance,
  estimateFocalFromHomography,
  invertMatrix3,
  measureVerticalEdge,
  projectPoint,
  recoverPose,
  viewAngleDegrees,
  type Point,
} from './boxDimensionGeometry.service'

export type FocalSource = 'homography' | 'defaultFov'

/** A, B, C, D rodeiam a face de cima (A é o canto da aresta vertical visível); E é o pé dela. */
export type BoxMeasurementInput = {
  readonly markerCorners: readonly Point[]
  readonly facePoints: readonly [Point, Point, Point, Point]
  readonly footPoint: Point
  readonly imageWidth: number
  readonly imageHeight: number
  readonly markerSideMm?: number
  readonly focalPx?: number
}

export type BoxMeasurementResult = {
  readonly lengthMm: number
  readonly widthMm: number
  readonly heightMm: number
  readonly focalPx: number
  readonly focalSource: FocalSource
  readonly reprojectionErrorPx: number
  readonly viewAngleDegrees: number
  readonly markerSidePx: number
}

const MARKER_ORDER = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const

function markerObjectPoints(sideMm: number): Point[] {
  return MARKER_ORDER.map(([x, y]) => ({ x: x * sideMm, y: y * sideMm }))
}

function focalFromFov(imageWidth: number, fovDegrees: number): number {
  return imageWidth / 2 / Math.tan((fovDegrees * Math.PI) / 360)
}

export function defaultFocalPx(imageWidth: number): number {
  return focalFromFov(imageWidth, DEFAULT_HORIZONTAL_FOV_DEGREES)
}

/** Aceita a focal da homografia só quando ela cai numa faixa física de câmera de celular. */
function resolveFocal(
  imageWidth: number,
  declaredFocalPx: number | undefined,
  estimated: number | undefined,
): { focalPx: number; focalSource: FocalSource } {
  if (declaredFocalPx) return { focalPx: declaredFocalPx, focalSource: 'homography' }
  const minimum = focalFromFov(imageWidth, MAX_PLAUSIBLE_FOV_DEGREES)
  const maximum = focalFromFov(imageWidth, MIN_PLAUSIBLE_FOV_DEGREES)
  if (estimated && estimated >= minimum && estimated <= maximum)
    return { focalPx: estimated, focalSource: 'homography' }
  return { focalPx: defaultFocalPx(imageWidth), focalSource: 'defaultFov' }
}

export function measureBox(input: BoxMeasurementInput): BoxMeasurementResult {
  const sideMm = input.markerSideMm ?? MARKER_SIDE_MM
  const objectPoints = markerObjectPoints(sideMm)
  const planeToImage = computeHomography(objectPoints, input.markerCorners)
  const imageToPlane = invertMatrix3(planeToImage)
  const face = input.facePoints.map((point) => applyHomography(imageToPlane, point))
  const [a, b, c, d] = face as [Point, Point, Point, Point]
  const sideOne = (distance(a, b) + distance(d, c)) / 2
  const sideTwo = (distance(b, c) + distance(a, d)) / 2
  const principal = { x: input.imageWidth / 2, y: input.imageHeight / 2 }
  const { focalPx, focalSource } = resolveFocal(
    input.imageWidth,
    input.focalPx,
    estimateFocalFromHomography(planeToImage, principal),
  )
  const pose = recoverPose(planeToImage, focalPx, principal)
  const heightMm = measureVerticalEdge(pose, a, input.footPoint)
  const reprojection = objectPoints.map((point, index) =>
    distance(projectPoint(pose, [point.x, point.y, 0]), input.markerCorners[index] as Point),
  )
  const markerSidePx =
    input.markerCorners.reduce(
      (sum, corner, index) =>
        sum + distance(corner, input.markerCorners[(index + 1) % MARKER_CORNER_COUNT] as Point),
      0,
    ) / MARKER_CORNER_COUNT
  return {
    lengthMm: Math.max(sideOne, sideTwo),
    widthMm: Math.min(sideOne, sideTwo),
    heightMm,
    focalPx,
    focalSource,
    reprojectionErrorPx: Math.sqrt(
      reprojection.reduce((sum, value) => sum + value * value, 0) / MARKER_CORNER_COUNT,
    ),
    viewAngleDegrees: viewAngleDegrees(pose),
    markerSidePx,
  }
}

/** Ângulo de visão só com o marcador, para o indicador ao vivo (antes de marcar os pontos). */
export function estimateMarkerView(
  markerCorners: readonly Point[],
  imageWidth: number,
  imageHeight: number,
): { viewAngleDegrees: number; focalSource: FocalSource } {
  const planeToImage = computeHomography(markerObjectPoints(MARKER_SIDE_MM), markerCorners)
  const principal = { x: imageWidth / 2, y: imageHeight / 2 }
  const { focalPx, focalSource } = resolveFocal(
    imageWidth,
    undefined,
    estimateFocalFromHomography(planeToImage, principal),
  )
  return {
    viewAngleDegrees: viewAngleDegrees(recoverPose(planeToImage, focalPx, principal)),
    focalSource,
  }
}

export type RandomSource = () => number

/** Mulberry32: semente injetada deixa o Monte Carlo reproduzível entre duas leituras e no teste. */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(random: RandomSource): number {
  const first = Math.max(random(), Number.EPSILON)
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random())
}

function jitter(point: Point, sigma: number, random: RandomSource): Point {
  return { x: point.x + gaussian(random) * sigma, y: point.y + gaussian(random) * sigma }
}

export type MarginOptions = {
  readonly samples?: number
  readonly random?: RandomSource
  readonly touchSigmaPx?: number
  readonly cornerSigmaFloorPx?: number
}

export type BoxMargins = {
  readonly lengthMarginMm: number
  readonly widthMarginMm: number
  readonly heightMarginMm: number
}

export function printFloorMm(dimensionMm: number): number {
  return PRINT_FLOOR_MM + PRINT_SCALE_TOLERANCE * Math.abs(dimensionMm)
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1),
  )
}

function perturb(
  input: BoxMeasurementInput,
  nominal: BoxMeasurementResult,
  cornerSigma: number,
  touchSigma: number,
  random: RandomSource,
): BoxMeasurementInput {
  const focalPx =
    nominal.focalSource === 'defaultFov'
      ? nominal.focalPx * (1 + gaussian(random) * FALLBACK_FOCAL_RELATIVE_SIGMA)
      : undefined
  const facePoints = input.facePoints.map((point) => jitter(point, touchSigma, random)) as [
    Point,
    Point,
    Point,
    Point,
  ]
  return {
    ...input,
    markerCorners: input.markerCorners.map((corner) => jitter(corner, cornerSigma, random)),
    facePoints,
    footPoint: jitter(input.footPoint, touchSigma, random),
    ...(focalPx ? { focalPx } : {}),
  }
}

/** D7: `m = 2σ + piso de impressão`, com σ vindo da perturbação dos cantos do marcador e dos toques. */
export function estimateMargins(
  input: BoxMeasurementInput,
  nominal: BoxMeasurementResult,
  options: MarginOptions = {},
): BoxMargins {
  const random = options.random ?? createSeededRandom(MONTE_CARLO_SEED)
  const samples = options.samples ?? MONTE_CARLO_SAMPLES
  const touchSigma = options.touchSigmaPx ?? TOUCH_SIGMA_PX
  const floor = options.cornerSigmaFloorPx ?? CORNER_SIGMA_FLOOR_PX
  const cornerSigma = Math.hypot(floor, nominal.reprojectionErrorPx)
  const lengths: number[] = []
  const widths: number[] = []
  const heights: number[] = []
  for (let sample = 0; sample < samples; sample += 1) {
    try {
      const result = measureBox(perturb(input, nominal, cornerSigma, touchSigma, random))
      lengths.push(result.lengthMm)
      widths.push(result.widthMm)
      heights.push(result.heightMm)
    } catch {
      // amostra degenerada (sistema singular) não entra na estatística
    }
  }
  return {
    lengthMarginMm: 2 * standardDeviation(lengths) + printFloorMm(nominal.lengthMm),
    widthMarginMm: 2 * standardDeviation(widths) + printFloorMm(nominal.widthMm),
    heightMarginMm: 2 * standardDeviation(heights) + printFloorMm(nominal.heightMm),
  }
}

export type MeasurementReliability = 'reliable' | 'imprecise' | 'unreliable'

export function classifyMargin(marginMm: number): MeasurementReliability {
  if (marginMm <= MARGIN_RELIABLE_MM) return 'reliable'
  if (marginMm <= MARGIN_UNRELIABLE_MM) return 'imprecise'
  return 'unreliable'
}

export type MeasurementClassification = {
  readonly length: MeasurementReliability
  readonly width: MeasurementReliability
  readonly height: MeasurementReliability
  readonly worst: MeasurementReliability
  readonly requiresConfirmation: boolean
  readonly filled: Readonly<Record<BoxDimensionKey, boolean>>
}

const RELIABILITY_ORDER: readonly MeasurementReliability[] = ['reliable', 'imprecise', 'unreliable']

/** D6: acima de `MARGIN_UNRELIABLE_MM` a dimensão fica vazia; na faixa do meio, gravar pede confirmação. */
export function classifyMeasurement(margins: BoxMargins): MeasurementClassification {
  const length = classifyMargin(margins.lengthMarginMm)
  const width = classifyMargin(margins.widthMarginMm)
  const height = classifyMargin(margins.heightMarginMm)
  const all = [length, width, height]
  const worst = all.reduce((left, right) =>
    RELIABILITY_ORDER.indexOf(right) > RELIABILITY_ORDER.indexOf(left) ? right : left,
  )
  return {
    length,
    width,
    height,
    worst,
    requiresConfirmation: all.includes('imprecise'),
    filled: {
      length: length !== 'unreliable',
      width: width !== 'unreliable',
      height: height !== 'unreliable',
    },
  }
}
