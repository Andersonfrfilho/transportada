/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  ResendProviderUnauthorizedError,
  ResendProviderUnexpectedResponseError,
  ResendProviderUnreachableError,
} from '../domain/resend-provider.error.js'

/**
 * Spec 143 T007. Confere a chave de API e o estado do domínio do remetente numa chamada só:
 * `GET /domains` já lista os domínios da conta, com o `status` de verificação de cada um
 * (fonte: https://resend.com/docs/api-reference/domains/list-domains). Uma segunda chamada por
 * domínio (`GET /domains/{id}`) exigiria já saber o id — que é justamente o que esta função existe
 * para descobrir a partir do nome digitado no formulário.
 *
 * ⚠️ A chave precisa ser `full_access`: a documentação de API keys diz que `sending_access`
 * "só pode enviar e-mails" (https://resend.com/docs/api-reference/api-keys/create-api-key), e
 * listar domínios está fora disso. Uma chave de envio aqui responde 401/403 como se fosse errada —
 * o que é o comportamento certo: para o RF12 ela **é** insuficiente.
 */

type Fetch = (input: string, init: RequestInit) => Promise<Response>

const RESEND_BASE_URL = 'https://api.resend.com'
const REQUEST_TIMEOUT_MILLISECONDS = 5_000

const domainsResponseSchema = z.object({
  data: z.array(
    z.object({
      name: z.string().min(1),
      status: z.string().min(1),
    }),
  ),
})

export type ResendAccountCheckReason =
  | 'ok'
  | 'sender_domain_not_found'
  | 'sender_domain_not_verified'

/**
 * `apiKeyAccepted` só existe como `true` aqui: uma chave recusada nunca chega a este ponto, ela sai
 * por `ResendProviderUnauthorizedError`. O campo fica no resultado porque o RF12 exibe uma lista de
 * verificação, e "chave aceita" é um item dela — o `reason` é o que diferencia o domínio verificado
 * do domínio ainda não encontrado.
 */
export type ResendAccountCheckResult = {
  readonly apiKeyAccepted: boolean
  readonly reason: ResendAccountCheckReason
  readonly senderDomainVerified: boolean
}

export type ResendAccountGateway = {
  checkApiKeyAndSenderDomain(input: {
    readonly apiKey: string
    readonly senderDomain: string
  }): Promise<ResendAccountCheckResult>
}

export type CreateResendAccountGatewayInput = {
  readonly fetch: Fetch
  readonly timeoutMilliseconds?: number
}

export function createResendAccountGateway(
  input: CreateResendAccountGatewayInput,
): ResendAccountGateway {
  const timeoutMilliseconds = input.timeoutMilliseconds ?? REQUEST_TIMEOUT_MILLISECONDS

  return {
    async checkApiKeyAndSenderDomain({ apiKey, senderDomain }) {
      let response: Response
      try {
        response = await input.fetch(`${RESEND_BASE_URL}/domains`, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMilliseconds),
        })
      } catch (error) {
        throw new ResendProviderUnreachableError(error)
      }

      if (response.status === 401 || response.status === 403) {
        throw new ResendProviderUnauthorizedError()
      }
      if (!response.ok) {
        throw new ResendProviderUnexpectedResponseError()
      }

      let body: unknown
      try {
        body = await response.json()
      } catch (error) {
        throw new ResendProviderUnexpectedResponseError(error)
      }

      const parsed = domainsResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw new ResendProviderUnexpectedResponseError(parsed.error)
      }

      const normalizedDomain = senderDomain.trim().toLowerCase()
      const domain = parsed.data.data.find((entry) => entry.name.toLowerCase() === normalizedDomain)
      if (domain === undefined) {
        return {
          apiKeyAccepted: true,
          reason: 'sender_domain_not_found',
          senderDomainVerified: false,
        }
      }

      const senderDomainVerified = domain.status === 'verified'
      return {
        apiKeyAccepted: true,
        reason: senderDomainVerified ? 'ok' : 'sender_domain_not_verified',
        senderDomainVerified,
      }
    },
  }
}
