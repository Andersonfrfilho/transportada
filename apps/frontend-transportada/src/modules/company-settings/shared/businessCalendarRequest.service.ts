/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BUSINESS_CALENDAR_ERROR } from './businessCalendar.constant'

export type BusinessCalendarErrorDetail = Readonly<{ field: string; message: string }>

type RequestErrorInput = Readonly<{
  code: string
  details?: readonly BusinessCalendarErrorDetail[]
  /** `0` quando nem chegou resposta (rede). */
  status: number
}>

/**
 * `web.md` §11: o erro do transporte carrega os `details` do servidor ao lado do código — sem eles, a recusa que
 * nomeia cada campo morreria no `throw`. A `message` segue sendo o código, porque é por ele que a tela escolhe o
 * texto.
 */
export class BusinessCalendarRequestError extends Error {
  public readonly code: string
  public readonly details: readonly BusinessCalendarErrorDetail[]
  public readonly status: number

  public constructor({ code, details = [], status }: RequestErrorInput) {
    super(code)
    this.name = 'BusinessCalendarRequestError'
    this.code = code
    this.details = details
    this.status = status
  }
}

export type BusinessCalendarDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type BusinessCalendarRequest = Readonly<{
  body?: unknown
  dependencies: BusinessCalendarDependencies
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  path: string
}>

export type BusinessCalendarResponse = Readonly<{ body: unknown; status: number }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Detalhe malformado é ignorado: o caminho do erro não pode ser o que quebra. */
function readDetails(payload: unknown): readonly BusinessCalendarErrorDetail[] {
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) {
    return []
  }
  return payload.error.details.flatMap((detail: unknown) =>
    isRecord(detail) && typeof detail.field === 'string' && typeof detail.message === 'string'
      ? [{ field: detail.field, message: detail.message }]
      : [],
  )
}

function readCode(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error)) return BUSINESS_CALENDAR_ERROR.REQUEST_FAILED
  const { code } = payload.error
  return typeof code === 'string' ? code : BUSINESS_CALENDAR_ERROR.REQUEST_FAILED
}

async function send(input: BusinessCalendarRequest): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  const hasBody = input.body !== undefined
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${input.path}`, {
        ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
        },
        method: input.method,
      }),
    )
  } catch {
    throw new BusinessCalendarRequestError({ code: BUSINESS_CALENDAR_ERROR.NETWORK, status: 0 })
  }
}

/** O código sobe como veio: é ele que a tela traduz — trocá-lo por genérico apaga a explicação. */
export async function requestBusinessCalendar(
  input: BusinessCalendarRequest,
): Promise<BusinessCalendarResponse> {
  const response = await send(input)
  const raw = await response.text()
  let payload: unknown = null
  try {
    payload = raw.length === 0 ? null : (JSON.parse(raw) as unknown)
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new BusinessCalendarRequestError({
      code: readCode(payload),
      details: readDetails(payload),
      status: response.status,
    })
  }
  return { body: payload, status: response.status }
}
