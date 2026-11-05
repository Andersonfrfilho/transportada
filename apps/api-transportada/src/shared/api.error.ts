/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiErrorDetail } from './api.types.js'

type ApiErrorParams = {
  readonly code: string
  readonly details?: readonly ApiErrorDetail[]
  /** Campos do corpo ao lado de `error` (ex.: `outOfOrder`), para a tela decidir sem reler a mensagem. */
  readonly extraBody?: Readonly<Record<string, unknown>>
  readonly headers?: Readonly<Record<string, string>>
  readonly message: string
  readonly status: number
}

export class ApiError extends Error {
  public readonly code: string
  public readonly details: readonly ApiErrorDetail[] | undefined
  declare public readonly extraBody?: Readonly<Record<string, unknown>>
  public readonly headers: Readonly<Record<string, string>> | undefined
  public readonly status: number

  public constructor({ code, details, extraBody, headers, message, status }: ApiErrorParams) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    if (extraBody !== undefined) this.extraBody = extraBody
    this.headers = headers
    this.status = status
  }
}
