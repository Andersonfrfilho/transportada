/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 S6: toda foto do canhoto abre aqui — teto de pixels antes de decodificar (o cabeçalho diz o tamanho) e
 * arquivo corrompido falha em vez de virar meia imagem.
 */
import sharp from 'sharp'

import { CANHOTO_OCR_MAX_INPUT_PIXELS } from '../domain/canhoto-ocr.constant.js'

export function openCanhotoImage(bytes: Uint8Array): sharp.Sharp {
  return sharp(bytes, { failOn: 'error', limitInputPixels: CANHOTO_OCR_MAX_INPUT_PIXELS })
}
