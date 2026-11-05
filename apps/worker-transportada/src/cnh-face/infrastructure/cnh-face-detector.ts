/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Detector UltraFace RFB-320 em `onnxruntime-web` (WASM): a imagem do worker é Alpine/musl e o
 * `onnxruntime-node` só traz binário glibc (spike 295 T4.1).
 */
import { readFile } from 'node:fs/promises'

import { env as onnxEnvironment, InferenceSession, Tensor } from 'onnxruntime-web'
import sharp from 'sharp'

import {
  CNH_FACE_CANDIDATE_SCORE,
  CNH_FACE_DETECTOR_HEIGHT,
  CNH_FACE_DETECTOR_WIDTH,
  CNH_FACE_NMS_IOU_THRESHOLD,
} from '../domain/cnh-face.constant.js'
import type { FaceBox, RawImage } from '../domain/cnh-face.types.js'

const CHANNELS = 3
const PIXEL_MEAN = 127
const PIXEL_SCALE = 128

export type CnhFaceDetector = Readonly<{ detect: (image: RawImage) => Promise<readonly FaceBox[]> }>

export async function createCnhFaceDetector(modelPath: string): Promise<CnhFaceDetector> {
  onnxEnvironment.wasm.numThreads = 1
  const session = await InferenceSession.create(new Uint8Array(await readFile(modelPath)), {
    executionProviders: ['wasm'],
    logSeverityLevel: 3,
  })

  return {
    async detect(image) {
      const output = await session.run({ input: await toInputTensor(image) })
      const scores = output.scores?.data as Float32Array
      const boxes = output.boxes?.data as Float32Array
      const candidates: FaceBox[] = []
      for (let index = 0; index < scores.length / 2; index += 1) {
        const score = scores[index * 2 + 1] ?? 0
        if (score < CNH_FACE_CANDIDATE_SCORE) continue
        candidates.push({
          score,
          x1: (boxes[index * 4] ?? 0) * image.width,
          x2: (boxes[index * 4 + 2] ?? 0) * image.width,
          y1: (boxes[index * 4 + 1] ?? 0) * image.height,
          y2: (boxes[index * 4 + 3] ?? 0) * image.height,
        })
      }
      return suppressOverlaps(candidates)
    },
  }
}

async function toInputTensor(image: RawImage): Promise<Tensor> {
  const resized = await sharp(image.rgb, {
    raw: { channels: CHANNELS, height: image.height, width: image.width },
  })
    .resize(CNH_FACE_DETECTOR_WIDTH, CNH_FACE_DETECTOR_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer()
  const planeSize = CNH_FACE_DETECTOR_WIDTH * CNH_FACE_DETECTOR_HEIGHT
  const input = new Float32Array(CHANNELS * planeSize)
  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      input[channel * planeSize + pixel] =
        ((resized[pixel * CHANNELS + channel] ?? 0) - PIXEL_MEAN) / PIXEL_SCALE
    }
  }
  return new Tensor('float32', input, [
    1,
    CHANNELS,
    CNH_FACE_DETECTOR_HEIGHT,
    CNH_FACE_DETECTOR_WIDTH,
  ])
}

function suppressOverlaps(candidates: readonly FaceBox[]): FaceBox[] {
  const kept: FaceBox[] = []
  for (const candidate of [...candidates].sort((first, second) => second.score - first.score)) {
    if (kept.every((face) => intersectionOverUnion(face, candidate) < CNH_FACE_NMS_IOU_THRESHOLD)) {
      kept.push(candidate)
    }
  }
  return kept
}

function intersectionOverUnion(first: FaceBox, second: FaceBox): number {
  const width = Math.max(0, Math.min(first.x2, second.x2) - Math.max(first.x1, second.x1))
  const height = Math.max(0, Math.min(first.y2, second.y2) - Math.max(first.y1, second.y1))
  const intersection = width * height
  const area = (box: FaceBox): number => (box.x2 - box.x1) * (box.y2 - box.y1)
  return intersection / (area(first) + area(second) - intersection)
}
