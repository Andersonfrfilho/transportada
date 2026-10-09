/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A mensagem de cada erro é o próprio código e nada mais: URL, cabeçalho, corpo da resposta e mensagem
 * da rede nunca entram, porque qualquer um deles pode carregar o token. É isso que mantém o segredo
 * fora do log por construção, não por disciplina de quem escreve o log. O `reason` é só o **nome** do
 * erro de transporte (`TypeError`, `TimeoutError`), nunca a mensagem.
 */
export const HOLIDAY_PROVIDER_ERROR_CODE = {
  MALFORMED_RESPONSE: 'malformed_response',
  NOT_FOUND: 'provider_not_found',
  /** 402/403: o plano não cobre o pedido. Numa cidade restringe o par; no nacional/estado encerra o ciclo. */
  PLAN_RESTRICTED: 'provider_plan_restricted',
  RATE_LIMITED: 'provider_rate_limited',
  UNAUTHORIZED: 'provider_unauthorized',
  UNREACHABLE: 'provider_unreachable',
} as const

export type HolidayProviderErrorCode =
  (typeof HOLIDAY_PROVIDER_ERROR_CODE)[keyof typeof HOLIDAY_PROVIDER_ERROR_CODE]

export class HolidayProviderError extends Error {
  override readonly name = 'HolidayProviderError'
  readonly code: HolidayProviderErrorCode
  readonly reason: string | undefined
  readonly retryAfterSeconds: number | undefined

  constructor(input: {
    readonly code: HolidayProviderErrorCode
    readonly reason?: string | undefined
    readonly retryAfterSeconds?: number | undefined
  }) {
    super(input.code)
    this.code = input.code
    this.reason = input.reason
    this.retryAfterSeconds = input.retryAfterSeconds
  }
}
