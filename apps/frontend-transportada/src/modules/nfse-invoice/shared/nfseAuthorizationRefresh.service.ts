/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { NfseInvoiceStatus } from './nfseInvoice.types'

/**
 * `pending_authorization` não é fila de envio: o RPS já está na prefeitura, com protocolo do
 * provedor, e o que falta é ela autorizar. Quem busca a resposta é o worker `nfse.status.pull`, e
 * a tela não tem como apressar isso — o refresh serve para a autorização aparecer sozinha, em vez
 * de o operador recarregar a página adivinhando.
 */
export const NFSE_AUTHORIZATION_REFRESH_INTERVAL_MS = 60_000

/**
 * O worker reconsulta a prefeitura a cada cinco minutos, então uma batida de tela mais curta que
 * isso não acelera a autorização: ela só encurta o atraso entre o worker saber e a tela mostrar.
 * Um minuto é o meio-termo — o pior caso cai para cerca de seis minutos, e o custo fica preso ao
 * tempo em que existe nota pendente.
 */
const AWAITING_AUTHORIZATION_STATUSES: readonly NfseInvoiceStatus[] = ['pending_authorization']

export type NfseAuthorizationRefreshState = Readonly<{
  enabled: boolean
  intervalMs: number | null
  pendingCount: number
}>

export function countAwaitingAuthorization(
  invoices: readonly Readonly<{ status: NfseInvoiceStatus }>[],
): number {
  return invoices.filter((invoice) => AWAITING_AUTHORIZATION_STATUSES.includes(invoice.status))
    .length
}

/**
 * Sem nota pendente o ciclo para de vez. Uma tela aberta e esquecida bateria na API para sempre,
 * e nenhuma dessas batidas teria resposta diferente da anterior.
 */
export function resolveNfseAuthorizationRefreshState(
  input: Readonly<{ invoices: readonly Readonly<{ status: NfseInvoiceStatus }>[] }>,
): NfseAuthorizationRefreshState {
  const pendingCount = countAwaitingAuthorization(input.invoices)
  if (pendingCount === 0) return { enabled: false, intervalMs: null, pendingCount: 0 }

  return {
    enabled: true,
    intervalMs: NFSE_AUTHORIZATION_REFRESH_INTERVAL_MS,
    pendingCount,
  }
}

/** O alvo da contagem regressiva. `null` quando o ciclo está parado: sem alvo não há relógio. */
export function resolveNextRefreshIso(
  input: Readonly<{ enabled: boolean; fromEpochMs: number; intervalMs: number | null }>,
): null | string {
  if (!input.enabled || input.intervalMs === null) return null

  return new Date(input.fromEpochMs + input.intervalMs).toISOString()
}
