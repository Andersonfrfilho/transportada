/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeliveryProofProcessingErrorCode,
  ProofSupportedMediaType,
} from '../domain/delivery-proof-processing.constant.js'

export type DeliveryProofImageParams = Readonly<{
  bytes: Uint8Array
  mediaType: ProofSupportedMediaType
  /** `false` quando o canhoto não está na fila de leitura (assinatura, foto da carga, já lido). */
  readBarcode: boolean
  /** `false` quando a linha já tem miniatura (a que o aparelho mandou). */
  withThumbnail: boolean
}>

export type DeliveryProofImageResult =
  | Readonly<{
      /** `null` é "olhei e não achei"; sem leitura pedida também vem `null`. */
      barcodeText: string | null
      kind: 'processed'
      reduced: Readonly<{ bytes: Uint8Array; height: number; width: number }>
      /** `null` quando a miniatura não coube no teto: ela nunca é condição do comprovante (220 RF19). */
      thumbnail: Readonly<{ bytes: Uint8Array }> | null
    }>
  | Readonly<{ code: DeliveryProofProcessingErrorCode; kind: 'rejected' }>

/**
 * Rejeição é fato do arquivo (corrompido, pixels demais, não cabe no teto) e não adianta repetir.
 * Falha de infraestrutura — módulo wasm que não carrega, thread que morre, prazo — **rejeita a
 * promessa**, e o trilho gasta as tentativas dele.
 */
export type DeliveryProofImagePort = Readonly<{
  process: (params: DeliveryProofImageParams) => Promise<DeliveryProofImageResult>
}>
