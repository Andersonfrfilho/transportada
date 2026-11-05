/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const CNH_FACE_OUTCOMES = {
  EXTRACTED: 'extracted',
  MULTIPLE_FACES: 'multiple_faces',
  NO_FACE: 'no_face',
  TOO_SMALL: 'too_small',
  UNSUPPORTED: 'unsupported',
} as const

export const CNH_SOURCE_KINDS = {
  IMAGE: 'image',
  PDF_DIGITAL: 'pdf_digital',
  PDF_SCANNED: 'pdf_scanned',
  UNKNOWN: 'unknown',
} as const

/** Medidos no spike 295 (T4.1): UltraFace RFB-320 recebe 320x240 e devolve nota de rosto por âncora. */
export const CNH_FACE_DETECTOR_WIDTH = 320
export const CNH_FACE_DETECTOR_HEIGHT = 240
export const CNH_FACE_CANDIDATE_SCORE = 0.7
export const CNH_FACE_NMS_IOU_THRESHOLD = 0.3
/** Imagem menor que isto no PDF é brasão ou QR, nunca o cartão. */
export const CNH_MIN_SOURCE_IMAGE_SIDE = 200
export const CNH_OUTPUT_MAX_SIDE = 512
export const CNH_OUTPUT_WEBP_QUALITY = 82
export const PDF_SIGNATURE = '%PDF'

/** Decisão do dono (spec 295 Fase 4): só aplica com rosto único, nota alta e recorte utilizável como avatar. */
export const CNH_FACE_ACCEPTANCE_MIN_SCORE = 0.98
export const CNH_FACE_ACCEPTANCE_MIN_SHORT_SIDE = 120

export const CNH_FACE_MODEL_SHA256 =
  '34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017'
