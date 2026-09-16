/* Copyright (c) 2026 Ada Technology. MIT License. */
import { MARKER_CORNER_COUNT } from './boxDimension.constant'
import type { Point } from './boxDimensionGeometry.service'
import type { FrameStats } from './boxDimensionWarnings.service'
import type { OpenCvModule } from './opencv.types'

type OpenCvGlobal = Readonly<{ cv?: Promise<OpenCvModule> | OpenCvModule }>
type OpenCvArtifactNamespace = Readonly<{ default?: Promise<OpenCvModule> | OpenCvModule }>

export type BoxDimensionWorkerRequest =
  | Readonly<{ kind: 'preload' }>
  | Readonly<{
      kind: 'frame'
      width: number
      height: number
      rgba: Uint8ClampedArray
      previousMarkerCorners?: readonly Point[]
    }>

export type BoxDimensionEngineFailureReason = 'engineFailed'

export type BoxDimensionWorkerResponse =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'error'; reason: BoxDimensionEngineFailureReason }>
  | Readonly<{
      kind: 'frame-result'
      frameStats: FrameStats
      markerCorners: readonly Point[] | undefined
      elapsedMs: number
    }>

type WorkerScope = {
  onmessage: ((event: Readonly<{ data: BoxDimensionWorkerRequest }>) => void) | null
  postMessage: (message: BoxDimensionWorkerResponse, transfer?: readonly Transferable[]) => void
}

const scope = self as unknown as WorkerScope

let cvPromise: Promise<OpenCvModule> | undefined

/**
 * Só este arquivo importa o OpenCV (ADR-0065 §3, `test/shared/opencv-build.contract.ts`). O
 * `import()` é literal e dinâmico: literal para o Vite achar o módulo em tempo de build e emitir o
 * chunk próprio (`vite.config.ts`, `assets/opencv-*.js`), dinâmico para só baixar no primeiro
 * `preload`/`frame` — o build próprio nunca entra no chunk inicial. Caminho relativo, nunca URL de
 * origem opaca, e o worker nasce por `new URL(...)` (`useBoxDimensionScanner.hook.ts`), da própria
 * origem — `worker-src 'self'` já cobre.
 *
 * O wrapper UMD (ADR-0065 §3) resolve de dois jeitos, e o worker aceita os dois: empacotado pelo
 * Rollup, `module.exports = factory()` vira `.default`; carregado cru (dev, sem bundler), o UMD
 * cai no ramo de navegador/worker e atribui a `globalThis.cv` (sonda da T1 confirmou os dois).
 */
function loadOpenCv(): Promise<OpenCvModule> {
  if (cvPromise === undefined) {
    cvPromise = (async () => {
      const namespace = (await import(
        '../../../vendor/opencv/opencv.js'
      )) as OpenCvArtifactNamespace
      const candidate = namespace.default ?? (globalThis as unknown as OpenCvGlobal).cv
      if (candidate === undefined) throw new Error('OPENCV_ARTIFACT_EXPORT_NOT_FOUND')
      return candidate
    })()
  }
  return cvPromise
}

function detectMarkerCorners(
  cv: OpenCvModule,
  gray: InstanceType<OpenCvModule['Mat']>,
): readonly Point[] | undefined {
  const dictionary = cv.getPredefinedDictionary(cv.DICT_4X4_50)
  const parameters = new cv.aruco_DetectorParameters()
  // O construtor do build próprio exige os 3 parâmetros (sonda T9,
  // `specs/152-medir-caixa-pela-camera/evidence.md` § T9): sem o terceiro, `BindingError`.
  const refineParameters = new cv.aruco_RefineParameters(10, 3, true)
  const detector = new cv.aruco_ArucoDetector(dictionary, parameters, refineParameters)
  const corners = new cv.MatVector()
  const ids = new cv.Mat()
  try {
    detector.detectMarkers(gray, corners, ids)
    if (ids.rows === 0 || corners.size() === 0) return undefined
    const cornerMat = corners.get(0)
    const data = cornerMat.data32F
    if (data === undefined || data.length < MARKER_CORNER_COUNT * 2) return undefined
    const points: Point[] = []
    for (let index = 0; index < MARKER_CORNER_COUNT; index += 1) {
      points.push({ x: data[index * 2] ?? 0, y: data[index * 2 + 1] ?? 0 })
    }
    return points
  } finally {
    corners.delete()
    ids.delete()
    detector.delete()
  }
}

function meanAndStdDev(
  cv: OpenCvModule,
  source: InstanceType<OpenCvModule['Mat']>,
): { mean: number; stdDev: number } {
  const mean = new cv.Mat()
  const stdDev = new cv.Mat()
  try {
    cv.meanStdDev(source, mean, stdDev)
    return { mean: mean.data64F?.[0] ?? 0, stdDev: stdDev.data64F?.[0] ?? 0 }
  } finally {
    mean.delete()
    stdDev.delete()
  }
}

function computeFrameStats(
  cv: OpenCvModule,
  gray: InstanceType<OpenCvModule['Mat']>,
  width: number,
  height: number,
  markerCorners: readonly Point[] | undefined,
  previousMarkerCorners: readonly Point[] | undefined,
): FrameStats {
  const luminance = meanAndStdDev(cv, gray)
  const laplacian = new cv.Mat()
  let sharpness = { mean: 0, stdDev: 0 }
  try {
    cv.Laplacian(gray, laplacian, cv.CV_64F)
    sharpness = meanAndStdDev(cv, laplacian)
  } finally {
    laplacian.delete()
  }
  return {
    height,
    laplacianVariance: sharpness.stdDev * sharpness.stdDev,
    luminanceContrast: luminance.stdDev,
    meanLuminance: luminance.mean,
    width,
    // `exactOptionalPropertyTypes`: uma chave opcional ausente é diferente de `undefined` explícito.
    ...(markerCorners === undefined ? {} : { markerCorners }),
    ...(previousMarkerCorners === undefined ? {} : { previousMarkerCorners }),
  }
}

async function preload(): Promise<void> {
  try {
    await loadOpenCv()
    scope.postMessage({ kind: 'ready' })
  } catch {
    scope.postMessage({ kind: 'error', reason: 'engineFailed' })
  }
}

async function handleFrame(
  message: Extract<BoxDimensionWorkerRequest, { kind: 'frame' }>,
): Promise<void> {
  const startedAt = performance.now()
  try {
    const cv = await loadOpenCv()
    const source = cv.matFromImageData({
      data: message.rgba,
      height: message.height,
      width: message.width,
    })
    const gray = new cv.Mat()
    try {
      cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
      const markerCorners = detectMarkerCorners(cv, gray)
      const frameStats = computeFrameStats(
        cv,
        gray,
        message.width,
        message.height,
        markerCorners,
        message.previousMarkerCorners,
      )
      scope.postMessage({
        elapsedMs: performance.now() - startedAt,
        frameStats,
        kind: 'frame-result',
        markerCorners,
      })
    } finally {
      source.delete()
      gray.delete()
    }
  } catch {
    scope.postMessage({ kind: 'error', reason: 'engineFailed' })
  }
}

scope.onmessage = (event) => {
  if (event.data.kind === 'preload') {
    void preload()
    return
  }
  void handleFrame(event.data)
}
