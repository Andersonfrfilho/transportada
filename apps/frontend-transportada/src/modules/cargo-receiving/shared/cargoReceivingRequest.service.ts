/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CARGO_RECEIVING_ERROR, IDEMPOTENCY_KEY_HEADER } from './cargoReceiving.constant'

export type CargoApiErrorDetail = Readonly<{ field: string; message: string }>

/**
 * `web.md` §11: o erro do transporte carrega os `details` do servidor ao lado do código — sem eles, a
 * recusa que nomeia cada nota e cada campo morreria no `throw`. A `message` segue sendo o código, porque
 * é por ele que a tela escolhe o texto.
 */
export class CargoReceivingRequestError extends Error {
  public readonly details: readonly CargoApiErrorDetail[]

  public constructor(code: string, details: readonly CargoApiErrorDetail[] = []) {
    super(code)
    this.name = 'CargoReceivingRequestError'
    this.details = details
  }
}

export type CargoReceivingDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

type RequestInput = Readonly<{
  body?: unknown
  dependencies: CargoReceivingDependencies
  /** Multipart: o navegador escolhe o `content-type` com o boundary, nunca se fixa à mão. */
  formData?: FormData
  idempotencyKey?: string
  method: 'GET' | 'POST'
  path: string
}>

export type CargoApiResponse = Readonly<{ body: unknown; status: number }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Detalhe malformado é ignorado: o caminho do erro não pode ser o que quebra. */
export function readErrorDetails(payload: unknown): readonly CargoApiErrorDetail[] {
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) {
    return []
  }
  return payload.error.details.flatMap((detail: unknown) =>
    isRecord(detail) && typeof detail.field === 'string' && typeof detail.message === 'string'
      ? [{ field: detail.field, message: detail.message }]
      : [],
  )
}

function readErrorCode(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error)) return CARGO_RECEIVING_ERROR.REQUEST_FAILED
  return typeof payload.error.code === 'string'
    ? payload.error.code
    : CARGO_RECEIVING_ERROR.REQUEST_FAILED
}

function buildHeaders(input: RequestInput, accessToken: string): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers[IDEMPOTENCY_KEY_HEADER] = input.idempotencyKey
  return headers
}

function buildRequestBody(input: RequestInput): Readonly<{ body?: BodyInit }> {
  if (input.formData !== undefined) return { body: input.formData }
  return input.body === undefined ? {} : { body: JSON.stringify(input.body) }
}

async function send(input: RequestInput): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...buildRequestBody(input),
        cache: 'no-store',
        headers: buildHeaders(input, accessToken),
        method: input.method,
      }),
    )
  } catch {
    throw new CargoReceivingRequestError(CARGO_RECEIVING_ERROR.REQUEST_FAILED)
  }
}

/** O código sobe como veio: é ele que a tela traduz — trocá-lo por genérico apaga a explicação. */
export async function requestCargoReceivingApi(input: RequestInput): Promise<CargoApiResponse> {
  const response = await send(input)
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new CargoReceivingRequestError(CARGO_RECEIVING_ERROR.RESPONSE_INVALID)
  }
  if (!response.ok) {
    throw new CargoReceivingRequestError(readErrorCode(payload), readErrorDetails(payload))
  }
  return { body: payload, status: response.status }
}
