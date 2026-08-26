/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeAutoIssueEnvironment } from '../../shared/worker.types.js'
import type { AutomaticManifestApiPort } from '../application/mdfe-auto-issue.port.js'

/** Renova antes de expirar: relógio de máquina anda, e um token na borda vira 401 esporádico. */
const TOKEN_EXPIRY_MARGIN_SECONDS = 30

export type CreateAutomaticManifestApiGatewayParams = {
  readonly configuration: MdfeAutoIssueEnvironment
  readonly fetch?: typeof globalThis.fetch
  readonly now?: () => number
}

export function createAutomaticManifestApiGateway(
  input: CreateAutomaticManifestApiGatewayParams,
): AutomaticManifestApiPort {
  const httpFetch = input.fetch ?? globalThis.fetch
  const now = input.now ?? (() => Date.now())
  let cached: { readonly expiresAtMs: number; readonly token: string } | null = null

  async function accessToken(): Promise<string> {
    if (cached !== null && cached.expiresAtMs > now()) return cached.token

    const response = await httpFetch(input.configuration.tokenUrl, {
      body: new URLSearchParams({
        client_id: input.configuration.clientId,
        client_secret: input.configuration.clientSecret,
        grant_type: 'client_credentials',
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    })
    if (!response.ok) {
      // Sem corpo: a resposta do provedor de identidade pode carregar o segredo de volta.
      throw new Error(`mdfe_auto_issue_token_failed:${response.status}`)
    }

    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error('mdfe_auto_issue_token_malformed')
    }
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 0
    cached = {
      expiresAtMs: now() + Math.max(0, expiresIn - TOKEN_EXPIRY_MARGIN_SECONDS) * 1_000,
      token: body.access_token,
    }
    return body.access_token
  }

  return {
    async issue({ companyId, tripId }) {
      const response = await httpFetch(
        `${input.configuration.apiBaseUrl.replace(/\/$/, '')}/trips/${tripId}/mdfe-manifests/automatic`,
        {
          headers: {
            authorization: `Bearer ${await accessToken()}`,
            // ADR-0047 §3: o tenant do serviço viaja aqui, e a API o valida contra a membership.
            'x-company-id': companyId,
          },
          method: 'POST',
        },
      )
      if (!response.ok) {
        throw new Error(`mdfe_auto_issue_request_failed:${response.status}`)
      }

      const body = (await response.json()) as { data?: { outcome?: unknown } }
      return typeof body.data?.outcome === 'string' ? body.data.outcome : 'unknown'
    },
  }
}
