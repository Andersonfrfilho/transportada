/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O alcance de uma mutação num só lugar.
 *
 * Toda ação que mexe num vínculo muda duas telas: a que executou a ação e a que lê o vínculo do
 * outro lado. Enquanto cada hook montava a própria lista de chaves, a tela de origem sempre era
 * invalidada e a de destino dependia de alguém lembrar — e as ações que *soltam* o vínculo nasceram
 * todas sem esse alguém. Descartar a NFS-e devolvia a nota no banco e a tabela continuava com o
 * `cteBlockReason` da consulta anterior: nota impossível de selecionar até recarregar a página.
 *
 * As chaves são literais aqui de propósito. Importá-las traria `shared/` para dentro do grafo de
 * seis módulos, e quem garante que o literal não descolou do módulo é
 * `test/shared/mutation-invalidation.contract.ts`, que compara com a constante exportada.
 */
export const MUTATION_EFFECT = {
  /** A reserva de um CT-e em fatura mudou: ele foi faturado, ou a fatura cancelada o devolveu. */
  billingInvoiceItem: 'billingInvoiceItem',
  /** O vínculo de uma NF-e mudou: ela entrou num lote ou numa NFS-e, ou voltou a ficar livre. */
  nfeDocumentLink: 'nfeDocumentLink',
} as const

export type MutationEffect = (typeof MUTATION_EFFECT)[keyof typeof MUTATION_EFFECT]

export const MUTATION_EFFECT_QUERY_KEYS: Readonly<Record<MutationEffect, readonly string[]>> = {
  billingInvoiceItem: [
    'billing-documents',
    'billing-eligible-list',
    'billing-invoice',
    'billing-invoice-list',
    'company-cte-item-summary',
    'company-cte-items',
  ],
  nfeDocumentLink: ['cte-emission-preview', 'nfe-documents', 'nfse-emission-preview'],
}

/** O cliente de consulta visto pelo que este módulo usa dele — é o que torna o efeito testável. */
type QueryInvalidator = {
  invalidateQueries(filters: Readonly<{ queryKey: readonly string[] }>): Promise<unknown>
}

type InvalidateMutationEffectInput = Readonly<{
  effect: MutationEffect
  queryClient: QueryInvalidator
}>

/** Uma invalidação por chave: as chaves são raízes distintas, não prefixos de uma árvore comum. */
export async function invalidateMutationEffect(
  input: InvalidateMutationEffectInput,
): Promise<void> {
  await Promise.all(
    MUTATION_EFFECT_QUERY_KEYS[input.effect].map((key) =>
      input.queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  )
}
