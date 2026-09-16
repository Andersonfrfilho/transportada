/* Copyright (c) 2026 Ada Technology. MIT License. */
import { SINGULAR_MATRIX_EPSILON, SINGULAR_SYSTEM_EPSILON } from './boxDimension.constant'

export type Point = { readonly x: number; readonly y: number }
export type Vector3 = readonly [number, number, number]
// prettier-ignore
export type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
]

export type CameraPose = {
  readonly focalPx: number
  readonly principal: Point
  readonly rotation: Matrix3
  readonly translation: Vector3
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0])
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]?.[pivot] ?? 0) > Math.abs(augmented[best]?.[pivot] ?? 0))
        best = row
    }
    const swap = augmented[pivot] as number[]
    augmented[pivot] = augmented[best] as number[]
    augmented[best] = swap
    const pivotRow = augmented[pivot] as number[]
    const pivotValue = pivotRow[pivot] ?? 0
    if (Math.abs(pivotValue) < SINGULAR_SYSTEM_EPSILON) throw new Error('singular system')
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const current = augmented[row] as number[]
      const factor = (current[pivot] ?? 0) / pivotValue
      for (let column = pivot; column <= size; column += 1) {
        current[column] = (current[column] ?? 0) - factor * (pivotRow[column] ?? 0)
      }
    }
  }
  return augmented.map((row, index) => (row[size] ?? 0) / (row[index] ?? 1))
}

export function computeHomography(source: readonly Point[], target: readonly Point[]): Matrix3 {
  const matrix: number[][] = []
  const vector: number[] = []
  source.forEach((from, index) => {
    const to = target[index] as Point
    matrix.push([from.x, from.y, 1, 0, 0, 0, -to.x * from.x, -to.x * from.y])
    vector.push(to.x)
    matrix.push([0, 0, 0, from.x, from.y, 1, -to.y * from.x, -to.y * from.y])
    vector.push(to.y)
  })
  const [a, b, c, d, e, f, g, h] = solveLinearSystem(matrix, vector) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  return [a, b, c, d, e, f, g, h, 1]
}

export function applyHomography(homography: Matrix3, point: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = homography
  const w = g * point.x + h * point.y + i
  return { x: (a * point.x + b * point.y + c) / w, y: (d * point.x + e * point.y + f) / w }
}

export function invertMatrix3(matrix: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = matrix
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(determinant) < SINGULAR_MATRIX_EPSILON) throw new Error('singular matrix')
  const inverse = 1 / determinant
  return [
    (e * i - f * h) * inverse,
    (c * h - b * i) * inverse,
    (b * f - c * e) * inverse,
    (f * g - d * i) * inverse,
    (a * i - c * g) * inverse,
    (c * d - a * f) * inverse,
    (d * h - e * g) * inverse,
    (b * g - a * h) * inverse,
    (a * e - b * d) * inverse,
  ]
}

export function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector)
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

function centerHomography(homography: Matrix3, principal: Point): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = homography
  return [
    a - principal.x * g,
    b - principal.x * h,
    c - principal.x * i,
    d - principal.y * g,
    e - principal.y * h,
    f - principal.y * i,
    g,
    h,
    i,
  ]
}

/** Plano → imagem com o ponto principal na origem: as colunas h1, h2 dão f² (Zhang, pixel quadrado). */
export function estimateFocalFromHomography(
  homography: Matrix3,
  principal: Point,
): number | undefined {
  const centered = centerHomography(homography, principal)
  const [h11, h12, , h21, h22, , h31, h32] = centered
  const orthogonality = -(h11 * h12 + h21 * h22) / (h31 * h32)
  const equalNorm = (h11 * h11 + h21 * h21 - (h12 * h12 + h22 * h22)) / (h32 * h32 - h31 * h31)
  const candidates = [orthogonality, equalNorm].filter(
    (value) => Number.isFinite(value) && value > 0,
  )
  if (candidates.length === 0) return undefined
  return Math.sqrt(candidates.reduce((sum, value) => sum + value, 0) / candidates.length)
}

