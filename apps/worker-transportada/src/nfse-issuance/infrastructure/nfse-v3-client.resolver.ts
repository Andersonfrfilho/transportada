/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseCredentialSecretService } from '../application/nfse-credential-secret.service.js'
import type { NotaRpFetch } from './nota-rp-v2.client.js'
import { createNotaRpV3Client } from './nota-rp-v3.client.js'
import type { NotaRpV3Client, NotaRpV3Config } from './nota-rp-v3.types.js'

export type NfseV3Credential = {
  readonly companyId: string
  readonly credentialId: string
  readonly envelope: unknown
  readonly municipalRegistration: string
  readonly taxId: string
}

export type NfseV3ClientResolution =
  | NotaRpV3Client
  | 'credential_unreadable'
  | 'provider_not_configured'

export type NfseV3ClientResolver = {
  resolve(credential: NfseV3Credential): Promise<NfseV3ClientResolution>
}

/**
 * Abre o envelope e monta o cliente v3 para uma operação. O `fetch` recebido é o do limitador
 * compartilhado do composition root: a Nota RP v3 limita a taxa por CNPJ, e dois gateways com
 * limitadores próprios somariam as chamadas.
 */
export function createNfseV3ClientResolver(dependencies: {
  readonly callbackBaseUrl: string | undefined
  readonly baseUrl: string | undefined
  readonly clock: () => Date
  readonly createClient?: (input: { readonly config: NotaRpV3Config }) => NotaRpV3Client
  readonly fetch: NotaRpFetch
  readonly secretService: NfseCredentialSecretService
  readonly timeoutMilliseconds: number
}): NfseV3ClientResolver {
  const { baseUrl, clock, secretService } = dependencies
  const createClient =
    dependencies.createClient ??
    ((input) => createNotaRpV3Client({ clock, config: input.config, fetch: dependencies.fetch }))

  return {
    resolve: async (credential) => {
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
            callbackBaseUrl: dependencies.callbackBaseUrl ?? '',
            callbackToken,
            municipalRegistration: credential.municipalRegistration,
            taxId: credential.taxId,
            timeoutMilliseconds: dependencies.timeoutMilliseconds,
            token: apiToken,
          },
        })
      } catch {
        return 'credential_unreadable'
      }
    },
  }
}
