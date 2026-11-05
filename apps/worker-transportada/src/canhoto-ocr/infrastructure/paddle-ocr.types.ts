/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { InferenceSession, Tensor } from 'onnxruntime-web'

export type TextBox = Readonly<{
  angle: number
  score: number
  x0: number
  x1: number
  y0: number
  y1: number
}>
export type OcrLine = Readonly<{ box: TextBox; confidence: number; text: string }>
export type RawImage = Readonly<{ data: Buffer; height: number; width: number }>
export type OcrEngine = Readonly<{
  detector: InferenceSession
  dictionary: readonly string[]
  recognizer: InferenceSession
  tensor: (data: Float32Array, dims: readonly number[]) => Tensor
}>
