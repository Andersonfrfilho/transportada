/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { NfseFiscalEnvironment } from '../../database/nfse-issuance-execution.schema.js'
import type { NfseCredentialSecretService } from '../application/nfse-credential-secret.service.js'
import {
  createNotaRpV2Client,
  type NotaRpCancelOutcome,
  type NotaRpCause,
  type NotaRpDocumentKind,
  type NotaRpDocumentOutcome,
  type NotaRpFetch,
  type NotaRpIssueOutcome,
  type NotaRpRejection,
  type NotaRpStatusOutcome,
  type NotaRpV2Client,
  type NotaRpV2Config,
} from './nota-rp-v2.client.js'

/**
 * A porta que o consumidor enxerga. Três responsabilidades, e só elas:
 *
 * 1. **Abrir o token** do envelope selado, uma vez por operação, zerando o plaintext depois — a
 *    vida do segredo em memória fica limitada a uma chamada.
 * 2. **Traduzir o payload congelado** para o vocabulário de fio da v2. O payload é o que a empresa
 *    aprovou na prévia; ele nunca é recalculado aqui, só renomeado.
 * 3. **Nenhuma exceção escapa** — nem do cliente, nem da abertura do segredo, nem da tradução.
 *    Exceção aqui derrubaria o consumidor antes do `markProcessed`.
 *
 * Os nomes de campo do RPS são **inferidos** (ABRASF/Nota RP), como o resto do vocabulário de fio —
 * ver `## T019` e `## T020` em `specs/032-nota-de-servico-municipal/evidence.md`. O T030 mede contra
 * a API real; o acerto é nesta função só.
 */

const ISS_WITHHELD = { no: '2', yes: '1' } as const

const payloadSchema = z.object({
  cnaeCode: z.string(),
  description: z.string().min(1),
  issAmount: z.string().min(1),
  issExigibility: z.string().min(1),
  issRate: z.string().min(1),
  issWithheld: z.boolean(),
  municipalityIbgeCode: z.string().min(1),
  municipalTaxationCode: z.string(),
  nbsCode: z.string(),
  serviceAmount: z.string().min(1),
  serviceListItem: z.string().min(1),
  taker: z.object({
    legalName: z.string().min(1),
    taxId: z.string().min(1),
  }),
})

export type NfseGatewayCause =
  | NotaRpCause
  | 'credential_unreadable'
  | 'invalid_payload'
  | 'provider_not_configured'

export type NfseGatewayIssueOutcome = {
  readonly cause?: NfseGatewayCause
  readonly providerDocumentId?: string
  readonly rejection?: NotaRpRejection
  readonly status: NotaRpIssueOutcome['status']
}

export type NfseGatewayCancelOutcome = {
  readonly cause?: NfseGatewayCause
  readonly rejection?: NotaRpRejection
  readonly status: NotaRpCancelOutcome['status']
}

export type NfseGatewayStatusOutcome = Omit<NotaRpStatusOutcome, 'cause'> & {
  readonly cause?: NfseGatewayCause
}

export type NfseGatewayDocumentOutcome = Omit<NotaRpDocumentOutcome, 'cause'> & {
  readonly cause?: NfseGatewayCause
}

/** O que a linha da credencial dá ao gateway. O token continua selado até a chamada. */
export type NfseCredentialAccess = {
  readonly companyId: string
  readonly credentialId: string
  readonly envelope: unknown
  readonly fiscalEnvironment: NfseFiscalEnvironment
  /** Vai no `X-AUTH-IM`. Não é segredo — o segredo é o token, e ele continua selado. */
  readonly municipalRegistration: string
}

export type NfseFiscalGatewayConfig = {
  readonly baseUrl: string | undefined
  readonly timeoutMilliseconds: number
}

