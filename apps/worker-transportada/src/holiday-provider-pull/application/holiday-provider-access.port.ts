/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 (ADR-0102 D3): o que a etapa de busca lê no começo de cada ciclo — a chave da FeriadosAPI e o
 * orçamento do mês, guardados no banco pela tela. A chave só existe em `ready` e nunca sai daqui para log,
 * contador ou desfecho.
 */
export type HolidayProviderAccess =
  | { readonly budget: number; readonly kind: 'ready'; readonly token: string }
  | { readonly budget: number; readonly kind: 'token_missing' }
  | { readonly kind: 'token_unreadable' }

export type HolidayProviderAccessReader = {
  readAccess(): Promise<HolidayProviderAccess>
}
