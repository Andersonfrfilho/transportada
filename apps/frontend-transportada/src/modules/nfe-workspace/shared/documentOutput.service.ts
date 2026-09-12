/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DocumentOutput } from './nfeWorkspaceClient.service'

export const NO_PROFILE_REASONS = ['ambiguous', 'not_cnpj', 'unmatched'] as const

export type DocumentOutputDescription =
  | Readonly<{ kind: 'cte' }>
  | Readonly<{ kind: 'nfse' }>
  | Readonly<{ kind: 'blocked'; reason: string }>
  | Readonly<{ kind: 'noProfile'; reason: string }>

/**
 * O que a coluna "Documento" imprime. Ausência (API anterior) e saída desconhecida viram `null`, e
 * a célula fica vazia: inventar "CT-e" para a linha sem classificação seria escolher o documento por
 * omissão, que é justamente o que a spec 144 D3 proíbe.
 */
export function describeDocumentOutput(
  documentOutput: DocumentOutput | undefined,
): DocumentOutputDescription | null {
  if (documentOutput === undefined) return null
  if (documentOutput.output === 'cte') return { kind: 'cte' }
  if (documentOutput.output === 'nfse') return { kind: 'nfse' }
  if (documentOutput.reason === undefined) return null
  if (documentOutput.output === 'blocked') return { kind: 'blocked', reason: documentOutput.reason }
  if (documentOutput.output === 'no_profile') {
    return { kind: 'noProfile', reason: documentOutput.reason }
  }
  return null
}
