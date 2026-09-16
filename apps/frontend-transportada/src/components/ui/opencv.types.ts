/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Tipo mínimo do build próprio do OpenCV (ADR-0065 §3): só as funções da whitelist de
 * `deploy/opencv-build/opencv_js.config.py` (`cvtColor`, `meanStdDev`, `Laplacian` e o aruco) que o
 * worker de medida usa. O artefato não traz `.d.ts` — declarar aqui é mais barato que gerar os
 * bindings inteiros do Emscripten para um punhado de chamadas.
 */
export type OpenCvMat = Readonly<{
  rows: number
  cols: number
  data32F?: Float32Array
  data64F?: Float64Array
  delete: () => void
}>

export type OpenCvMatVector = Readonly<{
  size: () => number
  get: (index: number) => OpenCvMat
  delete: () => void
}>

export type OpenCvArucoDictionary = Readonly<{ readonly brand?: 'aruco-dictionary' }>
export type OpenCvArucoDetectorParameters = Readonly<{ readonly brand?: 'aruco-parameters' }>

export type OpenCvArucoDetector = Readonly<{
  detectMarkers: (image: OpenCvMat, corners: OpenCvMatVector, ids: OpenCvMat) => void
  delete: () => void
}>

export type OpenCvImageSource = Readonly<{ data: Uint8ClampedArray; width: number; height: number }>

export type OpenCvModule = Readonly<{
  Mat: new () => OpenCvMat
  MatVector: new () => OpenCvMatVector
  matFromImageData: (imageData: OpenCvImageSource) => OpenCvMat
  cvtColor: (source: OpenCvMat, destination: OpenCvMat, code: number) => void
  Laplacian: (source: OpenCvMat, destination: OpenCvMat, depth: number) => void
  meanStdDev: (source: OpenCvMat, mean: OpenCvMat, stddev: OpenCvMat) => void
  getPredefinedDictionary: (name: number) => OpenCvArucoDictionary
  aruco_ArucoDetector: new (
    dictionary: OpenCvArucoDictionary,
    parameters: OpenCvArucoDetectorParameters,
  ) => OpenCvArucoDetector
  aruco_DetectorParameters: new () => OpenCvArucoDetectorParameters
  COLOR_RGBA2GRAY: number
  CV_64F: number
  DICT_4X4_50: number
}>
