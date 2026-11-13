/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1: vencimento é data civil de America/Sao_Paulo, sem hora. Implementação na T1.4.
 */
export type ResolveExpenseDueDateParams = {
  /** `yyyy-mm`. */
  readonly competence: string
  /** 1–31; mês curto cai no último dia. */
  readonly dueDay: number
}

/** Devolve `yyyy-mm-dd`. */
export function resolveExpenseDueDate(params: ResolveExpenseDueDateParams): string {
  void params
  throw new Error('spec 325 T1.4: resolveExpenseDueDate not implemented')
}
