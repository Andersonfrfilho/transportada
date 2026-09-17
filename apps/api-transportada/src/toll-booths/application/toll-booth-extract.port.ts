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

export type TollBoothExtractPort = Readonly<{
  /** `(dataset, observedOn)` duplicado lança `TollBoothExtractDuplicateError` (spec 154 D10). */
  create: (input: CreateTollBoothExtractRowInput) => Promise<TollBoothExtractRow>
  /** Do mais novo para o mais antigo — RF3 nunca devolve em ordem de inserção. */
  list: () => Promise<readonly TollBoothExtractRow[]>
}>

export type PutExtractObjectInput = Readonly<{
  body: Uint8Array
  contentLength: number
  key: string
  sha256: string
}>

export type PutExtractObjectResult = Readonly<{ disposition: 'created' | 'replayed' }>

export type TollBoothExtractStoragePort = Readonly<{
  /** `create-only`: conteúdo diferente na mesma chave lança `TollBoothExtractObjectConflictError`. */
  putCreateOnly: (input: PutExtractObjectInput) => Promise<PutExtractObjectResult>
}>
