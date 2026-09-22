/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * `web.md` §11: a recusa do servidor nomeia o campo (`error.details[]`), e o nome é um atalho — os
 * quatro requisitos daquela regra (detalhe carregado, todos os campos juntos, atalho para o campo,
 * rótulo impresso nunca o caminho do corpo) começam aqui, no cliente HTTP.
 */
export type AddressCorrectionErrorDetail = Readonly<{
  field: string
  message: string
}>

export class AddressCorrectionRequestError extends Error {
  public readonly details: readonly AddressCorrectionErrorDetail[]
  /** Spec 150, correção Fase 4, item 11: `Retry-After` do `429`, em segundos — `undefined` fora dele. */
  public readonly retryAfterSeconds: number | undefined

  public constructor(input: {
    readonly code: string
    readonly details?: readonly AddressCorrectionErrorDetail[]
    readonly retryAfterSeconds?: number | undefined
  }) {
    super(input.code)
    this.name = 'AddressCorrectionRequestError'
    this.details = input.details ?? []
    this.retryAfterSeconds = input.retryAfterSeconds
  }
}

/** `proposed.postalCode` → `postalCode`: a forma do corpo tem um prefixo que o formulário não tem. */
export function stripProposedPrefix(field: string): string {
  return field.startsWith('proposed.') ? field.slice('proposed.'.length) : field
}

/**
 * O rótulo impresso é o que a pessoa leu na tela, nunca o caminho do corpo. Campo sem rótulo
 * conhecido não some do aviso (`web.md` §11 item 4): ele sai com o próprio nome cru.
 */
const FIELD_LABEL_KEY: Readonly<Record<string, string>> = {
  city: 'addressCorrection.field.city',
  cityCode: 'addressCorrection.field.cityCode',
  complement: 'addressCorrection.field.complement',
  district: 'addressCorrection.field.district',
  number: 'addressCorrection.field.number',
  postalCode: 'addressCorrection.field.postalCode',
  state: 'addressCorrection.field.state',
  street: 'addressCorrection.field.street',
}

export function fieldLabelKey(field: string): string | undefined {
  return FIELD_LABEL_KEY[stripProposedPrefix(field)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function readErrorDetails(payload: unknown): readonly AddressCorrectionErrorDetail[] {
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) {
    return []
  }
  return payload.error.details.flatMap((detail: unknown) =>
    isRecord(detail) && isString(detail.field) && isString(detail.message)
      ? [{ field: detail.field, message: detail.message }]
      : [],
  )
}

export function readErrorCode(payload: unknown): string | undefined {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return undefined
}

/** Um campo por erro, na ordem em que o servidor mandou — deduplicado por campo, nunca por mensagem. */
export function toInvalidFieldNames(error: unknown): readonly string[] {
  if (!(error instanceof AddressCorrectionRequestError)) return []
  const seen = new Set<string>()
  for (const detail of error.details) seen.add(stripProposedPrefix(detail.field))
  return [...seen]
}

/** O mapa `campo do formulário → mensagem`, para ancorar o erro no próprio campo (`aria-invalid`). */
export function toFieldErrorMap(error: unknown): Readonly<Record<string, string>> {
  if (!(error instanceof AddressCorrectionRequestError)) return {}
  const map: Record<string, string> = {}
  for (const detail of error.details) {
    map[stripProposedPrefix(detail.field)] = detail.message
  }
  return map
}
