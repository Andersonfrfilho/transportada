/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const CTE_UNKNOWN_ERROR_CAUSE_PREFIX = 'unknown_error'

const CAUSE_MAX_LENGTH = 500
const MESSAGE_MAX_LENGTH = 2_000
const STACK_MAX_LENGTH = 4_000
const CAUSE_CHAIN_MAX_DEPTH = 5
const REDACTED = '[REDACTED]'

/** Uma mensagem de erro do provedor fiscal pode trazer o XML assinado ou a senha do PFX junto. */
const SECRET_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/-----BEGIN[\s\S]*?-----END[^-]*-----/g, REDACTED],
  [
    /<(Signature|X509Certificate|infCte|CTe|cteProc|infEvento)\b[\s\S]*?<\/\1>/gi,
    `<$1>${REDACTED}</$1>`,
  ],
  [
    /("?(?:certificadoSenha|certificadoBase64|senha|password|secret|token)"?\s*[:=]\s*)"?[^",}\s]+"?/gi,
    `$1"${REDACTED}"`,
  ],
]

export type CteUnknownErrorDescription = {
  readonly cause: string
  readonly errorCauses: readonly string[]
  readonly errorMessage: string
  readonly errorName: string
  readonly errorStack: string | undefined
}

/**
 * Erro que não é recuperável nem fatal precisa virar registro legível: o handler devolve o item
 * para conciliação com esta causa e loga a cadeia inteira para reproduzir a falha depois.
 */
export function describeCteUnknownError(error: unknown): CteUnknownErrorDescription {
  const errorName = resolveName(error)
  const errorMessage = truncate(redact(resolveMessage(error)), MESSAGE_MAX_LENGTH)
  const stack = error instanceof Error ? error.stack : undefined

  return {
    cause: truncate(
      `${CTE_UNKNOWN_ERROR_CAUSE_PREFIX}:${errorName}: ${errorMessage}`,
      CAUSE_MAX_LENGTH,
    ),
    errorCauses: describeCauseChain(error),
    errorMessage,
    errorName,
    errorStack: stack === undefined ? undefined : truncate(redact(stack), STACK_MAX_LENGTH),
  }
}

function describeCauseChain(error: unknown): readonly string[] {
  const chain: string[] = []
  let current: unknown = error instanceof Error ? error.cause : undefined

  while (current !== undefined && current !== null && chain.length < CAUSE_CHAIN_MAX_DEPTH) {
    chain.push(
      truncate(redact(`${resolveName(current)}: ${resolveMessage(current)}`), CAUSE_MAX_LENGTH),
    )
    current = current instanceof Error ? current.cause : undefined
  }

  return chain
}

function redact(text: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    text,
  )
}

function resolveMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  return safeStringify(error)
}

function resolveName(error: unknown): string {
  if (error instanceof Error) return error.name === '' ? 'Error' : error.name

  return 'UnknownError'
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}
