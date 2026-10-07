/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CONTRACTOR_DIRECTORY_ERROR } from './contractorDirectory.types'

export type ContractorApiErrorDetail = Readonly<{ field: string; message: string }>

/**
 * `web.md` §11: o 400 da API diz qual campo recusou, e o cliente que joga isso fora deixa o operador
 * com "não foi possível salvar" numa ficha cheia. A `message` segue sendo o código, porque é por ele
 * que a tela escolhe o texto do aviso.
 */
export class ContractorDirectoryRequestError extends Error {
  public readonly details: readonly ContractorApiErrorDetail[]

  public constructor(code: string, details: readonly ContractorApiErrorDetail[] = []) {
    super(code)
    this.name = 'ContractorDirectoryRequestError'
    this.details = details
  }
}

export type ContractorDirectoryDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

type RequestInput = Readonly<{
  body?: string
  dependencies: ContractorDirectoryDependencies
  method: 'GET' | 'PATCH' | 'PUT'
  path: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Detalhe malformado é ignorado: o caminho do erro não pode ser o que quebra. */
export function readErrorDetails(payload: unknown): readonly ContractorApiErrorDetail[] {
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
  if (!isRecord(payload) || !isRecord(payload.error))
    return CONTRACTOR_DIRECTORY_ERROR.REQUEST_FAILED
  return typeof payload.error.code === 'string'
    ? payload.error.code
    : CONTRACTOR_DIRECTORY_ERROR.REQUEST_FAILED
}

async function send(input: RequestInput): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new ContractorDirectoryRequestError(CONTRACTOR_DIRECTORY_ERROR.REQUEST_FAILED)
  }
}

/** O código sobe como veio: é ele que a tela traduz — trocá-lo por genérico apaga a explicação. */
export async function requestContractorApi(input: RequestInput): Promise<unknown> {
  const response = await send(input)
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new ContractorDirectoryRequestError(CONTRACTOR_DIRECTORY_ERROR.RESPONSE_INVALID)
  }
  if (!response.ok) {
    throw new ContractorDirectoryRequestError(readErrorCode(payload), readErrorDetails(payload))
  }
  return payload
}
