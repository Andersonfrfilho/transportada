/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FaceBox, RawImage } from '../domain/cnh-face.types.js'

const PORTRAIT_WIDTH_PER_FACE = 1.7
const PORTRAIT_ASPECT = 4 / 3
const FACE_CENTER_HEIGHT_RATIO = 0.45

/** Retrato 3:4 com folga para cabelo e ombro, recortado ao limite da imagem. */
export function portraitCropAround(face: FaceBox, image: RawImage) {
  const faceWidth = face.x2 - face.x1
  const faceHeight = face.y2 - face.y1
  const width = Math.min(image.width, faceWidth * PORTRAIT_WIDTH_PER_FACE)
  const height = Math.min(image.height, width * PORTRAIT_ASPECT)
  const centerX = (face.x1 + face.x2) / 2
  const centerY = face.y1 + faceHeight * FACE_CENTER_HEIGHT_RATIO
  const left = Math.max(0, Math.min(image.width - width, centerX - width / 2))
  const top = Math.max(0, Math.min(image.height - height, centerY - height / 2))
  return {
    height: Math.floor(height),
    left: Math.round(left),
    top: Math.round(top),
    width: Math.floor(width),
  }
}
