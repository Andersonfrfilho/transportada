/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { verifyWebhookSignature } from '@adatechnology/meta-whatsapp-module'

import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import { API_PUBLIC_WHATSAPP_WEBHOOK_PATH } from '../../shared/api.constant.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { MetaWhatsAppModuleResolver } from '../application/meta-whatsapp-module.resolver.js'

const OK_STATUS = 200
const FORBIDDEN_STATUS = 403
const SIGNATURE_HEADER = 'x-hub-signature-256'

/**
 * A Meta desativa webhook que responde erro, então **quase tudo responde 200**. A exceção é a
 * assinatura: corpo não assinado ou assinado com outro segredo não é a Meta, e responder 200 a ele
 * ensinaria um atacante que o endereço aceita qualquer coisa.
 */
const OK_RESPONSE = () => new Response('EVENT_RECEIVED', { status: OK_STATUS })

type WhatsAppWebhookInput = {
  readonly challenge: string | null
  readonly mode: string | null
  readonly rawBody: string
  readonly signature: string | null
  readonly token: string | null
}

type CreateWhatsAppWebhookRoutesParams = {
  readonly appSecret: string | undefined
  readonly logger: ApiLogger
  readonly resolver: MetaWhatsAppModuleResolver
  readonly verifyToken: string | undefined
}

/**
 * Spec 062 T006 — **o webhook assinado, e fail-closed por ausência de segredo.**
 *
 * Sem `WHATSAPP_APP_SECRET` e `WHATSAPP_WEBHOOK_VERIFY_TOKEN` a rota **não é registrada** — mesmo
 * espírito do callback da NFS-e (ADR-0022). Publicar o endereço e conferir o segredo "quando ele
 * existir" transformaria a configuração faltando numa porta aberta, e a falha ficaria invisível: a
 * Meta não reclama de um webhook que responde 200 a tudo.
 *
 * ⚠️ **Nada de conteúdo de mensagem em log, em nenhum nível** (`security.md` §1): o que sai daqui é
 * `companyId`, contagem de eventos e o motivo da recusa. O corpo cru fica na memória da requisição e
 * morre com ela.
 */
export function createWhatsAppWebhookRoutes({
  appSecret,
  logger,
  resolver,
  verifyToken,
}: CreateWhatsAppWebhookRoutesParams): readonly RegisteredAnonymousRoute[] {
  if (appSecret === undefined || verifyToken === undefined) return []

  return [
    /**
     * O `GET` da Meta na assinatura do webhook: ela manda `hub.verify_token` e espera o
     * `hub.challenge` de volta **em texto puro**. A comparação é em tempo constante dentro do
     * pacote — comparar com `===` deixaria descobrir o token caractere a caractere pelo tempo de
     * resposta.
     */
    defineAnonymousRoute<WhatsAppWebhookInput>({
      async handle({ input }): Promise<Response> {
        if (input.mode !== 'subscribe' || input.token === null || input.challenge === null) {
          return new Response(null, { status: FORBIDDEN_STATUS })
        }
        if (!timingSafeEquals(input.token, verifyToken)) {
          logger.warn('whatsapp.webhook.challenge_rejected')

          return new Response(null, { status: FORBIDDEN_STATUS })
        }

        return new Response(input.challenge, { status: OK_STATUS })
      },
      method: 'GET',
      parse({ request }): WhatsAppWebhookInput {
        const query = new URL(request.url).searchParams

        return {
          challenge: query.get('hub.challenge'),
          mode: query.get('hub.mode'),
          rawBody: '',
          signature: null,
          token: query.get('hub.verify_token'),
        }
      },
      pathname: API_PUBLIC_WHATSAPP_WEBHOOK_PATH,
      /** A Meta reenvia em rajada quando uma entrega demora; o teto é generoso e existe pelo abuso. */
      rateLimit: { maxRequests: 60, windowMs: 60_000 },
    }),
    defineAnonymousRoute<WhatsAppWebhookInput>({
      async handle({ correlationId, input }): Promise<Response> {
        /**
         * ⚠️ **A assinatura é conferida antes de o corpo ser lido como dado.** Só depois dela o
         * `phone_number_id` vira a empresa — descobrir o tenant a partir de corpo não verificado
         * deixaria um atacante escolher contra qual empresa a entrega forjada é contada.
         */
        try {
          verifyWebhookSignature({
            appSecret,
            rawBody: input.rawBody,
            signatureHeader: input.signature,
          })
        } catch {
          logger.warn('whatsapp.webhook.signature_rejected', { correlationId })

          return new Response(null, { status: FORBIDDEN_STATUS })
        }

        const phoneNumberId = readPhoneNumberId(input.rawBody)
        if (phoneNumberId === undefined) {
          /** Corpo assinado por nós e sem número é evento de conta que não sabemos ler: 200 e segue. */
          logger.info('whatsapp.webhook.without_phone_number', { correlationId })

          return OK_RESPONSE()
        }

        const resolved = await resolver.resolveByPhoneNumberId(phoneNumberId)
        if (resolved === undefined) {
          /**
           * Número que a instalação não conhece. Não é erro nosso — pode ser outro número da mesma
           * WABA —, e responder erro faria a Meta desativar o webhook de todos os outros.
           */
          logger.info('whatsapp.webhook.unknown_number', { correlationId })

          return OK_RESPONSE()
        }

        const result = await resolved.module.webhook.receive.execute({
          companyId: resolved.companyId,
          rawBody: input.rawBody,
          signatureHeader: input.signature,
        })

        logger.info('whatsapp.webhook.received', {
          companyId: resolved.companyId,
          correlationId,
          duplicate: result.duplicate,
          messages: result.messagesProcessed,
          statuses: result.statusesProcessed,
        })

        return OK_RESPONSE()
      },
      method: 'POST',
      /**
       * O corpo **cru**, byte a byte como chegou: reserializar o JSON muda espaçamento e ordem, e a
       * assinatura deixa de bater. É por isso que este `parse` não usa o schema de corpo do router.
       */
      async parse({ request }): Promise<WhatsAppWebhookInput> {
        return {
          challenge: null,
          mode: null,
          rawBody: await request.text(),
          signature: request.headers.get(SIGNATURE_HEADER),
          token: null,
        }
      },
      pathname: API_PUBLIC_WHATSAPP_WEBHOOK_PATH,
      rateLimit: { maxRequests: 600, windowMs: 60_000 },
    }),
  ]
}

/**
 * O único campo que se lê do corpo antes de o módulo assumir. Corpo torto não é exceção: a rota já
 * provou que ele veio da Meta, e um `JSON.parse` que estoura aqui viraria 500 numa rota que promete
 * 200.
 */
function readPhoneNumberId(rawBody: string): string | undefined {
  try {
    const body: unknown = JSON.parse(rawBody)
    const entries = (body as { entry?: unknown }).entry
    if (!Array.isArray(entries)) return undefined

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown }).changes
      if (!Array.isArray(changes)) continue
      for (const change of changes) {
        const metadata = (change as { value?: { metadata?: { phone_number_id?: unknown } } }).value
          ?.metadata
        if (typeof metadata?.phone_number_id === 'string') return metadata.phone_number_id
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

/** Comparação de segredo sempre por digest de tamanho fixo (`security.md` §2). */
function timingSafeEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder()
  const leftDigest = Bun.CryptoHasher.hash('sha256', encoder.encode(left))
  const rightDigest = Bun.CryptoHasher.hash('sha256', encoder.encode(right))

  return Bun.deepEquals(new Uint8Array(leftDigest), new Uint8Array(rightDigest))
}
