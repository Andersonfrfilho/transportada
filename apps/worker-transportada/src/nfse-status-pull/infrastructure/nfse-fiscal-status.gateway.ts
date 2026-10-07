/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A borda de consulta do trilho de reconciliação. Duas responsabilidades, e só elas:
 *
 * 1. **Abrir o token** do envelope selado, uma vez por chamada — sem endereço configurado o segredo
 *    nem chega a ser aberto.
 * 2. **Nenhuma exceção escapa.** Exceção aqui derrubaria o ciclo inteiro por causa de uma nota.
 *
 * O cliente é o mesmo da emissão (`nfse-issuance/infrastructure/nota-rp-v2.client.ts`): dentro de
 * uma app não há fronteira que justifique cópia, e um segundo cliente faria as duas metades do
 * trilho discordarem do vocabulário da Nota RP.
 */
import type { NfseCredentialSecretService } from '../../nfse-issuance/application/nfse-credential-secret.service.js'
import {
  createNfseV3ClientResolver,
  type NfseV3ClientResolver,
} from '../../nfse-issuance/infrastructure/nfse-v3-client.resolver.js'
import {
  createNotaRpV2Client,
  type NotaRpFetch,
  type NotaRpStatusOutcome,
  type NotaRpV2Client,
  type NotaRpV2Config,
} from '../../nfse-issuance/infrastructure/nota-rp-v2.client.js'
import type {
  NotaRpV3Client,
  NotaRpV3Config,
} from '../../nfse-issuance/infrastructure/nota-rp-v3.types.js'
import type {
  NfseCredentialAccess,
  NfseDocumentFetchFacts,
  NfseStatusPort,
} from '../application/nfse-fiscal-status.port.js'
import type { NfseProviderApiVersion } from '../../nfse-issuance/domain/nfse-provider-api-version.policy.js'
import type { NfseProviderStatusFacts } from '../domain/nfse-reconciliation-outcome.policy.js'

export type NfseFiscalStatusGatewayConfig = {
  readonly baseUrl: string | undefined
  /** A consulta não usa; chega porque a config do provedor é uma só. */
  readonly callbackBaseUrl?: string | undefined
  readonly timeoutMilliseconds: number
}

/** Os dois clientes têm o mesmo contrato de consulta e de documento. */
type NotaRpClient = Pick<NotaRpV2Client, 'fetchDocument' | 'fetchStatus'>

/** O cliente é discriminado por `status`; a consulta chega plana. A tradução é aqui, e é total. */
function toStatusFacts(outcome: NotaRpStatusOutcome): NfseProviderStatusFacts {
  if (outcome.status === 'authorized') {
    return outcome.document === undefined
      ? { status: 'authorized' }
      : { document: outcome.document, status: 'authorized' }
  }
  if (outcome.status === 'cancelled') {
    return outcome.cancelledAt === undefined
      ? { status: 'cancelled' }
      : { cancelledAt: outcome.cancelledAt, status: 'cancelled' }
  }
  if (outcome.status === 'rejected') {
    return outcome.rejection === undefined
      ? { status: 'rejected' }
      : { rejection: outcome.rejection, status: 'rejected' }
  }
  if (outcome.status === 'pending') return { status: 'pending' }
  return outcome.cause === undefined
    ? { status: 'error' }
    : { cause: outcome.cause, status: 'error' }
}

export function createNfseFiscalStatusGateway(dependencies: {
  readonly config: NfseFiscalStatusGatewayConfig
  readonly createClient?: (input: { readonly config: NotaRpV2Config }) => NotaRpV2Client
  readonly createV3Client?: (input: { readonly config: NotaRpV3Config }) => NotaRpV3Client
  readonly fetch: NotaRpFetch
  readonly secretService: NfseCredentialSecretService
  /** O fetch com o limitador compartilhado; só a v3 o usa. Sem ele, cai no `fetch` cru. */
  readonly v3Fetch?: NotaRpFetch
}): NfseStatusPort {
  const { config, fetch, secretService } = dependencies
  const createClient =
    dependencies.createClient ?? ((input) => createNotaRpV2Client({ config: input.config, fetch }))
  const v3Resolver = createNfseV3ClientResolver({
    baseUrl: config.baseUrl,
    callbackBaseUrl: config.callbackBaseUrl,
    clock: () => new Date(),
    ...(dependencies.createV3Client === undefined
      ? {}
      : { createClient: dependencies.createV3Client }),
    fetch: dependencies.v3Fetch ?? fetch,
    secretService,
    timeoutMilliseconds: config.timeoutMilliseconds,
  })

  async function resolveClient(input: {
    readonly credential: NfseCredentialAccess
    readonly providerApiVersion: NfseProviderApiVersion
    readonly resolver: NfseV3ClientResolver
  }): Promise<NotaRpClient | 'credential_unreadable' | 'provider_not_configured'> {
    const { credential } = input
    if (input.providerApiVersion === 'v3') return input.resolver.resolve(credential)
    const { baseUrl } = config
    /** Sem endereço não há a quem pedir — e o segredo continua selado. */
    if (baseUrl === undefined || baseUrl === '') return 'provider_not_configured'

    try {
      const { apiToken, callbackToken } = await secretService.decrypt({
        companyId: credential.companyId,
        credentialId: credential.credentialId,
        envelope: credential.envelope,
      })
      return createClient({
        config: {
          baseUrl,
          /** Aqui ele não autentica nada: chega para ser redigido de qualquer mensagem de erro. */
          callbackToken,
          municipalRegistration: credential.municipalRegistration,
          timeoutMilliseconds: config.timeoutMilliseconds,
          token: apiToken,
        },
      })
    } catch {
      return 'credential_unreadable'
    }
  }

  return {
    fetchDocument: async ({
      credential,
      kind,
      providerApiVersion,
      providerDocumentId,
    }): Promise<NfseDocumentFetchFacts> => {
      const client = await resolveClient({ credential, resolver: v3Resolver, providerApiVersion })
      if (typeof client === 'string') return { cause: client, status: 'error' }

      try {
        const outcome = await client.fetchDocument({ kind, providerDocumentId })
        if (outcome.status === 'ok' && outcome.bytes !== undefined) {
          return {
            bytes: outcome.bytes,
            contentType: outcome.contentType ?? '',
            status: 'ok',
          }
        }
        /** Recusa da prefeitura sobre o documento é falta de bytes, não fato fiscal novo. */
        if (outcome.status === 'rejected') return { cause: 'unexpected_status', status: 'error' }
        return { cause: outcome.cause ?? 'malformed_response', status: 'error' }
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    fetchStatus: async ({
      credential,
      providerApiVersion,
      providerDocumentId,
    }): Promise<NfseProviderStatusFacts> => {
      const client = await resolveClient({ credential, resolver: v3Resolver, providerApiVersion })
      if (typeof client === 'string') return { cause: client, status: 'error' }

      try {
        return toStatusFacts(await client.fetchStatus({ providerDocumentId }))
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },
  }
}
