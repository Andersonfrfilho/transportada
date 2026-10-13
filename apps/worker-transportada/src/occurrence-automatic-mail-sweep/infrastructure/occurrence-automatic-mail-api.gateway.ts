/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeAutoIssueEnvironment } from '../../shared/worker.types.js'
import { OccurrenceAutomaticMailApiError } from '../application/occurrence-automatic-mail-api.error.js'
import type { OccurrenceAutomaticMailApiPort } from '../application/occurrence-automatic-mail-api.port.js'

/** Renova antes de expirar: relógio de máquina anda, e um token na borda vira 401 esporádico. */
const TOKEN_EXPIRY_MARGIN_SECONDS = 30
const UNAUTHORIZED_STATUSES: readonly number[] = [401, 403]
const REJECTED_STATUSES: readonly number[] = [400, 404, 409]

export type CreateOccurrenceAutomaticMailApiGatewayParams = {
  readonly configuration: MdfeAutoIssueEnvironment
  readonly fetch?: typeof globalThis.fetch
  readonly now?: () => number
}

function toApiError(status: number): OccurrenceAutomaticMailApiError {
  if (UNAUTHORIZED_STATUSES.includes(status))
    return new OccurrenceAutomaticMailApiError('api_unauthorized', status)
  if (REJECTED_STATUSES.includes(status))
    return new OccurrenceAutomaticMailApiError('request_rejected', status)
  return new OccurrenceAutomaticMailApiError('api_unreachable', status)
}

export function createOccurrenceAutomaticMailApiGateway(
  input: CreateOccurrenceAutomaticMailApiGatewayParams,
): OccurrenceAutomaticMailApiPort {
  const httpFetch = input.fetch ?? globalThis.fetch
  const now = input.now ?? (() => Date.now())
  let cached: { readonly expiresAtMs: number; readonly token: string } | null = null

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await httpFetch(url, init)
    } catch {
      throw new OccurrenceAutomaticMailApiError('api_unreachable')
    }
  }

  async function accessToken(): Promise<string> {
    if (cached !== null && cached.expiresAtMs > now()) return cached.token

    const response = await send(input.configuration.tokenUrl, {
      body: new URLSearchParams({
        client_id: input.configuration.clientId,
        client_secret: input.configuration.clientSecret,
        grant_type: 'client_credentials',
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    })
    if (!response.ok) throw toApiError(response.status)

    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new OccurrenceAutomaticMailApiError('api_unreachable', response.status)
    }
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 0
    cached = {
      expiresAtMs: now() + Math.max(0, expiresIn - TOKEN_EXPIRY_MARGIN_SECONDS) * 1_000,
      token: body.access_token,
    }
    return body.access_token
  }

  return {
    async send({ companyId, occurrenceId }) {
      const response = await send(
        `${input.configuration.apiBaseUrl.replace(/\/$/, '')}/trip-occurrences/${occurrenceId}/automatic-mail`,
        {
          body: '{}',
          headers: {
            authorization: `Bearer ${await accessToken()}`,
            'content-type': 'application/json',
            'x-company-id': companyId,
          },
          method: 'POST',
        },
      )
      if (!response.ok) {
        if (response.status === 401) cached = null
        throw toApiError(response.status)
      }

      const body = (await response.json()) as { data?: { outcome?: unknown } }
      const outcome = body.data?.outcome
      if (outcome === 'sent' || outcome === 'already_sent' || outcome === 'skipped') {
        return { outcome }
      }
      throw new OccurrenceAutomaticMailApiError('api_unreachable', response.status)
    },
  }
}
