/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3 (RF3): o envio do boleto ao cliente pelo Evolution da empresa, no worker — a entrega automática da
 * resposta da contratante por e-mail nasce aqui. Mesmo desenho do gateway da API (`evolution-document-sender.gateway.ts`,
 * spec 281 T5): a chave da instância é aberta por chamada e só vive dentro dela; nada daqui vai a log. O erro do
 * provedor vira o motivo fechado (`failure`) que o despacho grava na entrega:
 *
 * - `400`: o Evolution recusa o número (não tem WhatsApp) → `number_not_found`;
 * - `401`/`403`/`404`, rede ou tempo esgotado: a instância não está lá para falar → `disconnected`;
 * - o resto (`5xx`, resposta estranha) → `failed`.
 *
 * ⚠️ O AAD é palavra por palavra o da API (`whatsapp-evolution-secret.service.ts`): divergiu, o envelope não abre.
 * Aqui só existe `decrypt`: quem sela a chave é a API, na rota de configuração.
 */
import {
  EvolutionError,
  EvolutionWhatsAppChannel,
} from '@adatechnology/evolution-whatsapp-provider'
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { sql, type SQL } from 'drizzle-orm'

import type { ContractorReplyClientWhatsAppSender } from '../../occurrence-conversation/infrastructure/contractor-reply-client-whatsapp-forward.support.js'

/** O envio de um arquivo pode levar mais que o padrão de 15 s do SDK: o Evolution sobe o PDF ao WhatsApp antes de responder. */
const SEND_TIMEOUT_MS = 60_000
const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

type SendFailure = 'disconnected' | 'failed' | 'number_not_found'

export class EvolutionClientDocumentSendError extends Error {
  public constructor(public readonly failure: SendFailure) {
    super(`Evolution send failed: ${failure}`)
    this.name = 'EvolutionClientDocumentSendError'
  }
}

type Runner = { execute(query: SQL): PromiseLike<unknown> }

export function createEvolutionClientDocumentSender(dependencies: {
  readonly envelopeProvider: SecretEnvelopeProvider
  readonly fetch?: typeof fetch
  readonly runner: Runner
}): ContractorReplyClientWhatsAppSender {
  async function decrypt(params: {
    readonly companyId: string
    readonly envelope: unknown
    readonly settingsId: string
  }): Promise<string> {
    const additionalAuthenticatedData = TEXT_ENCODER.encode(
      `transportada:whatsapp-evolution:v1:${params.companyId}:${params.settingsId}`,
    )
    let plaintext: Uint8Array | undefined
    try {
      plaintext = await dependencies.envelopeProvider.decrypt({
        additionalAuthenticatedData,
        envelope: params.envelope as SecretEnvelopeV1,
      })
      const secret: unknown = JSON.parse(TEXT_DECODER.decode(plaintext))
      const apiKey = (secret as { apiKey?: unknown } | null)?.apiKey
      if (typeof apiKey !== 'string' || apiKey === '') throw new Error('Malformed Evolution secret')
      return apiKey
    } catch {
      throw new EvolutionClientDocumentSendError('disconnected')
    } finally {
      plaintext?.fill(0)
      additionalAuthenticatedData.fill(0)
    }
  }

  async function open(companyId: string): Promise<EvolutionWhatsAppChannel> {
    const rows = (await dependencies.runner.execute(
      sql`select id, base_url, instance_name, status, secret_envelope
          from whatsapp_evolution_settings where company_id = ${companyId}::uuid`,
    )) as readonly Record<string, unknown>[]
    const [row] = rows
    if (
      row === undefined ||
      row.status !== 'active' ||
      typeof row.id !== 'string' ||
      typeof row.base_url !== 'string' ||
      typeof row.instance_name !== 'string'
    ) {
      throw new EvolutionClientDocumentSendError('disconnected')
    }
    const apiKey = await decrypt({ companyId, envelope: row.secret_envelope, settingsId: row.id })
    return new EvolutionWhatsAppChannel({
      apiKey,
      baseUrl: row.base_url,
      instance: row.instance_name,
      timeoutMs: SEND_TIMEOUT_MS,
      ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
    })
  }

  return {
    async isConnected({ companyId }) {
      const channel = await open(companyId)
      return (await channel.getConnectionState()) === 'open'
    },

    async sendDocument(params) {
      const channel = await open(params.companyId)
      try {
        const sent = await channel.sendMedia({
          buffer: Buffer.from(params.bytes),
          caption: params.caption,
          filename: params.fileName,
          mimeType: params.mimeType,
          to: params.number,
        })
        return { providerMessageId: sent.externalMessageId }
      } catch (error) {
        throw new EvolutionClientDocumentSendError(classify(error))
      }
    },
  }
}

function classify(error: unknown): SendFailure {
  if (!(error instanceof EvolutionError)) return 'failed'
  const status = error.statusCode
  if (status === 400) return 'number_not_found'
  if (status === undefined || status === 401 || status === 403 || status === 404) {
    return 'disconnected'
  }
  return 'failed'
}
