/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia reduzida do gateway do worker (`nfse-issuance/infrastructure/nfse-fiscal-gateway.ts`): aqui
 * só se consulta e se baixa documento. Duas responsabilidades, e só elas:
 *
 * 1. **Abrir o token** do envelope selado, uma vez por chamada — sem endereço configurado o segredo
 *    nem chega a ser aberto.
 * 2. **Nenhuma exceção escapa.** Exceção aqui derrubaria o ciclo inteiro por causa de uma nota.
 */
import type { NfseCredentialSecretService } from '../application/nfse-credential-secret.service.js'
import type {
  NfseCredentialAccess,
  NfseDocumentFetchFacts,
  NfseStatusPort,
} from '../application/nfse-fiscal-status.port.js'
import type { NfseProviderStatusFacts } from '../domain/nfse-reconciliation-outcome.policy.js'
import {
  createNotaRpStatusClient,
  type NotaRpFetch,
  type NotaRpStatusClient,
  type NotaRpV2Config,
} from './nota-rp-v2.client.js'

export type NfseFiscalGatewayConfig = {
  readonly baseUrl: string | undefined
  readonly timeoutMilliseconds: number
}

export function createNfseFiscalGateway(dependencies: {
  readonly config: NfseFiscalGatewayConfig
  readonly createClient?: (input: { readonly config: NotaRpV2Config }) => NotaRpStatusClient
  readonly fetch: NotaRpFetch
  readonly secretService: NfseCredentialSecretService
}): NfseStatusPort {
  const { config, fetch, secretService } = dependencies
  const createClient =
    dependencies.createClient ??
    ((input) => createNotaRpStatusClient({ config: input.config, fetch }))

  async function resolveClient(
    credential: NfseCredentialAccess,
  ): Promise<NotaRpStatusClient | 'credential_unreadable' | 'provider_not_configured'> {
    const { baseUrl } = config
    /** Sem endereço não há a quem pedir — e o segredo continua selado. */
    if (baseUrl === undefined || baseUrl === '') return 'provider_not_configured'

    try {
      const { apiToken } = await secretService.decrypt({
        companyId: credential.companyId,
        credentialId: credential.credentialId,
        envelope: credential.envelope,
      })
      return createClient({
        config: { baseUrl, timeoutMilliseconds: config.timeoutMilliseconds, token: apiToken },
      })
    } catch {
      return 'credential_unreadable'
    }
  }

  return {
    fetchDocument: async ({
      credential,
      kind,
      providerDocumentId,
    }): Promise<NfseDocumentFetchFacts> => {
      const client = await resolveClient(credential)
      if (typeof client === 'string') return { cause: client, status: 'error' }

      try {
        const outcome = await client.fetchDocument({ kind, providerDocumentId })
        if (outcome.status === 'ok') {
          return { bytes: outcome.bytes, contentType: outcome.contentType, status: 'ok' }
        }
        /** Recusa da prefeitura sobre o documento é falta de bytes, não fato fiscal novo. */
        return {
          cause: outcome.status === 'rejected' ? 'unexpected_status' : outcome.cause,
          status: 'error',
        }
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    fetchStatus: async ({ credential, providerDocumentId }): Promise<NfseProviderStatusFacts> => {
      const client = await resolveClient(credential)
      if (typeof client === 'string') return { cause: client, status: 'error' }

      try {
        return await client.fetchStatus({ providerDocumentId })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },
  }
}
