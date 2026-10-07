/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiErrorDetail } from './api.types.js'

type ApiErrorParams = {
  readonly code: string
  readonly details?: readonly ApiErrorDetail[]
  readonly headers?: Readonly<Record<string, string>>
  readonly message: string
  readonly status: number
}

export class ApiError extends Error {
  public readonly code: string
  public readonly details: readonly ApiErrorDetail[] | undefined
  public readonly headers: Readonly<Record<string, string>> | undefined
  public readonly status: number

  public constructor({ code, details, headers, message, status }: ApiErrorParams) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.headers = headers
    this.status = status
  }
}
