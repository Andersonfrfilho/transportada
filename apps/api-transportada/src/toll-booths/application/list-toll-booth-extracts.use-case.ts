/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * RF3 — do mais novo para o mais antigo. A ordenação é do repositório (SQL), nunca refeita aqui.
 */
import type { TollBoothExtractRow } from '../domain/toll-booth-extract.policy.js'
import type { TollBoothExtractPort } from './toll-booth-extract.port.js'

export function createListTollBoothExtractsUseCase(dependencies: {
  readonly extracts: Pick<TollBoothExtractPort, 'list'>
}): { readonly execute: () => Promise<readonly TollBoothExtractRow[]> } {
  return {
    execute(): Promise<readonly TollBoothExtractRow[]> {
      return dependencies.extracts.list()
    },
  }
}
