/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryProofProcessingState } from '../../database/delivery-proof-processing.schema.js'
import type { DeliveryProofProcessingErrorCode } from '../domain/delivery-proof-processing.constant.js'

export type StoredObjectRef = Readonly<{
  bucket: string
  mimeType: string
  objectId: string
  objectKey: string
  sizeBytes: number
}>

/** O comprovante como o tratamento o enxerga: estado, objetos e o que o canhoto precisa para ser lido. */
export type ProofToProcess = Readonly<{
  /** `trip_documents.id` e `trips.id` da nota sob a qual o canhoto foi gravado (para a leitura). */
  canhoto: Readonly<{ documentId: string; tripId: string }> | null
  /** O canhoto está na fila da máquina: `pending`, sem leitura e sem tentativa (a mesma fila da 222). */
  canhotoReadable: boolean
  /** Nulo quando o original já foi apagado (`ready`) ou o comprovante nunca teve um. */
  original: StoredObjectRef | null
  proofId: string
  state: DeliveryProofProcessingState | null
  stopEventId: string
  /** O objeto que a tela abre agora: igual ao original até a troca. */
  current: Readonly<{ objectId: string }>
  hasThumbnail: boolean
}>

export type NewProofObject = Readonly<{
  bucket: string
  mimeType: string
  objectId: string
  objectKey: string
  purpose: string
  sha256: string
  sizeBytes: number
}>

export type SwapToReducedParams = Readonly<{
  companyId: string
  originalObjectId: string
  proofId: string
  reduced: NewProofObject
  thumbnail: NewProofObject | null
}>

export type DeliveryProofProcessingRepositoryPort = Readonly<{
  /** Quando a troca já aconteceu (objeto atual ≠ original) e o resto é só a finalização. */
  load: (params: {
    readonly companyId: string
    readonly proofId: string
  }) => Promise<ProofToProcess | undefined>
  /** Sai de `received`/`processing`/`processing_failed` para `processing`, com o original ainda sendo o da linha. */
  markProcessing: (params: {
    readonly companyId: string
    readonly originalObjectId: string
    readonly proofId: string
  }) => Promise<boolean>
  /**
   * Grava os objetos novos e troca `object_id` (e a miniatura, se veio) **numa transação**, só enquanto a
   * linha segue `processing` e ainda não trocou. `false` é "outro tratamento ou recaptura chegou antes".
   */
  swapToReduced: (params: SwapToReducedParams) => Promise<boolean>
  /** Anula a referência ao original, fecha `ready` e marca o objeto do original como `deleted`. */
  finalizeReady: (params: {
    readonly companyId: string
    readonly originalObjectId: string
    readonly proofId: string
  }) => Promise<boolean>
  /** `processing_failed` com o código; o original e a referência a ele ficam como estão. */
  markFailed: (params: {
    readonly code: DeliveryProofProcessingErrorCode
    readonly companyId: string
    readonly originalObjectId: string
    readonly proofId: string
  }) => Promise<boolean>
}>

export type DeliveryProofObjectStoragePort = Readonly<{
  /** `undefined` quando o objeto não está lá; qualquer outra falha rejeita. */
  read: (params: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array | undefined>
  remove: (params: { readonly bucket: string; readonly key: string }) => Promise<void>
  store: (params: {
    readonly bucket: string
    readonly bytes: Uint8Array
    readonly key: string
    readonly mimeType: string
    readonly sha256: string
  }) => Promise<void>
}>
