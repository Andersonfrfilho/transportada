/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Marcas impressas na parte destacável do canhoto (spike 294 T4.8b); variantes sem acento, em maiúsculas. */
export const CANHOTO_OCR_MARKERS = {
  nfeSeries: ['SERIE'],
  productsListed: ['PRODUTOS CONSTANTES', 'CONSTANTES DA NOTA'],
  receiptDate: ['DATA DE RECEBIMENTO'],
  receivedFrom: ['RECEBEMOS DE'],
  signature: ['ASSINATURA DO RECEBEDOR', 'IDENTIFICACAO E ASSINATURA'],
} as const

/** Menos dígitos que isto é ruído (CEP parcial, data, série), nunca número de nota. */
export const CANHOTO_OCR_MIN_DIGITS = 3
/** Casamento aproximado (distância de edição 1) só vale para número com pelo menos isto de dígitos. */
export const CANHOTO_OCR_NEAR_MIN_DIGITS = 5
export const CANHOTO_OCR_NEAR_MAX_DISTANCE = 1

/** Um canhoto lido é uma foto de celular reduzida ao lado maior (spike: 1600 px, três passadas no máximo). */
export const CANHOTO_OCR_LONG_SIDE = 1600
/** Foto de 12 MP em memória decodificada passa de 40 MB: o teto é de entrada, igual ao do intake do grupo. */
export const CANHOTO_OCR_MAX_IMAGE_BYTES = 12 * 1024 * 1024
/** Inclui a carga única dos modelos na primeira foto depois de a thread subir. */
export const CANHOTO_OCR_DEFAULT_TIMEOUT_MILLISECONDS = 30_000
export const CANHOTO_OCR_MODEL_FILES = {
  detector: 'ch_PP-OCRv4_det_infer.onnx',
  dictionary: 'ppocr_keys_v1.txt',
  recognizer: 'ch_PP-OCRv4_rec_infer.onnx',
} as const
