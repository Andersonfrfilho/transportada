/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TollBoothExtractRow } from '../domain/toll-booth-extract.policy.js'

export type CreateTollBoothExtractRowInput = Readonly<{
  boothCount: number
  boothsWithAxleCharge: number
  boothsWithCharge: number
  dataset: string
  objectKey: string
  observedOn: string
  sha256: string
  uploadedByUserId: string
}>

export type TollBoothExtractKey = Readonly<{ dataset: string; observedOn: string }>

export type TollBoothExtractPort = Readonly<{
  /** `(dataset, observedOn)` duplicado lança `TollBoothExtractDuplicateError` (spec 154 D10). */
  create: (input: CreateTollBoothExtractRowInput) => Promise<TollBoothExtractRow>
  find: (key: TollBoothExtractKey) => Promise<TollBoothExtractRow | undefined>
  /** Do mais novo para o mais antigo — RF3 nunca devolve em ordem de inserção. */
  list: () => Promise<readonly TollBoothExtractRow[]>
  /** Observação datada fora da transação da recarga: `missing_object_observed_at = now()`. */
  markObjectMissing: (key: TollBoothExtractKey) => Promise<void>
}>

export type PutExtractObjectInput = Readonly<{
  body: Uint8Array
  contentLength: number
  key: string
  sha256: string
}>

export type PutExtractObjectResult = Readonly<{ disposition: 'created' | 'replayed' }>

export type ReadExtractObjectInput = Readonly<{ key: string; maxBytes: number }>

export type TollBoothExtractStoragePort = Readonly<{
  /** Só o `head` distingue objeto ausente (`undefined`) de storage fora — o `get` responde `unavailable` aos dois. */
  head: (key: string) => Promise<Readonly<{ contentLength: number }> | undefined>
  /** `create-only`: conteúdo diferente na mesma chave lança `TollBoothExtractObjectConflictError`. */
  putCreateOnly: (input: PutExtractObjectInput) => Promise<PutExtractObjectResult>
  /** Bytes crus; passar de `maxBytes` lança `TollBoothExtractIntegrityError` sem ler o resto. */
  read: (input: ReadExtractObjectInput) => Promise<Uint8Array>
}>
