/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CanhotoSupportedMediaType } from '../domain/canhoto-read.constant.js'

export type DecodeCanhotoBarcodeParams = Readonly<{
  bytes: Uint8Array
  mediaType: CanhotoSupportedMediaType
}>

/** `null` é "olhou a foto e não achou código" — nunca falha; estouro de prazo rejeita com `CanhotoDecodeTimeoutError`. */
export type CanhotoBarcodeDecoderPort = Readonly<{
  decode: (params: DecodeCanhotoBarcodeParams) => Promise<string | null>
}>