export type NfseFiscalGateway = {
  cancel(input: {
    readonly credential: NfseCredentialAccess
    readonly providerDocumentId: string
    readonly reason: string
  }): Promise<NfseGatewayCancelOutcome>
  fetchDocument(input: {
    readonly credential: NfseCredentialAccess
    readonly kind: NotaRpDocumentKind
    readonly providerDocumentId: string
  }): Promise<NfseGatewayDocumentOutcome>
  fetchStatus(input: {
    readonly credential: NfseCredentialAccess
    readonly providerDocumentId: string
  }): Promise<NfseGatewayStatusOutcome>
  issue(input: {
    readonly callbackUrl?: string
    readonly credential: NfseCredentialAccess
    readonly payload: unknown
  }): Promise<NfseGatewayIssueOutcome>
}

export function createNfseFiscalGateway(dependencies: {
  readonly config: NfseFiscalGatewayConfig
  readonly createClient?: (input: { readonly config: NotaRpV2Config }) => NotaRpV2Client
  readonly fetch: NotaRpFetch
  readonly secretService: NfseCredentialSecretService
}): NfseFiscalGateway {
  const { config, fetch, secretService } = dependencies
  const createClient =
    dependencies.createClient ?? ((input) => createNotaRpV2Client({ config: input.config, fetch }))

  async function resolveClient(
    credential: NfseCredentialAccess,
  ): Promise<NotaRpV2Client | 'credential_unreadable' | 'provider_not_configured'> {
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
        config: {
          baseUrl,
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
    cancel: async ({ credential, providerDocumentId, reason }) => {
      const client = await resolveClient(credential)
      if (typeof client === 'string') return { cause: client, status: 'error' }
      try {
        return await client.cancel({ providerDocumentId, reason })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    fetchDocument: async ({ credential, kind, providerDocumentId }) => {
      const client = await resolveClient(credential)
      if (typeof client === 'string') return { cause: client, status: 'error' }
      try {
        return await client.fetchDocument({ kind, providerDocumentId })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    fetchStatus: async ({ credential, providerDocumentId }) => {
      const client = await resolveClient(credential)
      if (typeof client === 'string') return { cause: client, status: 'error' }
      try {
        return await client.fetchStatus({ providerDocumentId })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    issue: async ({ callbackUrl, credential, payload }) => {
      const parsed = payloadSchema.safeParse(payload)
      if (!parsed.success) return { cause: 'invalid_payload', status: 'error' }

      const client = await resolveClient(credential)
      if (typeof client === 'string') return { cause: client, status: 'error' }
      try {
        return await client.issue({
          rps: buildRps({ ...(callbackUrl === undefined ? {} : { callbackUrl }), ...parsed.data }),
        })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },
  }
}

type FrozenPayload = z.infer<typeof payloadSchema>

/**
 * As notas de origem não vão em lista separada: elas já estão dentro da `Discriminacao`, montada
 * pelo `nfse-description.service.ts` e aprovada na prévia. Duas fontes do mesmo fato seria a
 * primeira a divergir.
 */
function buildRps(
  input: FrozenPayload & { readonly callbackUrl?: string },
): Readonly<Record<string, unknown>> {
  return {
    Aliquota: input.issRate,
    Cnae: input.cnaeCode,
    CodigoMunicipio: input.municipalityIbgeCode,
    Discriminacao: input.description,
    ExigibilidadeIss: input.issExigibility,
    IssRetido: input.issWithheld ? ISS_WITHHELD.yes : ISS_WITHHELD.no,
    ItemListaServico: input.serviceListItem,
    TomadorCnpjCpf: input.taker.taxId,
    TomadorRazaoSocial: input.taker.legalName,
    ValorIss: input.issAmount,
    ValorServicos: input.serviceAmount,
    ...(input.callbackUrl === undefined ? {} : { CallbackUrl: input.callbackUrl }),
    ...(input.municipalTaxationCode.length === 0
      ? {}
      : { CodigoTributacaoMunicipio: input.municipalTaxationCode }),
    ...(input.nbsCode.length === 0 ? {} : { CodigoNbs: input.nbsCode }),
  }
}
