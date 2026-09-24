/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentReadiness } from './trip.types'

/**
 * As mesmas razões que a API trata como pendente em `create-trip-cte-batch.use-case.ts`. Cópia por
 * valor — o bundle não carrega código da API —, com contrato restatando a lista dos dois lados:
 * se elas divergirem, o botão oferece emissão que a API recusa, e o operador perde a seleção sem
 * entender por quê.
 */
export const PENDING_CTE_REASONS = ['no_cte', 'cte_rejected', 'cte_cancelled'] as const

export type SelectPendingCteInput = Readonly<{
  documents: readonly TripDocumentReadiness[] | undefined
  selectedIds: ReadonlySet<string>
}>

/**
 * O que da seleção ainda tem CT-e a emitir. Sem prontidão carregada devolve vazio: não oferecer é
 * melhor que oferecer errado, porque o erro só apareceria na emissão fiscal.
 */
export function selectPendingCteDocumentIds(input: SelectPendingCteInput): readonly string[] {
  return (input.documents ?? [])
    .filter(
      (document) =>
        input.selectedIds.has(document.tripDocumentId) &&
        document.expectedDocument === 'cte' &&
        (PENDING_CTE_REASONS as readonly string[]).includes(document.reason),
    )
    .map((document) => document.tripDocumentId)
}

export type SelectPendingNfseInput = Readonly<{
  documents: readonly TripDocumentReadiness[] | undefined
  selectedIds: ReadonlySet<string>
}>

/**
 * O que da seleção espera NFS-e, em ids de **nota** — é o que a emissão de NFS-e recebe, ao
 * contrário do lote de CT-e, que trabalha com o id do documento da viagem. Nota sem id de nota fica
 * de fora: mandar o id do outro espaço emitiria contra a nota errada, ou contra nenhuma.
 */
export function selectPendingNfseDocumentIds(input: SelectPendingNfseInput): readonly string[] {
  return (input.documents ?? [])
    .filter(
      (document) =>
        input.selectedIds.has(document.tripDocumentId) &&
        document.expectedDocument === 'nfse' &&
        document.reason === 'nfse_expected' &&
        document.nfeDocumentId !== null,
    )
    .map((document) => document.nfeDocumentId)
    .filter((id): id is string => id !== null)
}
