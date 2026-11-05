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
/** O prazo de uma leitura; a carga dos modelos tem prazo próprio (abaixo) e nunca conta aqui. */
export const CANHOTO_OCR_DEFAULT_TIMEOUT_MILLISECONDS = 30_000
/** Spec 294 C6: a carga dos modelos ao subir a thread; até ela terminar, toda leitura é `busy`. */
export const CANHOTO_OCR_READY_TIMEOUT_MILLISECONDS = 120_000
/**
 * Spec 294 S7: uma lendo e uma esperando, no máximo — e uma por empresa. O resto é `busy` na hora, e a API pergunta "De
 * qual nota é este canhoto?". O prazo da API (`worker-canhoto-reader.gateway.ts`) cobre estas duas leituras.
 */
export const CANHOTO_OCR_MAX_PENDING = 2
/** Spec 294 S6: 40 MP decodificados são ~120 MB; foto de celular tem 12–50 MP, e o teto barra a bomba de pixels. */
export const CANHOTO_OCR_MAX_INPUT_PIXELS = 40_000_000
export const CANHOTO_OCR_MODEL_FILES = {
  detector: 'ch_PP-OCRv4_det_infer.onnx',
  dictionary: 'ppocr_keys_v1.txt',
  recognizer: 'ch_PP-OCRv4_rec_infer.onnx',
} as const
