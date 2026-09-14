/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 137: o pool do Bun SQL com tamanho e tempos declarados. Os padrões do Bun eram o incidente:
 * espera por conexão sem limite (`idleTimeout: 0`) e nenhum tempo de consulta — o pedido pendurava
 * até os 10 s do `server.timeout` e o socket fechava sem resposta e sem log.
 *
 * A espera por conexão livre conta **dentro** do prazo da consulta (8 s), que fica abaixo dos 10 s
 * de `REQUEST_TIMEOUT_SECONDS` — senão o socket fecha antes de o 503 sair.
 *
 * ⚠️ O `idleTimeout` do Bun SQL **não** serve de prazo de espera por conexão, embora a
 * documentação o descreva assim: medido na 1.3.14, com `idleTimeout: 1` uma consulta que já tinha
 * conexão e rodava 2,5 s foi recusada com `ERR_POSTGRES_IDLE_TIMEOUT`. Ele fica no padrão (0).
 */
export const DATABASE_POOL_DEFAULTS = {
  connectTimeoutSeconds: 5,
  max: 10,
  queryTimeoutMs: 8000,
} as const

export const DATABASE_UNAVAILABLE_REASON = {
  connectionFailed: 'connection_failed',
  poolExhausted: 'pool_exhausted',
  queryTimeout: 'query_timeout',
} as const

export type DatabaseUnavailableReason =
  (typeof DATABASE_UNAVAILABLE_REASON)[keyof typeof DATABASE_UNAVAILABLE_REASON]

/** Código do Bun SQL quando o pedido esperou conexão além de `idleTimeout` (medido na 1.3.14). */
export const BUN_SQL_ACQUIRE_TIMEOUT_CODE = 'ERR_POSTGRES_IDLE_TIMEOUT'
export const BUN_SQL_CONNECTION_CODE_PREFIX = 'ERR_POSTGRES_CONNECTION'
/** SQLSTATE do `statement_timeout` (e do cancelamento) no servidor. */
export const POSTGRES_QUERY_CANCELED_SQLSTATE = '57014'
