/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 222 RNF5: quantas notas o diálogo de conferência em maço mostra de uma vez. Quarenta é a
 * viagem cheia que motivou a feature; acima disso a pessoa deixa de olhar cada foto, e o que passa
 * do teto fica para a rodada seguinte em vez de entrar no mesmo clique.
 */
export const CANHOTO_BATCH_MAX_ITEMS = 40

/** Mesma concorrência das outras ações em lote do escritório (`batchFieldReturnMutation`). */
export const CANHOTO_BATCH_CONCURRENCY = 3
