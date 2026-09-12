/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeAutoIssueEnvironment } from '../../shared/worker.types.js'
import type { WhatsAppCommandSettlementApiPort } from '../application/whatsapp-command-settlement.port.js'

/** Renova antes de expirar: relógio de máquina anda, e um token na borda vira 401 esporádico. */
const TOKEN_EXPIRY_MARGIN_SECONDS = 30

export type CreateWhatsAppCommandSettlementApiGatewayParams = {
  /** O mesmo crachá do gatilho de MDF-e (ADR-0047): um cliente de serviço, papel `automation`. */
  readonly configuration: MdfeAutoIssueEnvironment
  readonly fetch?: typeof globalThis.fetch
  readonly now?: () => number
}

/**
 * Spec 144 T014, no molde de `automatic-manifest-api.gateway.ts`: a liquidação é da API, que fatura
 * em nome de quem confirmou; o worker só pergunta. O veredito vai como dica — a API recalcula.
 */
export function createWhatsAppCommandSettlementApiGateway(
  input: CreateWhatsAppCommandSettlementApiGatewayParams,
): WhatsAppCommandSettlementApiPort {
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
      throw new Error(`whatsapp_command_settlement_token_failed:${response.status}`)
    }

    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error('whatsapp_command_settlement_token_malformed')
    }
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 0
    cached = {
      expiresAtMs: now() + Math.max(0, expiresIn - TOKEN_EXPIRY_MARGIN_SECONDS) * 1_000,
      token: body.access_token,
    }
    return body.access_token
  }

  return {
    async settle({ companyId, hint, requestId }) {
      const response = await httpFetch(
        `${input.configuration.apiBaseUrl.replace(/\/$/, '')}/whatsapp-command-requests/${requestId}/settlement`,
        {
          body: JSON.stringify({ hint }),
          headers: {
            authorization: `Bearer ${await accessToken()}`,
            'content-type': 'application/json',
            // ADR-0047 §3: o tenant do serviço viaja aqui, e a API o valida contra a membership.
            'x-company-id': companyId,
          },
          method: 'POST',
        },
      )
      if (!response.ok) {
        throw new Error(`whatsapp_command_settlement_request_failed:${response.status}`)
      }

      const body = (await response.json()) as { data?: { message?: unknown; outcome?: unknown } }
      return {
        message: typeof body.data?.message === 'string' ? body.data.message : undefined,
        outcome: typeof body.data?.outcome === 'string' ? body.data.outcome : 'unknown',
      }
    },
  }
}
