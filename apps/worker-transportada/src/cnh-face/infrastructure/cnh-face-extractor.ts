/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import sharp from 'sharp'

import {
  CNH_FACE_OUTCOMES,
  CNH_FACE_ACCEPTANCE_MIN_SHORT_SIDE,
  CNH_OUTPUT_MAX_SIDE,
  CNH_OUTPUT_WEBP_QUALITY,
} from '../domain/cnh-face.constant.js'
import type { CnhFaceResult, FaceBox, RawImage } from '../domain/cnh-face.types.js'
import { portraitCropAround } from './cnh-face-crop.js'
import { createCnhFaceDetector } from './cnh-face-detector.js'
import { collectCandidateImages, rotationsOf } from './cnh-face-source-images.js'

type Detection = { readonly faces: readonly FaceBox[]; readonly image: RawImage }

export async function createCnhFaceExtractor(params: { readonly modelPath: string }) {
  const detector = await createCnhFaceDetector(params.modelPath)

  async function detectBestRotation(image: RawImage, sourceKind: CnhFaceResult['sourceKind']) {
    let best: Detection | undefined
    for (const rotated of await rotationsOf(image, sourceKind)) {
      const faces = await detector.detect(rotated)
      if ((faces[0]?.score ?? 0) > (best?.faces[0]?.score ?? 0)) best = { faces, image: rotated }
    }
    return best
  }

  async function extract(bytes: Uint8Array): Promise<CnhFaceResult> {
    const { images, sourceKind } = await collectCandidateImages(bytes)
    const base = { candidateImages: images.length, sourceKind }
    if (images.length === 0)
      return { ...base, facesFound: 0, outcome: CNH_FACE_OUTCOMES.UNSUPPORTED }

    const detections: Detection[] = []
    for (const image of images) {
      const best = await detectBestRotation(image, sourceKind)
      if (best !== undefined) detections.push(best)
    }
    const facesFound = detections.reduce((total, detection) => total + detection.faces.length, 0)
    const [detection] = detections.filter((entry) => entry.faces.length > 0)
    if (facesFound === 0 || detection === undefined) {
      return { ...base, facesFound, outcome: CNH_FACE_OUTCOMES.NO_FACE }
    }
    if (facesFound > 1) return { ...base, facesFound, outcome: CNH_FACE_OUTCOMES.MULTIPLE_FACES }

    return cropFace({ ...base, detection, facesFound })
  }

  return { extract }
}

async function cropFace(input: {
  readonly candidateImages: number
  readonly detection: Detection
  readonly facesFound: number
  readonly sourceKind: CnhFaceResult['sourceKind']
}): Promise<CnhFaceResult> {
  const { candidateImages, detection, facesFound, sourceKind } = input
  const { image } = detection
  const face = detection.faces[0] as FaceBox
  const crop = portraitCropAround(face, image)
  const cropShortSide = Math.min(crop.width, crop.height)
  const base = { candidateImages, cropShortSide, faceScore: face.score, facesFound, sourceKind }
  if (cropShortSide < CNH_FACE_ACCEPTANCE_MIN_SHORT_SIDE) {
    return { ...base, outcome: CNH_FACE_OUTCOMES.TOO_SMALL }
  }

  const webp = await sharp(image.rgb, {
    raw: { channels: 3, height: image.height, width: image.width },
  })
    .extract(crop)
    .resize(CNH_OUTPUT_MAX_SIDE, CNH_OUTPUT_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: CNH_OUTPUT_WEBP_QUALITY })
    .toBuffer()
  return { ...base, outcome: CNH_FACE_OUTCOMES.EXTRACTED, webp }
}
