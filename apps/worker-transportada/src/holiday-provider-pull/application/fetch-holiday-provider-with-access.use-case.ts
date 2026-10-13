/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A etapa de busca com a configuração da instalação (spec 262, ADR-0102 D3): no começo de cada ciclo lê a chave
 * e o orçamento guardados no banco e só então monta a busca. Sem chave, ou com a chave que não abre, a busca nem
 * é montada — nenhuma requisição sai e o resultado diz qual dos dois foi; a descoberta e a aplicação, que só
 * tocam o banco, seguem como sempre. O ciclo usa o que leu aqui: trocar a chave no meio vale no ciclo seguinte.
 * Erro de banco na leitura propaga e falha a etapa.
 */
import { createEmptyFetchTally } from './fetch-holiday-provider.use-case.js'
import type { FetchHolidayProviderUseCase } from './holiday-fetch-cycle.types.js'
import type { HolidayProviderAccessReader } from './holiday-provider-access.port.js'

export type FetchHolidayProviderWithAccessDependencies = {
  readonly access: HolidayProviderAccessReader
  readonly createFetch: (input: {
    readonly budget: number
    readonly token: string
  }) => FetchHolidayProviderUseCase
}

export function createFetchHolidayProviderWithAccessUseCase(
  dependencies: FetchHolidayProviderWithAccessDependencies,
): FetchHolidayProviderUseCase {
  return {
    async execute(input) {
      const access = await dependencies.access.readAccess()

      if (access.kind === 'token_missing') return { ...createEmptyFetchTally(), tokenMissing: true }
      if (access.kind === 'token_unreadable') {
        return { ...createEmptyFetchTally(), tokenUnreadable: true }
      }

      return dependencies.createFetch({ budget: access.budget, token: access.token }).execute(input)
    },
  }
}
