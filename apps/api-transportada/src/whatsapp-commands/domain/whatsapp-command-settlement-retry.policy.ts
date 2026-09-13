/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T020 (B2) — a liquidação que lança erro fora do domínio não fica sendo chamada a cada
 * batida no topo da fila. Ela recua por um intervalo que dobra e, esgotadas as tentativas, encerra
 * como `settlement_failed`. Fora do corpo compartilhado com o worker de propósito: quem decide a
 * espera é a API, e o worker só lê `next_settlement_at`.
 */
export const WHATSAPP_COMMAND_SETTLEMENT_MAX_ATTEMPTS = 5
export const WHATSAPP_COMMAND_SETTLEMENT_RETRY_BASE_MILLISECONDS = 5 * 60_000

/**
 * A trilha do encerramento sai em nome de quem confirmou, como a fatura (ADR-0064): a liquidação
 * age por procuração dele, e é a membership dele que a FK de `audit_logs` exige.
 */
export const WHATSAPP_COMMAND_SETTLEMENT_AUDIT = {
  abandoned: 'whatsapp_command.settlement_abandoned',
  entityType: 'whatsapp_command_request',
  permission: 'whatsapp.settle',
  targetType: 'whatsapp_command_request',
} as const

/** O código só entra quando já tem forma de código; o resto vira o nome do erro, nunca o texto. */
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,99}$/
const UNKNOWN_ERROR_NAME = 'UnknownError'

/** 1ª falha → 5 min, 2ª → 10, 3ª → 20, 4ª → 40; a 5ª encerra. */
export function computeNextSettlementAttemptAt(input: {
  readonly attempts: number
  readonly now: Date
}): Date {
  const factor = 2 ** Math.max(0, input.attempts - 1)
  return new Date(
    input.now.getTime() + WHATSAPP_COMMAND_SETTLEMENT_RETRY_BASE_MILLISECONDS * factor,
  )
}

export function hasExhaustedSettlementAttempts(attempts: number): boolean {
  return attempts >= WHATSAPP_COMMAND_SETTLEMENT_MAX_ATTEMPTS
}

export function toSettlementErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return UNKNOWN_ERROR_NAME
  const code = 'code' in error && typeof error.code === 'string' ? error.code : error.message
  return ERROR_CODE_PATTERN.test(code) ? code : error.name
}
