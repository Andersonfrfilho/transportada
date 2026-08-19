/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type {
  NfseCancellationMotive,
  NfseFiscalEnvironment,
} from '../../database/nfse-issuance-execution.schema.js'
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
 * Os nomes de campo do RPS saem da coleção oficial da v2 (`API Nota RP (v2).postman_collection.json`
 * + `changelog (v2).md`), não mais de inferência — ver a Fase A2 de
 * `specs/040-nota-rp-autenticada/tasks.md`, que lista as oito divergências que a coleção desfez.
 */

/** São Paulo, e não UTC: às 23h daqui o instante já é o dia seguinte lá, e a competência viraria. */
const EMISSION_TIME_ZONE = 'America/Sao_Paulo'

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
    /**
     * Opcional porque payload congelado antes do endereço existir não pode virar `invalid_payload`:
     * isso trocaria a recusa da prefeitura — a causa real — por um defeito nosso no diagnóstico.
     */
    address: z
      .object({
        city: z.string().min(1),
        complement: z.string(),
        district: z.string().min(1),
        number: z.string().min(1),
        phone: z.string(),
        postalCode: z.string().min(1),
        state: z.string().min(1),
        street: z.string().min(1),
      })
      .optional(),
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
  /**
   * Origem pública da API, de onde sai a `CallbackUrl` obrigatória da v2. Sem ela não há emissão:
   * o provedor recusa o pedido, e insistir gastaria tentativa por defeito de configuração.
   */
  readonly callbackBaseUrl: string | undefined
  readonly timeoutMilliseconds: number
}

export type NfseFiscalGateway = {
  /** O motivo é o **código** da prefeitura, nunca o texto do operador — ver `NFSE_CANCELLATION_MOTIVES`. */
  cancel(input: {
    readonly cancellationMotive: NfseCancellationMotive
    readonly credential: NfseCredentialAccess
    readonly providerDocumentId: string
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
    readonly credential: NfseCredentialAccess
    readonly payload: unknown
  }): Promise<NfseGatewayIssueOutcome>
}

