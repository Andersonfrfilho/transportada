/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
type ApiErrorParams = {
  readonly code: string
  readonly headers?: Readonly<Record<string, string>>
  readonly message: string
  readonly status: number
}

export class ApiError extends Error {
  public readonly code: string
  public readonly headers: Readonly<Record<string, string>> | undefined
  public readonly status: number

  public constructor({ code, headers, message, status }: ApiErrorParams) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.headers = headers
    this.status = status
  }
}
