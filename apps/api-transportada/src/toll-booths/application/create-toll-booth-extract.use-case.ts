/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * RF3b — grava o objeto no bucket em `create-only` e só então registra a linha (D10). Os erros de
 * duplicidade (linha e objeto) são mapeados na camada de infraestrutura (`postgres-error.support`,
 * `toll-booth-extract-storage.gateway`) — este caso de uso não faz `try/catch` (code-standart §7).
 */
import { createHash } from 'node:crypto'

import {
  buildExtractObjectKey,
  summarizeTollBoothExtract,
  type TollBoothExtractRow,
  type TollBoothExtractRowInput,
} from '../domain/toll-booth-extract.policy.js'
import type {
  TollBoothExtractPort,
  TollBoothExtractStoragePort,
} from './toll-booth-extract.port.js'

export type CreateTollBoothExtractInput = Readonly<{
  actorUserId: string
  booths: readonly TollBoothExtractRowInput[]
  dataset: string
  observedOn: string
  rawBody: Uint8Array
}>

export function createCreateTollBoothExtractUseCase(dependencies: {
  readonly extracts: TollBoothExtractPort
  readonly storage: TollBoothExtractStoragePort
}): { readonly execute: (input: CreateTollBoothExtractInput) => Promise<TollBoothExtractRow> } {
  return {
    async execute(input: CreateTollBoothExtractInput): Promise<TollBoothExtractRow> {
      const objectKey = buildExtractObjectKey({
        dataset: input.dataset,
        observedOn: input.observedOn,
      })
      const sha256 = createHash('sha256').update(input.rawBody).digest('hex')

      await dependencies.storage.putCreateOnly({
        body: input.rawBody,
        contentLength: input.rawBody.byteLength,
        key: objectKey,
        sha256,
      })

      const counts = summarizeTollBoothExtract(input.booths)

      return dependencies.extracts.create({
        ...counts,
        dataset: input.dataset,
        objectKey,
        observedOn: input.observedOn,
        sha256,
        uploadedByUserId: input.actorUserId,
      })
    },
  }
}