export function createNfseFiscalGateway(dependencies: {
  readonly clock?: () => Date
  readonly config: NfseFiscalGatewayConfig
  readonly createClient?: (input: { readonly config: NotaRpV2Config }) => NotaRpV2Client
  readonly fetch: NotaRpFetch
  readonly secretService: NfseCredentialSecretService
}): NfseFiscalGateway {
  const { config, fetch, secretService } = dependencies
  const clock = dependencies.clock ?? ((): Date => new Date())
  const createClient =
    dependencies.createClient ?? ((input) => createNotaRpV2Client({ config: input.config, fetch }))

  async function resolveClient(
    credential: NfseCredentialAccess,
  ): Promise<ResolvedClient | 'credential_unreadable' | 'provider_not_configured'> {
    const { baseUrl } = config
    /** Sem endereço não há a quem pedir — e o segredo continua selado. */
    if (baseUrl === undefined || baseUrl === '') return 'provider_not_configured'

    try {
      const { apiToken, callbackToken } = await secretService.decrypt({
        companyId: credential.companyId,
        credentialId: credential.credentialId,
        envelope: credential.envelope,
      })
      const client = createClient({
        config: {
          baseUrl,
          callbackToken,
          municipalRegistration: credential.municipalRegistration,
          timeoutMilliseconds: config.timeoutMilliseconds,
          token: apiToken,
        },
      })
      return { callbackToken, client }
    } catch {
      return 'credential_unreadable'
    }
  }

  return {
    cancel: async ({ cancellationMotive, credential, providerDocumentId }) => {
      const resolved = await resolveClient(credential)
      if (typeof resolved === 'string') return { cause: resolved, status: 'error' }
      try {
        return await resolved.client.cancel({ cancellationMotive, providerDocumentId })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    fetchDocument: async ({ credential, kind, providerDocumentId }) => {
      const resolved = await resolveClient(credential)
      if (typeof resolved === 'string') return { cause: resolved, status: 'error' }
      try {
        return await resolved.client.fetchDocument({ kind, providerDocumentId })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    fetchStatus: async ({ credential, providerDocumentId }) => {
      const resolved = await resolveClient(credential)
      if (typeof resolved === 'string') return { cause: resolved, status: 'error' }
      try {
        return await resolved.client.fetchStatus({ providerDocumentId })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },

    issue: async ({ credential, payload }) => {
      const parsed = payloadSchema.safeParse(payload)
      if (!parsed.success) return { cause: 'invalid_payload', status: 'error' }

      const { callbackBaseUrl } = config
      /** Sem endereço de retorno o pedido não é aceito — e o segredo continua selado. */
      if (callbackBaseUrl === undefined || callbackBaseUrl === '') {
        return { cause: 'provider_not_configured', status: 'error' }
      }

      const resolved = await resolveClient(credential)
      if (typeof resolved === 'string') return { cause: resolved, status: 'error' }
      try {
        return await resolved.client.issue({
          rps: buildRps({
            ...parsed.data,
            callbackUrl: buildCallbackUrl({
              baseUrl: callbackBaseUrl,
              token: resolved.callbackToken,
            }),
            issuedOn: clock(),
          }),
        })
      } catch {
        return { cause: 'transport_failure', status: 'error' }
      }
    },
  }
}

type ResolvedClient = {
  readonly callbackToken: string
  readonly client: NotaRpV2Client
}

/**
 * Cópia por valor do `API_PUBLIC_NFSE_CALLBACKS_PATH` da API (`shared/api.constant.ts`), sem o
 * `:token`: as duas apps não importam código uma da outra, e uma URL montada com outro caminho
 * levaria o postback do provedor a um 404 que só apareceria com a nota já emitida.
 */
const CALLBACK_PATH = '/public/nfse-callbacks'

function buildCallbackUrl(input: { readonly baseUrl: string; readonly token: string }): string {
  return `${input.baseUrl.replace(/\/+$/u, '')}${CALLBACK_PATH}/${input.token}`
}

type FrozenPayload = z.infer<typeof payloadSchema>

/**
 * As notas de origem não vão em lista separada: elas já estão dentro da `Discriminacao`, montada
 * pelo `nfse-description.service.ts` e aprovada na prévia. Duas fontes do mesmo fato seria a
 * primeira a divergir.
 */
function buildRps(
  input: FrozenPayload & { readonly callbackUrl: string; readonly issuedOn: Date },
): Readonly<Record<string, unknown>> {
  return {
    Aliquota: input.issRate,
    CallbackUrl: input.callbackUrl,
    CodigoCnae: input.cnaeCode,
    CodigoMunicipio: input.municipalityIbgeCode,
    CpfCnpj: input.taker.taxId,
    DataEmissao: formatEmissionDate(input.issuedOn),
    Discriminacao: input.description,
    /** O provedor não tem o e-mail do tomador nesta emissão; pedir o envio seria pedir no vazio. */
    EnviarEmail: false,
    // Sigla em caixa alta, como no XSD da ABRASF 2.04: `ExigibilidadeIss` chega como campo
    // desconhecido e a prefeitura rejeita pedindo o campo que nós julgávamos ter mandado.
    ExigibilidadeISS: input.issExigibility,
    IssRetido: input.issWithheld,
    ItemListaServico: toServiceListItemCode(input.serviceListItem),
    RazaoSocial: input.taker.legalName,
    /**
     * O ISS não vai no pedido: o provedor o calcula de `ValorServicos` × `Aliquota`, e o contrato
     * oficial não tem `ValorIss`. Mandá-lo era abrir uma segunda fonte para o mesmo número.
     */
    ValorServicos: input.serviceAmount,
    _exterior: false,
    ...(input.municipalTaxationCode.length === 0
      ? {}
      : { CodigoTributacaoMunicipio: input.municipalTaxationCode }),
    ...(input.nbsCode.length === 0 ? {} : { CodigoNbs: input.nbsCode }),
    ...buildTakerAddressFields(input.taker.address),
  }
}

/**
 * O endereço do tomador é condição da emissão: sem ele a prefeitura recusa a nota inteira com
 * `É necessário informar o endereço completo do cliente`, e a recusa chega assíncrona, com a nota
 * já criada. Complemento e telefone são os únicos opcionais do contrato da v2, e vazios não viajam
 * — campo em branco não é a mesma coisa que campo ausente.
 */
function buildTakerAddressFields(
  address: FrozenPayload['taker']['address'],
): Readonly<Record<string, unknown>> {
  if (address === undefined) return {}

  return {
    Bairro: address.district,
    Cep: address.postalCode,
    /** Nome da cidade e sigla da UF, como em `cadastro.localizacao` da coleção — não códigos IBGE. */
    Cidade: address.city,
    Endereco: address.street,
    Estado: address.state,
    Numero: address.number,
    ...(address.complement.length === 0 ? {} : { Complemento: address.complement }),
    ...(address.phone.length === 0 ? {} : { Telefone: address.phone }),
  }
}

/**
 * O item da lista de serviço viaja como **código**, sem a formatação `00.00` que a v2 passou a usar
 * só no texto de descrição: `16.02` é `1602`, `01.03` é `103` (`changelog (v2).md`).
 */
function toServiceListItemCode(value: string): string {
  return value.replace(/\D/gu, '').replace(/^0+(?=\d)/u, '')
}

/** `dd/mm/aaaa`, o formato do campo na coleção oficial. */
function formatEmissionDate(issuedOn: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: EMISSION_TIME_ZONE,
    year: 'numeric',
  }).format(issuedOn)
}
