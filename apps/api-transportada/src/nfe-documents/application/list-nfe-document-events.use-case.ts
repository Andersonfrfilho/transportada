/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  NfeDocumentEventPage,
  NfeDocumentEventRepositoryPort,
} from './nfe-document-event.port.js'

export type ListNfeDocumentEvents = {
  execute(input: {
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly documentId: string
    readonly limit: number
  }): Promise<NfeDocumentEventPage>
}

/**
 * Spec 149 D19 — camada fina: a nota de outra empresa e a resolução de nome por membership são
 * responsabilidade do repositório (é ele que sabe o `left join`); aqui só se delega, mantendo a rota
 * livre de SQL.
 */
export function createListNfeDocumentEvents(dependencies: {
  readonly repository: NfeDocumentEventRepositoryPort
}): ListNfeDocumentEvents {
  return {
    execute(input) {
      return dependencies.repository.listEvents(input)
    },
  }
}
