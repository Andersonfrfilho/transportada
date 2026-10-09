/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Fronteira com a FeriadosAPI (ADR-0100). Sai daqui só o código IBGE (ou a UF) e o ano, com o token
 * no cabeçalho `Authorization`; a resposta é fato público e entra por uma guarda Zod, depois de um
 * corpo com teto. Nenhum erro carrega URL, cabeçalho, corpo ou mensagem da rede — ver
 * `HolidayProviderError`. Redirecionamento não é seguido: o token não viaja para onde o fornecedor mandar.
 */
import type {
  HolidayProviderClient,
  HolidayProviderPage,
} from '../application/holiday-provider-client.port.js'
import { BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE } from '../domain/brazilian-state.constant.js'
import { classifyProviderItems } from '../domain/holiday-provider-entry.policy.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../domain/holiday-provider.constant.js'
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  HolidayProviderError,
} from '../domain/holiday-provider.error.js'
import type { HolidayProviderRequest } from '../domain/holiday-provider.types.js'
import { FERIADOS_API_PAGE_SIZE } from '../domain/holiday-provider-pull.constant.js'

import { readBoundedJson, readRetryAfterSeconds } from './feriados-api.body.js'
import { readProviderItems } from './feriados-api.schema.js'

export type FeriadosApiFetch = (url: string, init: RequestInit) => Promise<Response>

export type FeriadosApiClientDependencies = {
  readonly baseUrl: string
  readonly fetch: FeriadosApiFetch
  readonly now?: () => Date
  readonly timeoutInMilliseconds: number
  readonly token: string
}

const API_PATH = '/api/v1/feriados'
const FIRST_PAGE = 1

function resolveEndpoint(request: HolidayProviderRequest): string {
  if (request.scope === HOLIDAY_PROVIDER_SCOPE.CITY) return `cidade/${request.ibgeCode}`
  if (request.scope === HOLIDAY_PROVIDER_SCOPE.NATIONAL) return 'nacionais'

  const abbreviation = (
    BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE as Readonly<Record<string, string | undefined>>
  )[request.ibgeCode]
  if (abbreviation === undefined) {
    throw new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE })
  }
  return `estado/${abbreviation}`
}

function buildUrl(input: {
  readonly base: string
  readonly request: HolidayProviderRequest
}): string {
  const { base, request } = input
  const pageQuery = request.page > FIRST_PAGE ? `&page=${request.page}` : ''
  return `${base}${API_PATH}/${resolveEndpoint(request)}?ano=${request.year}&limit=${FERIADOS_API_PAGE_SIZE}${pageQuery}`
}

/** 401: o token foi recusado. 402/403: o plano não cobre o pedido — quem decide o que isso significa é o escopo. */
function toStatusError(input: {
  readonly now: Date
  readonly response: Response
}): HolidayProviderError {
  const { now, response } = input
  const { status } = response

  if (status === 401)
    return new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.UNAUTHORIZED })
  if (status === 402 || status === 403) {
    return new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.PLAN_RESTRICTED })
  }
  if (status === 404)
    return new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.NOT_FOUND })
  if (status === 429) {
    return new HolidayProviderError({
      code: HOLIDAY_PROVIDER_ERROR_CODE.RATE_LIMITED,
      retryAfterSeconds: readRetryAfterSeconds({
        header: response.headers.get('retry-after'),
        now,
      }),
    })
  }
  return new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE })
}

export function createFeriadosApiClient(
  dependencies: FeriadosApiClientDependencies,
): HolidayProviderClient {
  const base = dependencies.baseUrl.replace(/\/+$/u, '')
  const now = dependencies.now ?? (() => new Date())

  async function send(url: string): Promise<Response> {
    try {
      return await dependencies.fetch(url, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${dependencies.token}`,
        },
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(dependencies.timeoutInMilliseconds),
      })
    } catch (error: unknown) {
      // Só o nome do erro (`TypeError`, `TimeoutError`): a mensagem da rede pode ecoar o cabeçalho.
      throw new HolidayProviderError({
        code: HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE,
        reason: error instanceof Error ? error.name : 'UnknownError',
      })
    }
  }

  return {
    async fetchPage(request): Promise<HolidayProviderPage> {
      const response = await send(buildUrl({ base, request }))
      if (!response.ok) throw toStatusError({ now: now(), response })

      const items = readProviderItems(await readBoundedJson(response))
      if (items === undefined) {
        throw new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE })
      }

      const classified = classifyProviderItems({ items, request })
      return {
        discardedCount: classified.discardedCount,
        entries: classified.entries,
        receivedCount: items.length,
      }
    },
  }
}
