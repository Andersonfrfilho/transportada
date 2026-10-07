/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S2): o vínculo segura a trava advisory do contratante,
 * que as ações do operador também tomam. Medido: 19 900 linhas num cliente só levam 82 ms; o teto é
 * para o que ninguém mediu.
 */
export const CARGO_PREVIEW_MATCH_BUDGET_MS = 5_000

/** Cada consulta da transação do vínculo, inclusive a espera pela trava. */
export const CARGO_PREVIEW_MATCH_STATEMENT_TIMEOUT_MS = 30_000