export function recoverPose(homography: Matrix3, focalPx: number, principal: Point): CameraPose {
  const [a, b, c, d, e, f, g, h, i] = centerHomography(homography, principal)
  const column1: Vector3 = [a / focalPx, d / focalPx, g]
  const column2: Vector3 = [b / focalPx, e / focalPx, h]
  const column3: Vector3 = [c / focalPx, f / focalPx, i]
  const scale = 2 / (Math.hypot(...column1) + Math.hypot(...column2))
  const sign = column3[2] * scale < 0 ? -1 : 1
  const rawX: Vector3 = [
    column1[0] * scale * sign,
    column1[1] * scale * sign,
    column1[2] * scale * sign,
  ]
  const rawY: Vector3 = [
    column2[0] * scale * sign,
    column2[1] * scale * sign,
    column2[2] * scale * sign,
  ]
  const axisX = normalize(rawX)
  const axisZ = normalize(cross(axisX, rawY))
  const axisY = cross(axisZ, axisX)
  return {
    focalPx,
    principal,
    rotation: [
      axisX[0],
      axisY[0],
      axisZ[0],
      axisX[1],
      axisY[1],
      axisZ[1],
      axisX[2],
      axisY[2],
      axisZ[2],
    ],
    translation: [column3[0] * scale * sign, column3[1] * scale * sign, column3[2] * scale * sign],
  }
}

export function projectPoint(pose: CameraPose, world: Vector3): Point {
  const r = pose.rotation
  const cameraX = r[0] * world[0] + r[1] * world[1] + r[2] * world[2] + pose.translation[0]
  const cameraY = r[3] * world[0] + r[4] * world[1] + r[5] * world[2] + pose.translation[1]
  const cameraZ = r[6] * world[0] + r[7] * world[1] + r[8] * world[2] + pose.translation[2]
  return {
    x: pose.principal.x + (pose.focalPx * cameraX) / cameraZ,
    y: pose.principal.y + (pose.focalPx * cameraY) / cameraZ,
  }
}

/** Ângulo entre o eixo óptico e a normal do plano do marcador, em graus. */
export function viewAngleDegrees(pose: CameraPose): number {
  const normalInCamera: Vector3 = [pose.rotation[2], pose.rotation[5], pose.rotation[8]]
  return (Math.acos(Math.min(1, Math.abs(dot(normalInCamera, [0, 0, 1])))) * 180) / Math.PI
}

/** Altura: aproximação mais próxima entre a reta vertical que desce do canto do topo e o raio do pé. */
export function measureVerticalEdge(pose: CameraPose, topCorner: Point, footPixel: Point): number {
  const r = pose.rotation
  const t = pose.translation
  const cameraCenter: Vector3 = [
    -(r[0] * t[0] + r[3] * t[1] + r[6] * t[2]),
    -(r[1] * t[0] + r[4] * t[1] + r[7] * t[2]),
    -(r[2] * t[0] + r[5] * t[1] + r[8] * t[2]),
  ]
  const rayCamera: Vector3 = [
    (footPixel.x - pose.principal.x) / pose.focalPx,
    (footPixel.y - pose.principal.y) / pose.focalPx,
    1,
  ]
  const rayWorld: Vector3 = [
    r[0] * rayCamera[0] + r[3] * rayCamera[1] + r[6] * rayCamera[2],
    r[1] * rayCamera[0] + r[4] * rayCamera[1] + r[7] * rayCamera[2],
    r[2] * rayCamera[0] + r[5] * rayCamera[1] + r[8] * rayCamera[2],
  ]
  const lineDirection: Vector3 = [0, 0, 1]
  const offset: Vector3 = [
    topCorner.x - cameraCenter[0],
    topCorner.y - cameraCenter[1],
    -cameraCenter[2],
  ]
  const a = dot(lineDirection, lineDirection)
  const b = dot(lineDirection, rayWorld)
  const c = dot(rayWorld, rayWorld)
  const d = dot(lineDirection, offset)
  const e = dot(rayWorld, offset)
  const denominator = a * c - b * b
  if (Math.abs(denominator) < SINGULAR_SYSTEM_EPSILON)
    throw new Error('vertical edge parallel to the view ray')
  return (b * e - c * d) / denominator
}
